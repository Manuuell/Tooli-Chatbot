import { chromium, Browser } from 'playwright';

/**
 * Genera un certificado de felicitación personalizado como imagen PNG.
 * Diseña el certificado en HTML/CSS y lo "fotografía" con Chromium (Playwright),
 * el mismo motor que ya usa el proyecto para el portal de recibos.
 *
 * No requiere librerías nuevas ni plantillas de imagen externas.
 */

// ── Navegador compartido (se lanza una vez y se reutiliza) ───────────────────
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  let browser = await browserPromise;
  if (!browser.isConnected()) {
    browserPromise = chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    browser = await browserPromise;
  }
  return browser;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string
  ));
}

/** Pone cada palabra con mayúscula inicial (juan pérez → Juan Pérez). */
function titleCase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function buildHtml(nombre: string, diplomado: string, fecha: string): string {
  const nombreFmt = esc(titleCase(nombre));
  const diplomadoFmt = esc(diplomado);
  const fechaFmt = esc(fecha);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 850px; }
  body {
    font-family: 'Liberation Sans', 'DejaVu Sans', Arial, Helvetica, sans-serif;
    background: linear-gradient(135deg, #2e1065 0%, #4c1d95 45%, #7c3aed 100%);
    display: flex; align-items: center; justify-content: center;
    padding: 38px;
  }
  .card {
    width: 100%; height: 100%;
    background: #ffffff;
    border-radius: 22px;
    border: 3px solid #c4b5fd;
    outline: 10px solid #ffffff;
    box-shadow: inset 0 0 0 3px #ede9fe;
    position: relative;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    text-align: center;
    padding: 56px 70px;
  }
  .seal {
    position: absolute; top: 44px; right: 56px;
    width: 96px; height: 96px; border-radius: 50%;
    background: linear-gradient(135deg, #7c3aed, #4c1d95);
    color: #fff; font-weight: 800; font-size: 26px; letter-spacing: 1px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 6px 18px rgba(76,29,149,.35);
  }
  .kicker {
    color: #7c3aed; font-size: 22px; font-weight: 800;
    letter-spacing: 7px; text-transform: uppercase;
  }
  .title {
    color: #2e1065; font-size: 60px; font-weight: 800;
    margin-top: 10px; letter-spacing: 2px;
  }
  .divider { width: 90px; height: 5px; border-radius: 4px; background: #a78bfa; margin: 22px 0; }
  .sub { color: #555; font-size: 23px; }
  .name {
    color: #6d28d9; font-size: 62px; font-weight: 800;
    margin: 14px 0 8px; padding: 0 30px 16px;
    border-bottom: 3px solid #ede9fe;
    max-width: 1000px; line-height: 1.1;
  }
  .reason { color: #333; font-size: 24px; line-height: 1.55; max-width: 880px; margin-top: 14px; }
  .reason b { color: #6d28d9; }
  .footer {
    position: absolute; bottom: 50px; left: 0; width: 100%;
    display: flex; justify-content: space-between; padding: 0 80px;
    color: #6b7280; font-size: 17px;
  }
  .footer .col { flex: 1; }
  .footer .line { width: 180px; height: 2px; background: #d1d5db; margin: 0 auto 8px; }
  .footer .strong { color: #2e1065; font-weight: 700; }
</style>
</head>
<body>
  <div class="card">
    <div class="seal">TT</div>
    <div class="kicker">Talento Tech &middot; UTB</div>
    <div class="title">¡FELICITACIONES!</div>
    <div class="divider"></div>
    <div class="sub">Con orgullo reconocemos a</div>
    <div class="name">${nombreFmt}</div>
    <div class="reason">
      por completar satisfactoriamente el diplomado de <b>${diplomadoFmt}</b>
      en el marco del programa <b>Talento Tech</b>. ¡Un gran logro que abre nuevas puertas!
    </div>
    <div class="footer">
      <div class="col">
        <div class="line"></div>
        <div class="strong">Escuela de Transformación Digital</div>
        <div>Universidad Tecnológica de Bolívar</div>
      </div>
      <div class="col">
        <div class="line"></div>
        <div class="strong">Cartagena de Indias</div>
        <div>${fechaFmt}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Genera el certificado y devuelve un Buffer PNG listo para enviar por WhatsApp.
 */
export async function generarCertificado(nombre: string, diplomado: string): Promise<Buffer> {
  const fecha = new Date().toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  });

  const html = buildHtml(nombre, diplomado || 'Talento Tech', fecha);

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1200, height: 850 },
    deviceScaleFactor: 2, // alta resolución (2400×1700)
  });

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    await page.setContent(html, { waitUntil: 'load' });
    const buffer = await page.screenshot({ type: 'png' });
    return buffer as Buffer;
  } finally {
    await context.close().catch(() => {});
  }
}
