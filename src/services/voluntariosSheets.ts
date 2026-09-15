import { google } from 'googleapis';
import { config } from '../config';

export interface VoluntarioDigital {
  /** Número de WhatsApp con el que escribió (E.164, sin +). */
  whatsapp: string;
  nombre: string;
  correo: string;
  /** 'Sí' — solo se guarda a quien aceptó. */
  consentimiento: string;
}

/**
 * Guarda un voluntario digital en Google Sheets.
 *
 * Estructura de la hoja (crear manualmente, fila 1 = encabezados):
 *   A: Fecha/hora   B: WhatsApp   C: Nombre   D: Correo
 *   E: Consentimiento   F: Estado beta
 *
 * Compartir el sheet con el service account con permisos de Editor.
 */
export async function guardarVoluntario(data: VoluntarioDigital): Promise<void> {
  const sheetId = config.voluntarios.sheetId;
  if (!sheetId) {
    console.warn('[voluntarios] VOLUNTARIOS_SHEET_ID no configurado — guardando solo en logs');
    console.log('[voluntarios] REGISTRO:', JSON.stringify(data));
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
    range: 'A:F',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        ahora,
        data.whatsapp,
        data.nombre,
        data.correo,
        data.consentimiento,
        'Pendiente de invitación',
      ]],
    },
  });

  console.log('[voluntarios] registrado:', data.nombre, '·', data.whatsapp.slice(-4));
}

/**
 * Lee todos los voluntarios registrados (columnas A-F desde la fila 2).
 * Útil para exportar la lista de betatesters.
 */
export async function leerVoluntarios(): Promise<string[][]> {
  const sheetId = config.voluntarios.sheetId;
  if (!sheetId) return [];

  const auth = new google.auth.GoogleAuth({
    credentials: config.google.serviceAccount,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'A2:F',
  });

  return (response.data.values as string[][]) ?? [];
}

/**
 * ¿Ya existe este número en la hoja? Evita duplicados si alguien reinicia el flujo.
 * Falla en silencio (devuelve false) para no bloquear un registro por un error de lectura.
 */
export async function yaRegistrado(whatsapp: string): Promise<boolean> {
  try {
    const filas = await leerVoluntarios();
    return filas.some(f => (f[1] ?? '').trim() === whatsapp);
  } catch (err) {
    console.error('[voluntarios] error verificando duplicado:', err);
    return false;
  }
}
