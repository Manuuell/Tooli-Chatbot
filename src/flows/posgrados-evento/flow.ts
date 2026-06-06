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
const BRAND        = 'Tooli Posgrados';
const ASESOR       = '+57 317 800 2131';
const URL_ESP      = 'https://www.utb.edu.co/posgrados/especializacion-en-gestion-de-tecnologias-disruptivas-en-los-negocios/';
const URL_MAESTRIA = 'https://www.utb.edu.co/posgrados/maestria-en-management-de-la-transformacion-digital/';

const NOMBRE_ESP      = 'Especialización en Gestión de Tecnologías Disruptivas en los Negocios';
const NOMBRE_MAESTRIA = 'Maestría en Management de la Transformación Digital';

// Flyer de Posgrados UTB / ICETEX (leído desde disco → sube directo a Meta)
const FLYER_POSGRADO = path.resolve(__dirname, '../../public/evento/flujo.jpeg');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function invalid(to: string): Promise<void> {
  return posgradoMessaging.sendText({ to, text: 'Por favor usa los botones 👆' });
}

/** Pausa breve para que una imagen se entregue antes del siguiente mensaje. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function primerNombre(nombre: string): string {
  return (nombre ?? '').trim().split(/\s+/)[0] ?? '';
}

// ── 0. Inicio → pide nombre ──────────────────────────────────────────────────

export async function handlePosgradoInicio(ctx: Ctx): Promise<void> {
  const { from } = ctx;

  await posgradoMessaging.sendText({
    to: from,
    text:
      '👋 *¡Hola! Bienvenido/a a Tooli Posgrados* 🎓\n' +
      '_Escuela de Transformación Digital · UTB_\n\n' +
      'Responde unas preguntas rápidas (toma 1 minuto) y al *terminar* te compartimos una *oportunidad especial de financiación* para tu posgrado. 🎁',
  });

  await setPosgradoSession(from, { step: 'posg_nombre', data: {} });

  await posgradoMessaging.sendText({
    to: from,
    text: '✍️ ¿Cuál es tu *nombre completo*?',
  });
}

// ── 1. Nombre → pide correo ──────────────────────────────────────────────────

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
    text: `¡Gracias, ${primerNombre(nombre)}! 📧\n\n¿Cuál es tu *correo electrónico*?\n_(Para enviarte la información de los programas)_`,
  });
}

// ── 2. Correo → pregunta de interés ──────────────────────────────────────────

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

  await setPosgradoSession(from, { step: 'posg_interes', data: { ...session?.data, correo } });

  await posgradoMessaging.sendButtons({
    to: from,
    title: BRAND,
    description: '💰 ¿Te interesaría hacer un posgrado si lo puedes *financiar* o conseguir una *beca*?',
    footer: 'Posgrado País de ICETEX disponible',
    buttons: [
      { id: 'si',     displayText: '✅ Sí' },
      { id: 'talvez', displayText: '🤔 Tal vez' },
      { id: 'no',     displayText: '❌ No' },
    ],
  });
}

// ── 3. Interés → guarda y muestra los 2 posgrados (o cierra) ──────────────────

export async function handlePosgradoInteres(ctx: Ctx): Promise<void> {
  const { from, text, session } = ctx;
  const input = text.trim().toLowerCase();
  const map: Record<string, string> = { si: 'Sí', talvez: 'Tal vez', no: 'No' };
  const interesFinanciacion = map[input];
  if (!interesFinanciacion) { await invalid(from); return; }

  const d: Record<string, string> = { ...session?.data, interesFinanciacion };

  // Guardar el registro (devuelve la fila para actualizar el posgrado de interés)
  let fila = 0;
  try {
    fila = await guardarRegistroPosgrado({
      whatsapp:            from,
      nombre:              d.nombre ?? '',
      correo:              d.correo ?? '',
      interesFinanciacion,
    });
  } catch (err) {
    console.error('[posgrados] error guardando registro:', err);
  }

  // No le interesa → cerrar amablemente (el dato ya quedó guardado)
  if (input === 'no') {
    await setPosgradoSession(from, { step: 'posg_completada', data: {} });
    await posgradoMessaging.sendText({
      to: from,
      text:
        `¡Gracias por tu tiempo, ${primerNombre(d.nombre ?? '')}! 🙌\n\n` +
        'Si más adelante cambias de opinión, recuerda que en la UTB puedes *financiar tu posgrado* con ICETEX.\n\n' +
        `📞 Asesoría: *${ASESOR}*\n🌐 www.utb.edu.co`,
    });
    return;
  }

  // Sí / Tal vez → presentar los 2 posgrados
  await setPosgradoSession(from, { step: 'posg_cual', data: { ...d, filaSheet: String(fila) } });

  await posgradoMessaging.sendText({
    to: from,
    text:
      '🎓 *Estas son 2 opciones ideales para ti:*\n\n' +
      '1️⃣ *Especialización en Gestión de Tecnologías Disruptivas en los Negocios*\n' +
      '📌 Presencial · 2 semestres\n' +
      'Domina *IA, Big Data, Blockchain, IoT, Cloud y Ciberseguridad* para transformar negocios.\n\n' +
      '2️⃣ *Maestría en Management de la Transformación Digital*\n' +
      '📌 Presencial · 3 semestres\n' +
      'Lidera la *transformación digital* de las organizaciones: tecnología + estrategia + cultura.\n\n' +
      '💰 Ambos los puedes financiar con el *Posgrado País de ICETEX*: 40% mientras estudias, 60% al graduarte.',
  });

  await posgradoMessaging.sendButtons({
    to: from,
    title: BRAND,
    description: '¿Cuál te llama más la atención?',
    footer: 'Te enviamos la info del que elijas',
    buttons: [
      { id: 'esp',      displayText: '🎯 Especialización' },
      { id: 'maestria', displayText: '🎓 Maestría' },
      { id: 'nose',     displayText: '🤔 Aún no sé' },
    ],
  });
}

// ── 4. ¿Cuál posgrado? → actualiza Sheet + cierre con info ────────────────────

export async function handlePosgradoCual(ctx: Ctx): Promise<void> {
  const { from, text, session } = ctx;
  const input = text.trim().toLowerCase();
  if (!['esp', 'maestria', 'nose'].includes(input)) { await invalid(from); return; }

  const fila = parseInt(session?.data?.filaSheet ?? '0', 10);
  const valor =
    input === 'esp' ? NOMBRE_ESP :
    input === 'maestria' ? NOMBRE_MAESTRIA :
    'Aún no decide';

  try {
    await actualizarPosgradoInteres(fila, valor);
  } catch (err) {
    console.error('[posgrados] error actualizando posgrado de interés:', err);
  }

  const nombre = primerNombre(session?.data?.nombre ?? '');

  // Enviar la info del posgrado elegido (el cierre/asesor llega tras el consentimiento)
  if (input === 'esp') {
    await posgradoMessaging.sendText({
      to: from,
      text:
        `🎯 *Especialización en Gestión de Tecnologías Disruptivas en los Negocios*\n` +
        `📌 Presencial · 2 semestres\n\nToda la info aquí 👇\n${URL_ESP}`,
    });
  } else if (input === 'maestria') {
    await posgradoMessaging.sendText({
      to: from,
      text:
        `🎓 *Maestría en Management de la Transformación Digital*\n` +
        `📌 Presencial · 3 semestres\n\nToda la info aquí 👇\n${URL_MAESTRIA}`,
    });
  } else {
    await posgradoMessaging.sendText({
      to: from,
      text:
        `¡Sin problema${nombre ? ', ' + nombre : ''}! Aquí tienes las dos para que las explores 👇\n\n` +
        `🎯 *Especialización (Tecnologías Disruptivas)*\n${URL_ESP}\n\n` +
        `🎓 *Maestría (Transformación Digital)*\n${URL_MAESTRIA}`,
    });
  }

  // Pedir consentimiento de tratamiento de datos / contacto
  await setPosgradoSession(from, { step: 'posg_consent', data: { ...session?.data, posgradoInteres: valor } });
  await posgradoMessaging.sendButtons({
    to: from,
    title: BRAND,
    description:
      '🔒 ¿Autorizas que un asesor de la UTB te contacte y el tratamiento de tus datos personales, conforme a la *Ley 1581 de 2012*?',
    footer: 'Tus datos se usan solo para fines de admisión',
    buttons: [
      { id: 'si', displayText: '✅ Sí, autorizo' },
      { id: 'no', displayText: '❌ No' },
    ],
  });
}

// ── 5. Consentimiento → (si autoriza) pasa al asistente IA ───────────────────

export async function handlePosgradoConsent(ctx: Ctx): Promise<void> {
  const { from, text, session } = ctx;
  const input = text.trim().toLowerCase();
  if (input !== 'si' && input !== 'no') { await invalid(from); return; }

  const fila = parseInt(session?.data?.filaSheet ?? '0', 10);
  const d = session?.data ?? {};

  try {
    await actualizarConsentimiento(fila, input === 'si' ? 'Sí' : 'No');
  } catch (err) {
    console.error('[posgrados] error actualizando consentimiento:', err);
  }

  // No autoriza → cerrar respetando su decisión
  if (input === 'no') {
    await setPosgradoSession(from, { step: 'posg_completada', data: {} });
    await posgradoMessaging.sendText({
      to: from,
      text:
        `¡Gracias, ${primerNombre(d.nombre ?? '')}! 🙌 Respetamos tu decisión, no te contactaremos.\n\n` +
        `Si más adelante quieres información, escríbenos cuando gustes: *${ASESOR}*\n🌐 www.utb.edu.co`,
    });
    return;
  }

  // Sí autoriza → empujar el lead a HubSpot (CRM de la UTB) — sin bloquear el flujo
  void upsertContactoHubspot({
    email:               d.correo ?? '',
    nombre:              d.nombre ?? '',
    whatsapp:            from,
    posgradoInteres:     d.posgradoInteres ?? '',
    interesFinanciacion: d.interesFinanciacion ?? '',
    consentimiento:      true,
  });

  // Cierre limpio — el seguimiento se hace después con una plantilla (no chat en vivo)
  await setPosgradoSession(from, { step: 'posg_completada', data: {} });
  await posgradoMessaging.sendText({
    to: from,
    text:
      `🎓 ¡Listo, ${primerNombre(d.nombre ?? '')}! Registramos tu interés en *${d.posgradoInteres ?? 'el posgrado'}*.\n\n` +
      'Un asesor de la UTB te contactará pronto con las *fechas de inscripción*, requisitos y *financiación (ICETEX)*. 📩\n\n' +
      `¿Una duda ya mismo? Escríbenos a *${ASESOR}*`,
  });

  // 🎁 Recompensa por completar — la Escuela de Transformación Digital comparte la oportunidad de financiación
  await sleep(1500);
  try {
    const flyer = fs.readFileSync(FLYER_POSGRADO);
    await posgradoMessaging.sendImage({
      to: from,
      buffer: flyer,
      mimetype: 'image/jpeg',
      caption:
        '🎁 *¡Gracias por completar!*\n\n' +
        'La *Escuela de Transformación Digital* te comparte esta oportunidad:\n' +
        '💰 *Posgrado País de ICETEX* — paga el *40% mientras estudias* y el *60% después de graduarte*.\n\n' +
        '¡Tu posgrado está más cerca de lo que crees! 🚀',
    });
  } catch (err) {
    console.error('[posgrados] error enviando flyer de recompensa:', err);
  }
}

// ── Completada (si vuelve a escribir) ─────────────────────────────────────────

export async function handlePosgradoCompletada(ctx: Ctx): Promise<void> {
  const { from } = ctx;
  await posgradoMessaging.sendText({
    to: from,
    text:
      '✅ ¡Ya tenemos tus datos! Un asesor te contactará pronto. 🎓\n\n' +
      `📞 ¿Dudas ya mismo? Escríbenos: *${ASESOR}*`,
  });
}
