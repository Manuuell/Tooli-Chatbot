import 'dotenv/config';
import { google } from 'googleapis';

const SHEET_ID = '1kFplxUssM4AllQE8SrwVva7kZZSu8Bvm-aOv_5FER_8';
const HEADERS = [
  'Fecha/hora', 'WhatsApp', 'Nombre', 'Correo',
  '¿Interés con financiación?', 'Posgrado de interés', '¿Autoriza contacto?',
];

(async () => {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // 1) Prueba de escritura
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'A:F',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [['PRUEBA', 'PRUEBA', 'PRUEBA', 'a@a.com', 'Sí', 'Test']] },
  });
  const range = res.data.updates?.updatedRange ?? '';
  console.log('✅ ESCRITURA OK →', range);

  // 2) Borrar la fila de prueba
  const m = range.match(/![A-Z]+(\d+):/);
  const fila = m ? parseInt(m[1], 10) : 0;
  if (fila) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ deleteDimension: { range: { sheetId: 0, dimension: 'ROWS', startIndex: fila - 1, endIndex: fila } } }] },
    });
    console.log('✅ Fila de prueba eliminada');
  }

  // 3) Encabezados + negrita
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'A1:G1',
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] },
  });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        repeatCell: {
          range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: 'userEnteredFormat.textFormat.bold',
        },
      }],
    },
  });
  console.log('✅ Encabezados agregados y en negrita');
  console.log('\n🎉 La hoja de Posgrados está lista.');
  process.exit(0);
})().catch((e) => { console.error('❌ ERROR:', e.message); process.exit(1); });
