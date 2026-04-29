import { EvolutionAPIAdapter } from '../adapters/messaging/EvolutionAPIAdapter';
import { Session } from '../services/session';

export const messaging = new EvolutionAPIAdapter();

export const CODIGO_REGEX = /^T\d{8}$/i;
export const CEDULA_REGEX = /^\d{6,12}$/;
export const EMAIL_REGEX = /^[^\s@]+@(utb\.edu\.co|utbvirtual\.edu\.co)$/i;

export const PLATAFORMAS_TI: Record<string, string> = {
  '1': 'Banner / Autoservicio',
  '2': 'Iceberg / Portal Financiero',
  '3': 'Correo institucional',
  '4': 'Aulas virtuales (Moodle)',
  '5': 'Wifi / Red',
  '6': 'Otro',
};

export const NIVELES_ADMISIONES: Record<string, string> = {
  '1': 'Pregrado',
  '2': 'Posgrado (maestría / especialización)',
  '3': 'Educación continua / cursos',
  '4': 'No estoy seguro',
};

export const ETAPAS_ADMISIONES: Record<string, string> = {
  '1': 'Información general',
  '2': 'Aplicando / inscribiéndose',
  '3': 'Ya admitido con dudas',
  '4': 'Estudiante actual con duda',
};

export interface FlowContext {
  from: string;
  text: string;
  session: Session | null;
}

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

export async function sendAiHint(to: string): Promise<void> {
  await messaging.sendText({
    to,
    text:
      '_Pregúntame lo que necesites. Escribe *asesor* para hablar con un humano, ' +
      'o *salir* cuando termines._',
  });
}

export async function sendAreaPrompt(to: string): Promise<void> {
  await messaging.sendText({
    to,
    text:
      '🧑‍💼 *Hablar con un asesor*\n\n¿En qué área necesitas ayuda?\n\n' +
      '*1.* 🖥️ Soporte TI / Plataformas\n' +
      '*2.* 📝 Soporte Admisiones\n\n' +
      'Escribe *menu* para volver al inicio.',
  });
}

export async function sendMenu(to: string): Promise<void> {
  await messaging.sendText({
    to,
    text:
      '*Centro de Servicios UTB* 🎓\n' +
      '_Universidad Tecnológica de Bolívar_\n\n' +
      'Hola 👋 Soy el asistente virtual del Centro de Servicios.\n\n' +
      'Responde con el *número* de la opción que necesitas:\n\n' +
      '*1.* 📋 Turno de matrícula\n' +
      '     _Consulta tu turno y fecha asignada_\n\n' +
      '*2.* 🧾 Recibo de matrícula\n' +
      '     _Descarga el PDF de tu recibo_\n\n' +
      '*3.* 🧑‍💼 Hablar con un agente\n' +
      '     _Lunes a viernes 8am–8pm_',
  });
}
