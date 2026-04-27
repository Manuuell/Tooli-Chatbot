import { chromium, Browser, Page } from 'playwright';
import { createWorker } from 'tesseract.js';
import OpenAI from 'openai';
import { promises as fs } from 'fs';
import path from 'path';
import { config } from '../config';

const PORTAL_URL = 'https://iceberg-niif.utb.edu.co/iceberg-pf/';
const DEBUG_DIR = '/tmp/iceberg';
const MAX_CAPTCHA_RETRIES = 5;

export interface IcebergLoginResult {
  ok: boolean;
  error?: string;
  /** Buffer del PDF del recibo de matrícula, si llegamos a descargarlo */
  pdf?: Buffer;
  /** Captchas que se intentaron resolver (para debug) */
  captchaAttempts?: Array<{ solver: 'openai' | 'tesseract'; text: string }>;
  /** Screenshots de cada paso (paths) cuando debug=true */
  debugFiles?: string[];
}

const openaiClient = config.openai.apiKey
  ? new OpenAI({ apiKey: config.openai.apiKey })
  : null;

/**
 * Resuelve captcha usando OpenAI GPT-4o-mini Vision (barato y rápido).
 * Acierta ~95%+ en captchas alfanuméricos con ruido moderado.
 */
async function solveCaptchaWithOpenAI(imageBuffer: Buffer): Promise<string | null> {
  if (!openaiClient) return null;

  try {
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 50,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'Esta imagen es un captcha alfanumérico (letras y números). ' +
                'Lee únicamente los caracteres principales, ignora líneas tachadas o ruido de fondo. ' +
                'Responde SOLO con los caracteres del captcha, sin espacios, sin explicación, sin puntuación.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (text) {
      return text.replace(/[^a-zA-Z0-9]/g, '').trim();
    }
  } catch (err: any) {
    console.error('[openai-ocr] error:', err?.message ?? err);
  }
  return null;
}

/**
 * Fallback OCR con Tesseract (gratis, ~60-70% accuracy en captchas con ruido).
 */
async function solveCaptchaWithTesseract(imageBuffer: Buffer): Promise<string> {
  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
  });
  const { data } = await worker.recognize(imageBuffer);
  await worker.terminate();
  return data.text.replace(/[^a-zA-Z0-9]/g, '').trim();
}

async function ensureDebugDir(): Promise<void> {
  await fs.mkdir(DEBUG_DIR, { recursive: true });
}

/**
 * Descarga la imagen del captcha actual del portal a través del contexto del navegador
 * (para mantener cookies/sesión).
 */
async function downloadCaptchaImage(page: Page): Promise<Buffer> {
  const captchaSrc = await page.$eval('img[src*="captcha"]', (el: any) => el.src);

  const buffer = await page.evaluate(async (src: string) => {
    const res = await fetch(src);
    const blob = await res.blob();
    const arrayBuffer = await blob.arrayBuffer();
    return Array.from(new Uint8Array(arrayBuffer));
  }, captchaSrc);

  return Buffer.from(buffer);
}

/**
 * Si hay un modal de error visible (ej: "Valores de Captcha Incorrectos!"),
 * lo cierra haciendo click en OK y devuelve true.
 */
async function dismissErrorModalIfPresent(page: Page): Promise<boolean> {
  const okButton = page.locator('div.z-window-modal button:has-text("OK"), div[id*="modal"] button:has-text("OK")').first();
  const isVisible = await okButton.isVisible().catch(() => false);
  if (isVisible) {
    await okButton.click().catch(() => {});
    await page.waitForTimeout(500);
    return true;
  }
  return false;
}

/**
 * Refresca el captcha haciendo click en el icono de recharge.
 */
async function refreshCaptcha(page: Page): Promise<void> {
  await page.click('img[src*="recharge"]').catch(() => {});
  await page.waitForTimeout(1500); // dar tiempo a que el nuevo captcha cargue
}

/**
 * Intenta hacer login en el portal Iceberg.
 */
