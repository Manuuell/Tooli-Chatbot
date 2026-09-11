import 'dotenv/config';
import { google } from 'googleapis';

const SHEET_ID = '1kFplxUssM4AllQE8SrwVva7kZZSu8Bvm-aOv_5FER_8';

(async () => {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const before = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'A2:G' });
  const filas = (before.data.values ?? []).length;

  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: 'A2:G' });

  console.log(`✅ Sheet limpio — se borraron ${filas} filas de datos (encabezados en fila 1 intactos)`);
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
