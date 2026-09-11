// ─────────────────────────────────────────────────────────────────────────────
// Inicio de sesión asistido: el programa abre un navegador en el SSO de Banner,
// el usuario se autentica (Microsoft + Authenticator) UNA vez en esa ventana, y
// el programa detecta y captura la sesión de Banner automáticamente.
//
// Con MFA no hay forma de saltarse la aprobación del Authenticator (es el humano),
// pero todo lo demás — abrir el login, esperar, capturar cookies — es automático.
// ─────────────────────────────────────────────────────────────────────────────
const { chromium } = require('playwright');

// Entrada del SSO de Banner: ssomanager → CAS (appethosprod) → WSO2 → Microsoft.
const SSO_ENTRY = 'https://ssbprod.utb.edu.co:8443/ssomanager/c/SSB';
const WS = 'https://ssbprod.utb.edu.co:8443/PROD/bwskfreg.P_AddDropCrse';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Safari/605.1.15';

const isAuthWall = html =>
  /Ingreso de acceso a representante|bwgkpxya\.P_PA_Login|Acceso a Representante|Área Segura|twbkwbis\.P_ValLogin/i.test(html);

const CODE_COOKIE = 'sghe_magellan_username';
const esDeSSB = c => /ssbprod\.utb\.edu\.co/i.test(c.domain);
// El SSO a veces deja la cookie del código en el dominio padre (.utb.edu.co),
// que el filtro de ssbprod descartaba — de ahí que el código saliera null.
const esCodigo = c => c.name === CODE_COOKIE && /utb\.edu\.co/i.test(c.domain) && !!c.value;

const tieneCodigo = cookies => cookies.some(esCodigo);

function armarCookie(cookies) {
  const elegidas = cookies.filter(c => esDeSSB(c) || esCodigo(c));
  const vistas = new Set();
  return elegidas
    .filter(c => (vistas.has(c.name) ? false : vistas.add(c.name)))
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
}

async function captureSession({ timeoutMs = 300000 } = {}) {
  const baseOpts = { headless: false, args: ['--disable-blink-features=AutomationControlled'] };
  let browser;
  try {
    // usar el Google Chrome del sistema (no requiere descargar el Chromium de Playwright)
    browser = await chromium.launch({ ...baseOpts, channel: 'chrome' });
  } catch {
    try {
      browser = await chromium.launch({ ...baseOpts, args: [...baseOpts.args, '--no-sandbox', '--disable-setuid-sandbox'] });
    } catch (e) {
      return { ok: false, error: 'No se pudo abrir el navegador. Instala Google Chrome, o corre `node node_modules/playwright/cli.js install chromium`. ' + e.message };
    }
  }

  try {
    const ctx = await browser.newContext({
      viewport: { width: 1120, height: 840 },
      userAgent: UA,
      locale: 'es-CO',
      ignoreHTTPSErrors: true,
    });
    // que un login interactivo legítimo no lo marquen como "navegador automatizado"
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await ctx.newPage();
    await page.goto(SSO_ENTRY, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!browser.isConnected() || ctx.pages().length === 0) {
        return { ok: false, error: 'La ventana se cerró antes de completar el inicio de sesión.' };
      }

      let cookies = [];
      try { cookies = await ctx.cookies(); } catch { /* navegando entre hosts */ }
      const ssb = cookies.filter(c => /ssbprod\.utb\.edu\.co/i.test(c.domain));
      const sess = ssb.find(c => c.name === 'SESSID' && c.value && c.value.length > 6);

      if (sess) {
        // confirmar que esa sesión ya entra a Banner (no es el muro de login)
        const r = await ctx.request.get(WS, { maxRedirects: 5, timeout: 15000 }).catch(() => null);
        const html = r ? await r.text().catch(() => '') : '';
        if (html && !isAuthWall(html)) {
          // La cookie con el código (sghe_magellan_username) suele llegar unos
          // instantes DESPUÉS de SESSID; sin ella no se puede consultar el turno,
          // así que se le da un margen antes de rendirse.
          let todas = cookies;
          for (let i = 0; i < 8 && !tieneCodigo(todas); i++) {
            await page.waitForTimeout(700).catch(() => {});
            try { todas = await ctx.cookies(); } catch { /* ignorar */ }
          }
          return { ok: true, cookie: armarCookie(todas) };
        }
      }
      await page.waitForTimeout(2000).catch(() => {});
    }
    return { ok: false, error: 'Se agotó el tiempo esperando el inicio de sesión (5 min).' };
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { captureSession, SSO_ENTRY, armarCookie, tieneCodigo };
