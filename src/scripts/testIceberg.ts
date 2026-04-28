/**
 * Script standalone para probar el login al portal Iceberg.
 *
 * Uso (dentro del contenedor backend):
 *   docker compose exec backend node dist/scripts/testIceberg.js T00070682 1234567890
 *
 * Modo dev (fuera de docker, sin compilar):
 *   npx tsx src/scripts/testIceberg.ts T00070682 1234567890
 *
 * Resultados quedan en /tmp/iceberg/ dentro del contenedor.
 */
import { loginAndDownloadReceipt } from '../services/icebergService';

async function main() {
  const [, , codigo, cedula] = process.argv;

  if (!codigo || !cedula) {
    console.error('Uso: node testIceberg.js <codigo> <cedula>');
    process.exit(1);
  }

  console.log(`[testIceberg] iniciando con codigo=${codigo}, cedula=***`);

  const result = await loginAndDownloadReceipt(codigo, cedula, {
    debug: true,
    headless: true,
  });

  console.log('[testIceberg] resultado:');
  console.log('  ok:', result.ok);
  if (result.nombre) console.log('  nombre:', result.nombre);
  if (result.cedula) console.log('  cedula:', result.cedula);
  if (result.noRecibos) console.log('  noRecibos: true (sin recibos pendientes)');
  if (result.menuUsado) console.log('  menuUsado:', result.menuUsado);
  if (result.error) console.log('  error:', result.error);
  if (result.captchaAttempts?.length) {
    console.log('  captcha intentos:', result.captchaAttempts);
  }
  if (result.debugFiles?.length) {
    console.log('  archivos debug:');
    for (const p of result.debugFiles) console.log('    -', p);
  }
  if (result.pdf) {
    console.log('  pdf size:', result.pdf.length, 'bytes');
  }
}

main().catch(err => {
  console.error('[testIceberg] FATAL:', err);
  process.exit(1);
});
