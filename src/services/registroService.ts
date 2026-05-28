import { google } from 'googleapis';
import { config } from '../config';

export interface RegistroProspecto {
  nombre: string;
  email: string;
  whatsapp: string;   // número E.164 sin +, ej: 573215640735
  programa?: string;  // programa de interés (si viene del flujo de programas)
}

/**
 * Agrega una fila al Google Sheet de registro de prospectos de posgrado.
 *
 * Estructura del sheet (crear manualmente):
 *   A: Fecha y hora   B: Nombre   C: Email   D: WhatsApp   E: Programa de interés
 *
 * IMPORTANTE: compartir el sheet con el service account con permisos de Editor:
 *   tooli-sheets-reader@crucial-minutia-489517-c8.iam.gserviceaccount.com
 */
export async function guardarRegistroProspecto(data: RegistroProspecto): Promise<void> {
  const sheetId = config.google.registroPosgradoSheetId;
  if (!sheetId) {
    console.warn('[registro] POSGRADO_REGISTRO_SHEET_ID no configurado — registro solo en logs');
    console.log('[registro] PROSPECTO:', data);
    return;
  }

  const auth = new google.auth.GoogleAuth({
    credentials: config.google.serviceAccount,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const ahora = new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'short',
    timeStyle: 'short',
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'Registros!A:E',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        ahora,
        data.nombre,
        data.email,
        `+${data.whatsapp}`,
        data.programa ?? '',
      ]],
    },
  });

  console.log('[registro] prospecto guardado en Sheets:', data.nombre, data.email);
}

/**
 * Lee todas las filas de la pestaña "Registros" del Google Sheet.
 * Devuelve array de arrays: [fecha, nombre, email, whatsapp, programa]
 */
export async function leerRegistrosPosgrado(): Promise<string[][]> {
  const sheetId = config.google.registroPosgradoSheetId;
  if (!sheetId) return [];

  const auth = new google.auth.GoogleAuth({
    credentials: config.google.serviceAccount,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'Registros!A2:E',
  });

  return response.data.values as string[][] ?? [];
}
