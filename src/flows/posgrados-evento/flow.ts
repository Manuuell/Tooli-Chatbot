import fs from 'fs';
import path from 'path';
import { Session } from '../../services/session';
import { getPosgradoSession, setPosgradoSession, posgradoMessaging } from './shared';
import {
  guardarRegistroPosgrado,
  actualizarPosgradoInteres,
  actualizarConsentimiento,
} from '../../services/posgradosEventoSheets';
import { upsertContactoHubspot } from '../../services/hubspotService';

interface Ctx {
  from: string;
  text: string;
  session: Session | null;
}

// ── Constantes ────────────────────────────────────────────────────────────────
const BRAND = 'Escuela de Posgrados UTB';

const NOMBRE_ESP      = 'Especialización en Gestión de Tecnologías Disruptivas en los Negocios';
const NOMBRE_MAESTRIA = 'Maestría en Management de la Transformación Digital';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Flyer de la Beca País / ICETEX (recordatorio final)
const FLYER_POSGRADO = path.resolve(__dirname, '../../public/evento/flujo.jpeg');

function invalid(to: string): Promise<void> {
  return posgradoMessaging.sendText({ to, text: 'Por favor usa los botones 👆' });
}

function primerNombre(nombre: string): string {
  return (nombre ?? '').trim().split(/\s+/)[0] ?? '';
}

/** Pausa breve para que el texto se entregue antes de la imagen. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 0. Inicio → bienvenida + consentimiento (Ley 1581) ───────────────────────

export async function handlePosgradoInicio(ctx: Ctx): Promise<void> {
  const { from } = ctx;

  await posgradoMessaging.sendText({
    to: from,
    text:
      '🎓 *¡Bienvenido/a a la Escuela de Posgrados UTB!*\n\n' +
      '¡Gracias por participar en el meetup digital *"Retos del Management Digital"*! 🙌\n\n' +
      'Te haré unas preguntas rápidas (1 min). ✍️',
  });

  await setPosgradoSession(from, { step: 'posg_consent', data: {} });

  await posgradoMessaging.sendButtons({
    to: from,
    title: BRAND,
    description:
      '🔒 ¿Autorizas que un asesor de la UTB te contacte y el tratamiento de tus datos personales conforme a la *Ley 1581 de 2012*?',
    footer: 'Tus datos se usan solo para fines de admisión',
    buttons: [
      { id: 'si', displayText: '✅ Sí, autorizo' },
      { id: 'no', displayText: '❌ No' },
    ],
  });
}

// ── 1. Consentimiento → (Sí) pide nombre; (No) cierre simple ─────────────────

export async function handlePosgradoConsent(ctx: Ctx): Promise<void> {
  const { from, text, session } = ctx;
  const input = text.trim().toLowerCase();
  if (input !== 'si' && input !== 'no') { await invalid(from); return; }

  // No autoriza → cerrar respetando su decisión (no se recogen datos)
  if (input === 'no') {
    await setPosgradoSession(from, { step: 'posg_completada', data: {} });
    await posgradoMessaging.sendText({
      to: from,
      text:
        '¡Entendido! 🙌 Respetamos tu decisión y no trataremos tus datos.\n\n' +
        '¡Gracias por participar! 🎓',
    });
    return;
  }

  // Autoriza → guardamos el consentimiento y pedimos el nombre
  await setPosgradoSession(from, {
    step: 'posg_nombre',
    data: { ...session?.data, consentimiento: 'Sí' },
  });

  await posgradoMessaging.sendText({
    to: from,
    text: '✍️ ¿Cuál es tu *nombre completo*?',
  });
}

// ── 2. Nombre → pide correo ──────────────────────────────────────────────────

export async function handlePosgradoNombre(ctx: Ctx): Promise<void> {
  const { from, text, session } = ctx;
  const nombre = text.trim();

  if (nombre.length < 2) {
    await posgradoMessaging.sendText({ to: from, text: 'Por favor escribe tu nombre 🙂' });
    return;
  }

  await setPosgradoSession(from, { step: 'posg_correo', data: { ...session?.data, nombre } });

  await posgradoMessaging.sendText({
    to: from,
    text: `¡Gracias, ${primerNombre(nombre)}! 📧\n\n¿Cuál es tu *correo electrónico*?`,
  });
}

// ── 3. Correo → pregunta el programa de interés ──────────────────────────────

export async function handlePosgradoCorreo(ctx: Ctx): Promise<void> {
  const { from, text, session } = ctx;
  const correo = text.trim();

  if (!EMAIL_RE.test(correo)) {
    await posgradoMessaging.sendText({
      to: from,
      text: '📧 Ese correo no parece válido. Escríbelo de nuevo, por ejemplo: *nombre@correo.com*',
    });
    return;
  }

  await setPosgradoSession(from, { step: 'posg_programa', data: { ...session?.data, correo } });

  await posgradoMessaging.sendButtons({
    to: from,
    title: BRAND,
    description:
      '🎓 *¿Qué programa te interesa?*\n\n' +
      `🎯 *${NOMBRE_ESP}*\n\n` +
      `🎓 *${NOMBRE_MAESTRIA}*`,
    footer: 'Elige una opción 👇',
    buttons: [
      { id: 'esp',      displayText: '🎯 Especialización' },
      { id: 'maestria', displayText: '🎓 Maestría' },
      { id: 'nose',     displayText: '🤔 Aún no sé' },
    ],
  });
}

// ── 4. Programa de interés → guarda (Sheets + CRM) + cierre simple ────────────

export async function handlePosgradoPrograma(ctx: Ctx): Promise<void> {
  const { from, text, session } = ctx;
  const input = text.trim().toLowerCase();
  if (!['esp', 'maestria', 'nose'].includes(input)) { await invalid(from); return; }

  const d = session?.data ?? {};
  const programa =
    input === 'esp'      ? NOMBRE_ESP :
    input === 'maestria' ? NOMBRE_MAESTRIA :
    'Aún no decide';

  // Guardar en Google Sheets
  try {
    const fila = await guardarRegistroPosgrado({
      whatsapp:            from,
      nombre:              d.nombre ?? '',
      correo:              d.correo ?? '',
      interesFinanciacion: '',
    });
    if (fila) {
      await actualizarPosgradoInteres(fila, programa);
      await actualizarConsentimiento(fila, 'Sí');
    }
  } catch (err) {
    console.error('[posgrados] error guardando registro:', err);
  }

  // Enviar el lead a HubSpot (CRM de la UTB) — sin bloquear el flujo
  void upsertContactoHubspot({
    email:               d.correo ?? '',
    nombre:              d.nombre ?? '',
    whatsapp:            from,
    posgradoInteres:     programa,
    interesFinanciacion: '',
    consentimiento:      true,
  });

  // Cierre simple
  await setPosgradoSession(from, { step: 'posg_completada', data: {} });
  await posgradoMessaging.sendText({
    to: from,
    text:
      `✅ *¡Listo, ${primerNombre(d.nombre ?? '')}!* Registramos tu interés en *${programa}*.\n\n` +
      'Un asesor de la UTB te contactará pronto. ¡Gracias por participar! 🎓',
  });
}

// ── Completada (si vuelve a escribir) ─────────────────────────────────────────

export async function handlePosgradoCompletada(ctx: Ctx): Promise<void> {
  const { from } = ctx;
  await posgradoMessaging.sendText({
    to: from,
    text:
      '✅ ¡Ya tenemos tus datos! Un asesor de la UTB te contactará pronto. 🎓\n\n' +
      '¡Gracias por participar!',
  });
}
