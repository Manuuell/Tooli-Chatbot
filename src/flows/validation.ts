/**
 * Validaciones y normalización de texto de los flujos del bot.
 *
 * Están aparte de `shared.ts` porque ese módulo instancia el adaptador de
 * mensajería al importarse (abre conexiones y deja el proceso vivo), así que
 * cualquier prueba sobre estas reglas se quedaba colgada. Acá son funciones y
 * expresiones puras: `shared.ts` las reexporta, de modo que nada más cambia.
 */

export const CODIGO_REGEX = /^T\d{8}$/i;
export const CEDULA_REGEX = /^\d{6,12}$/;
export const EMAIL_REGEX = /^[^\s@]+@(utb\.edu\.co|utbvirtual\.edu\.co)$/i;

export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

export function isMenuCommand(text: string): boolean {
  return normalize(text) === 'menu';
}
