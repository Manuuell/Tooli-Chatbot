import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Consulta de NOTAS vía login SSO (Microsoft) automatizado con Playwright.
// Banner solo es accesible tras el SSO, así que abrimos un navegador headless,
// hacemos login con correo+contraseña del estudiante y, si aparece MFA, PAUSAMOS
// y pedimos el código por WhatsApp — manteniendo la MISMA sesión de navegador
// viva entre mensajes (Map por usuario, con timeout de limpieza).
//
// ⚠️ NO probado end-to-end (no hay credenciales para testear). Los selectores de
//    Microsoft, la navegación a la página de notas (GRADES_URL) y el tipo de MFA
//    pueden requerir ajuste. Las capturas en /tmp/tooli-notas ayudan a depurar.
//
// ⚠️ SEGURIDAD: la contraseña se usa de forma transitoria y NO se persiste. Esto
//    es aceptable solo por ser un bot personal; no reutilizar en un bot público.
// ─────────────────────────────────────────────────────────────────────────────

const BANNER_ENTRY = 'https://ssbprod.utb.edu.co:8443/PROD/twbkwbis.P_GenMenu?name=bmenu.P_MainMnu';
// TODO(verificar en vivo): página que lista las notas del período. Ajustar tras el 1er run.
const GRADES_URL = 'https://ssbprod.utb.edu.co:8443/PROD/bwskgrds.P_TermGrde';
const DEBUG_DIR = '/tmp/tooli-notas';
const SESSION_TTL_MS = 3 * 60_000;

export interface NotaCurso {
  titulo: string;
  notaFinal: string;
}
export type NotasLoginResult =
  | { status: 'ok'; cursos: NotaCurso[] }
  | { status: 'mfa'; prompt: string }
  | { status: 'error'; error: string };

interface LiveSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  timer: NodeJS.Timeout;
}
const sessions = new Map<string, LiveSession>();

async function closeSession(id: string): Promise<void> {
  const s = sessions.get(id);
  if (!s) return;
  clearTimeout(s.timer);
  sessions.delete(id);
  try {
    await s.browser.close();
  } catch {
    /* noop */
  }
}

const stripTags = (s: string) =>
  s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

async function snap(page: Page, name: string): Promise<void> {
  try {
    await fs.mkdir(DEBUG_DIR, { recursive: true });
    await page.screenshot({ path: path.join(DEBUG_DIR, `${name}.png`), fullPage: true });
  } catch {
    /* noop */
  }
}

async function classifyAfterPassword(page: Page): Promise<'mfa' | 'stay' | 'banner' | 'error' | 'unknown'> {
  if (/ssbprod\.utb\.edu\.co/i.test(page.url())) return 'banner';
  if (await page.locator('input[name="otc"], input#idTxtBx_SAOTCC_OTC').count()) return 'mfa';
  const content = await page.content();
  if ((await page.locator('#idSIButton9').count()) && /mantener|stay signed/i.test(content)) return 'stay';
  if (/incorrecta|no coincide|isn't correct|no pudimos/i.test(content)) return 'error';
  return 'unknown';
}

async function scrapeNotas(page: Page): Promise<NotaCurso[]> {
  await page.goto(GRADES_URL, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {});
  await snap(page, 'grades-page');
  const html = await page.content();

  // Parse best-effort: filas con un título de curso y una nota numérica.
  const cursos: NotaCurso[] = [];
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? []).map(stripTags).filter(Boolean);
    const nota = cells.find((c) => /^\d(\.\d{1,2})?$/.test(c));
    const titulo = cells.find((c) => c.length > 4 && /[a-záéíóúñ]/i.test(c));
    if (nota && titulo) cursos.push({ titulo, notaFinal: nota });
  }
  return cursos;
}

export async function startNotasLogin(id: string, email: string, password: string): Promise<NotasLoginResult> {
  await closeSession(id);
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await page.goto(BANNER_ENTRY, { waitUntil: 'networkidle', timeout: 40_000 });

    // Redirige a login.microsoftonline.com → correo → contraseña.
    await page.locator('input[type="email"], input[name="loginfmt"]').first().fill(email, { timeout: 20_000 });
    await page.locator('#idSIButton9, input[type="submit"]').first().click();
    await page.locator('input[type="password"], input[name="passwd"]').first().fill(password, { timeout: 20_000 });
    await page.locator('#idSIButton9, input[type="submit"]').first().click();
    await page.waitForTimeout(3000);
    await snap(page, 'after-password');

    const state = await classifyAfterPassword(page);

    if (state === 'mfa') {
      sessions.set(id, { browser, context, page, timer: setTimeout(() => closeSession(id), SESSION_TTL_MS) });
      return { status: 'mfa', prompt: 'Escribe el *código de verificación* (MFA) que te llegó por SMS o tu app.' };
    }
    if (state === 'error') {
      await browser.close();
      return { status: 'error', error: 'Correo o contraseña incorrectos.' };
    }
    if (state === 'stay') {
      await page.locator('#idSIButton9').first().click().catch(() => {});
      await page.waitForTimeout(2000);
    }

    const cursos = await scrapeNotas(page);
    await browser.close();
    return cursos.length
      ? { status: 'ok', cursos }
      : { status: 'error', error: 'Entré al portal pero no pude leer las notas (revisa /tmp/tooli-notas).' };
  } catch (e: any) {
    await snap(page, 'error');
    await browser.close();
    return { status: 'error', error: `Fallo en el login: ${e?.message ?? e}` };
  }
}

export async function submitNotasMfa(id: string, code: string): Promise<NotasLoginResult> {
  const s = sessions.get(id);
  if (!s) return { status: 'error', error: 'La sesión de login expiró. Vuelve a empezar desde el menú.' };
  const { page } = s;

  try {
    await page.locator('input[name="otc"], input#idTxtBx_SAOTCC_OTC').first().fill(code, { timeout: 15_000 });
    await page.locator('#idSubmit_SAOTCC_Continue, #idSIButton9, input[type="submit"]').first().click();
    await page.waitForTimeout(3000);

    if (/mantener|stay signed/i.test(await page.content())) {
      await page.locator('#idSIButton9').first().click().catch(() => {});
      await page.waitForTimeout(2000);
    }

    const cursos = await scrapeNotas(page);
    await closeSession(id);
    return cursos.length
      ? { status: 'ok', cursos }
      : { status: 'error', error: 'MFA correcto, pero no pude leer las notas (revisa /tmp/tooli-notas).' };
  } catch (e: any) {
    await snap(page, 'mfa-error');
    await closeSession(id);
    return { status: 'error', error: `Fallo verificando el código: ${e?.message ?? e}` };
  }
}