export async function loginAndDownloadReceipt(
  codigo: string,
  cedula: string,
  options: { debug?: boolean; headless?: boolean } = {}
): Promise<IcebergLoginResult> {
  const debug = options.debug ?? false;
  const headless = options.headless ?? true;
  const debugFiles: string[] = [];
  const captchaAttempts: Array<{ solver: 'openai' | 'tesseract'; text: string }> = [];

  if (debug) await ensureDebugDir();

  const browser: Browser = await chromium.launch({
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      acceptDownloads: true,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    });
    const page: Page = await context.newPage();

    // 1. Cargar portal
    await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 30_000 });

    if (debug) {
      const p = path.join(DEBUG_DIR, '01-portal-loaded.png');
      await page.screenshot({ path: p, fullPage: true });
      debugFiles.push(p);
    }

    // 2. Llenar credenciales
    await page.locator('input[type="text"]').first().fill(codigo);
    await page.locator('input[type="password"]').fill(cedula);

    // 3. Loop de captcha
    let loggedIn = false;
    let lastError = '';

    for (let attempt = 1; attempt <= MAX_CAPTCHA_RETRIES; attempt++) {
      // Descargar imagen del captcha actual
      const captchaBuffer = await downloadCaptchaImage(page);

      if (debug) {
        const p = path.join(DEBUG_DIR, `03-captcha-attempt-${attempt}.jpeg`);
        await fs.writeFile(p, captchaBuffer);
        debugFiles.push(p);
      }

      // Intentar primero con OpenAI, fallback a Tesseract
      let captchaText: string | null = await solveCaptchaWithOpenAI(captchaBuffer);
      let solver: 'openai' | 'tesseract' = 'openai';

      if (!captchaText || captchaText.length < 4) {
        console.log(`[iceberg] OpenAI falló o vacío, fallback a Tesseract`);
        captchaText = await solveCaptchaWithTesseract(captchaBuffer);
        solver = 'tesseract';
      }

      captchaAttempts.push({ solver, text: captchaText });
      console.log(`[iceberg] intento ${attempt}: solver=${solver} text="${captchaText}"`);

      if (!captchaText || captchaText.length < 3) {
        lastError = `OCR devolvió texto muy corto`;
        await refreshCaptcha(page);
        continue;
      }

      // Llenar captcha y enviar
      const captchaInput = page.locator('input[placeholder*="Captcha"]');
      await captchaInput.fill('');
      await captchaInput.fill(captchaText);

      await page.locator('button:has-text("Ingresar")').first().click();
      await page.waitForTimeout(2500); // esperar respuesta del servidor

      if (debug) {
        const p = path.join(DEBUG_DIR, `04-after-attempt-${attempt}.png`);
        await page.screenshot({ path: p, fullPage: true });
        debugFiles.push(p);
      }

      // Detectar resultado
      const errorModalDismissed = await dismissErrorModalIfPresent(page);
      const stillSeesCaptcha = await page
        .locator('input[placeholder*="Captcha"]')
        .isVisible()
        .catch(() => false);

      if (errorModalDismissed || stillSeesCaptcha) {
        lastError = 'Captcha o credenciales incorrectos';
        // Limpiar campo captcha y refrescar imagen
        await captchaInput.fill('').catch(() => {});
        await refreshCaptcha(page);
        continue;
      }

      // Login exitoso
      loggedIn = true;
      break;
    }

    if (!loggedIn) {
      return {
        ok: false,
        error: `Login falló tras ${MAX_CAPTCHA_RETRIES} intentos. Último error: ${lastError}`,
        captchaAttempts,
        debugFiles,
      };
    }

    // 4. Login OK
    if (debug) {
      const p = path.join(DEBUG_DIR, '05-logged-in.png');
      await page.screenshot({ path: p, fullPage: true });
      debugFiles.push(p);
      await fs.writeFile(path.join(DEBUG_DIR, '05-logged-in.html'), await page.content());
    }

    // TODO: navegar a la sección de recibos y descargar el PDF de matrícula.
    // Por ahora devolvemos OK al login.
    return {
      ok: true,
      captchaAttempts,
      debugFiles,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message ?? 'unknown error',
      captchaAttempts,
      debugFiles,
    };
  } finally {
    await browser.close();
  }
}
