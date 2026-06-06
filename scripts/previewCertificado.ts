import fs from 'fs';
import path from 'path';
import { generarCertificado } from '../src/services/certificadoService';

(async () => {
  const buffer = await generarCertificado('manuel josé pérez gómez', 'Inteligencia Artificial');
  const out = path.resolve(__dirname, '../cert-preview.png');
  fs.writeFileSync(out, buffer);
  console.log('Certificado generado en:', out);
  process.exit(0);
})();
