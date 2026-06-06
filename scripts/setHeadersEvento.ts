import 'dotenv/config';
import { google } from 'googleapis';

const SHEET_ID = '1FL93fh_6MthZeoQV4R3-V26LSEcnEJucyEAu4k--rs0';

const HEADERS = [
  'Fecha/hora', 'WhatsApp', 'Nombre', '¿Estudiante UTB?', 'Carrera',
  'Diplomado', '¿Interesa posgrado?', '¿Acepta contacto?', '¿Confirma asistencia?',
];

(async () => {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'A1:I1',
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] },
  });

  // Poner la fila de encabezados en negrita
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

  console.log('✅ Encabezados agregados y en negrita.');
  process.exit(0);
})().catch((e) => {
  console.error('❌ ERROR:', e.message);
  process.exit(1);
});
