/**
 * Enmascarado de datos personales para los logs.
 *
 * POR QUÉ:
 *   Los webhooks registraban cada mensaje entrante con el número completo y el
 *   texto completo — es decir, la conversación privada de un estudiante queda
 *   en texto plano en los logs del servidor, que se rotan, se copian y muchas
 *   veces se mandan a un servicio externo. Para depurar alcanza con saber
 *   *cuál* conversación es y *cuánto* mide el mensaje.
 *
 *   El patrón de enmascarado ya existía suelto en `src/flows/recordatorios.ts`;
 *   acá queda en un solo lugar para que todos los puntos de log usen el mismo.
 */

/** `573001234567` → `****4567`. Suficiente para identificar la conversación. */
export function maskPhone(phone: string | undefined | null): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return '****';
  return `****${digits.slice(-4)}`;
}

/** `T00012345` → `T0****345`. Conserva el prefijo, que es lo que sirve para depurar. */
export function maskCode(code: string | undefined | null): string {
  const c = String(code ?? '').trim();
  if (c.length <= 4) return '****';
  return `${c.slice(0, 2)}****${c.slice(-3)}`;
}

/**
 * No se loguea el contenido del mensaje: solo su longitud y las primeras
 * palabras cuando hace falta reconstruir un flujo. Por defecto, ni eso.
 */
export function describeText(text: string | undefined | null, preview = 0): string {
  const t = String(text ?? '');
  if (preview <= 0) return `${t.length} chars`;
  const corte = t.slice(0, preview).replace(/\s+/g, ' ');
  return `${t.length} chars: "${corte}${t.length > preview ? '…' : ''}"`;
}
