/**
 * Reglas de validación de un recordatorio programado.
 *
 * Viven aparte de `reminderService` a propósito: ese módulo abre la conexión a
 * Redis al importarse, así que cualquier prueba sobre estas reglas tendría que
 * levantar Redis o quedarse colgada. Acá son funciones puras: se pueden probar
 * (ver reminderValidation.test.ts) y las usa tanto el servicio como cualquier
 * validación previa del panel.
 */

export class ReminderValidationError extends Error {}

/** Margen mínimo hacia el futuro: evita programar algo que ya venció. */
export const MARGEN_MINIMO_MS = 30_000;

/** Quita todo lo que no sea dígito; conserva el indicativo de país si viene. */
export function normalizarTelefono(raw: string): string {
  return String(raw ?? '').replace(/\D/g, '');
}

/**
 * Valida y normaliza el teléfono del destinatario.
 * E.164: mínimo 10 dígitos (Colombia: 57 + 10), máximo 15 por el estándar.
 */
export function validarTelefono(raw: string): string {
  const telefono = normalizarTelefono(raw);
  if (telefono.length < 10 || telefono.length > 15) {
    throw new ReminderValidationError('telefono inválido (debe tener 10–15 dígitos)');
  }
  return telefono;
}

/** Valida y recorta el mensaje. 4096 es el tope de un texto de WhatsApp. */
export function validarMensaje(raw: string): string {
  const mensaje = String(raw ?? '').trim();
  if (mensaje.length < 1 || mensaje.length > 4096) {
    throw new ReminderValidationError('mensaje debe tener entre 1 y 4096 caracteres');
  }
  return mensaje;
}

/**
 * Acepta epoch en milisegundos o una fecha ISO 8601.
 *
 * El formato se exige con una expresión regular en vez de confiar en
 * `Date.parse`, que es mucho más permisivo de lo que parece: `Date.parse("2027")`
 * devuelve el 1 de enero de 2027 y `Date.parse("mañana a las 8")` devuelve
 * agosto de 2001. Sin este filtro, una entrada sin sentido se aceptaba como
 * fecha válida y el recordatorio quedaba programado para un momento arbitrario.
 */
const ISO_8601 = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/;

export function parseFecha(valor: string | number): number {
  const invalida = () => new ReminderValidationError(
    'scheduledAt no es una fecha válida (usa ISO 8601, ej. 2026-09-20T08:00:00-05:00)',
  );

  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) throw invalida();
    return valor;
  }

  const texto = String(valor ?? '').trim();
  const m = ISO_8601.exec(texto);
  if (!m) throw invalida();

  // Date.parse no rechaza un día que no existe: convierte 2026-02-31 en el 3 de
  // marzo sin decir nada. Se comprueba el calendario con las partes de la fecha.
  const [anio, mes, dia] = texto.slice(0, 10).split('-').map(Number);
  const hora = Number(texto.slice(11, 13));
  const minuto = Number(texto.slice(14, 16));
  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  if (mes < 1 || mes > 12 || dia < 1 || dia > diasDelMes || hora > 23 || minuto > 59) {
    throw invalida();
  }

  const ms = Date.parse(texto);
  if (!Number.isFinite(ms)) throw invalida();
  return ms;
}

/** La fecha debe quedar con margen suficiente para que el worker la alcance. */
export function validarFecha(valor: string | number, ahora = Date.now()): number {
  const scheduledAt = parseFecha(valor);
  if (scheduledAt < ahora + MARGEN_MINIMO_MS) {
    throw new ReminderValidationError('scheduledAt debe estar al menos 30 segundos en el futuro');
  }
  return scheduledAt;
}
