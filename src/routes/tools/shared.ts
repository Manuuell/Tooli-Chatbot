/** Utilidades compartidas por las rutas del panel. */

/**
 * Deja solo los dígitos de un número. Los teléfonos llegan escritos de muchas
 * formas (con +, espacios, guiones) pero en Redis y en WhatsApp la clave es
 * siempre la cadena de dígitos.
 */
export function normalizePhone(input: string): string {
  return String(input ?? '').replace(/\D/g, '');
}
