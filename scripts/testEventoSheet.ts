import 'dotenv/config';
import { google } from 'googleapis';

const SHEET_ID = '1FL93fh_6MthZeoQV4R3-V26LSEcnEJucyEAu4k--rs0';

(async () => {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // 1) Escribir fila de prueba
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'A:I',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [['PRUEBA', 'PRUEBA', 'PRUEBA-BOT', 'Sí', 'Test', 'Test', 'Sí', 'Sí', 'Sí']],
    },
  });
  const updatedRange = res.data.updates?.updatedRange ?? '';
  console.log('✅ ESCRITURA OK →', updatedRange);

  // 2) Leer de vuelta
  const read = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'A1:I5' });
  console.log('✅ LECTURA OK → filas con datos:', (read.data.values || []).length);

  // 3) Borrar la fila de prueba
  const m = updatedRange.match(/![A-Z]+(\d+):/);
  const fila = m ? parseInt(m[1], 10) : 0;
  if (fila) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: { sheetId: 0, dimension: 'ROWS', startIndex: fila - 1, endIndex: fila },
          },
        }],
      },
    });
    console.log('✅ FILA DE PRUEBA ELIMINADA (fila', fila + ')');
  }

  console.log('\n🎉 La hoja funciona perfecto — el service account tiene acceso de Editor.');
  process.exit(0);
})().catch((e) => {
  console.error('❌ ERROR:', e.message);
  process.exit(1);
});
