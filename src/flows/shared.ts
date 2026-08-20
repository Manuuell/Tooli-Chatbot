import { EvolutionAPIAdapter } from '../adapters/messaging/EvolutionAPIAdapter';
import { MetaCloudAdapter } from '../adapters/messaging/MetaCloudAdapter';
import { IMessagingAdapter } from '../adapters/messaging/IMessagingAdapter';
import { config } from '../config';
import { Session } from '../services/session';

export const messaging: IMessagingAdapter =
  config.messagingAdapter === 'meta'
    ? new MetaCloudAdapter()
    : new EvolutionAPIAdapter();

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
  await messaging.sendButtons({
    to,
    title: '🧑‍💼 Hablar con un asesor',
    description: '¿En qué área necesitas ayuda?',
    footer: 'Escribe menu para volver al inicio',
    buttons: [
      { id: '1', displayText: '🖥️ Soporte TI' },
      { id: '2', displayText: '📝 Admisiones' },
    ],
  });
}

export async function sendMenu(to: string): Promise<void> {
  await messaging.sendList({
    to,
    title: '🎓 Tooli UTB',
    description: 'Hola 👋 Soy Tooli, tu asistente de servicios estudiantiles de la UTB.\n\n¿En qué te ayudo hoy?',
    footer: 'Universidad Tecnológica de Bolívar',
    buttonText: 'Ver opciones',
    sections: [
      {
        title: 'Servicios',
        rows: [
          { id: '1', title: '📊 Ver notas',         description: 'Consulta tus calificaciones (verifica tu correo UTB)' },
          { id: '2', title: '📋 Turno matrícula',   description: 'Consulta tu turno y fecha asignada' },
          { id: '3', title: '🧾 Recibo matrícula',  description: 'Descarga el PDF de tu recibo de pago' },
          { id: '4', title: '🤖 Asistente IA',      description: 'Pregúntame lo que necesites de la UTB' },
          { id: '5', title: '👤 Hablar con asesor', description: 'Soporte TI o Admisiones' },
          { id: '6', title: '🎓 Ver programas',     description: 'Especializaciones, maestrías y doctorados' },
        ],
      },
    ],
  });
}
