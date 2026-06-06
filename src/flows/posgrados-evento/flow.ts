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
const URL_ESP      = 'https://www.utb.edu.co/posgrados/especializacion-en-gestion-de-tecnologias-disruptivas-en-los-negocios/';
const URL_MAESTRIA = 'https://www.utb.edu.co/posgrados/maestria-en-management-de-la-transformacion-digital/';
const URL_INSCRIPCION = 'https://ssbprod.utb.edu.co:8443/PROD/bwskalog.P_DispLoginNon';

const NOMBRE_ESP      = 'Especialización en Gestión de Tecnologías Disruptivas en los Negocios';
const NOMBRE_MAESTRIA = 'Maestría en Management de la Transformación Digital';

// Flyer de Posgrados UTB / ICETEX (leído desde disco → sube directo a Meta)
const FLYER_POSGRADO = path.resolve(__dirname, '../../public/evento/flujo.jpeg');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function invalid(to: string): Promise<void> {
  return posgradoMessaging.sendText({ to, text: 'Por favor usa los botones 👆' });
}

function primerNombre(nombre: string): string {
  return (nombre ?? '').trim().split(/\s+/)[0] ?? '';
}

/**
 * Cierre del flujo: envía el flyer con el call-to-action de cupos limitados y el
 * enlace de inscripción de Banner, todo en un mismo mensaje (imagen + caption).
 *  - variant 'si' → cliente interesado.
 *  - variant 'no' → añade el gancho "Piénsalo otra vez".
 */
async function cerrarConCupos(from: string, variant: 'si' | 'no'): Promise<void> {
  const gancho =
    variant === 'no'
      ? '🔥 *PIÉNSALO OTRA VEZ.*\n*¡SON CUPOS LIMITADOS, INSCRÍBETE YA!*'
      : '🔥 *¡SON CUPOS LIMITADOS, INSCRÍBETE YA!*';

  const caption = `${gancho}\n\n📝 Inscríbete aquí 👇\n${URL_INSCRIPCION}`;

  try {
    const flyer = fs.readFileSync(FLYER_POSGRADO);
    await posgradoMessaging.sendImage({
      to: from,
      buffer: flyer,
      mimetype: 'image/jpeg',
      caption,
    });
  } catch (err) {
    console.error('[posgrados] error enviando imagen de cierre:', err);
    // Fallback a solo texto si la imagen falla
    await posgradoMessaging.sendText({ to: from, text: caption });
  }

  await setPosgradoSession(from, { step: 'posg_completada', data: {} });
}

// ── 0. Inicio → bienvenida + consentimiento (Ley 1581) ───────────────────────

export async function handlePosgradoInicio(ctx: Ctx): Promise<void> {
  const { from } = ctx;

  await posgradoMessaging.sendText({
    to: from,
    text:
      '👋 *¡Hola! Bienvenido/a a Tooli Posgrados* 🎓\n' +
      '_Escuela de Transformación Digital · UTB_\n\n' +
      'Responde unas preguntas rápidas (toma 1 minuto) y al *terminar* te compartimos una *oportunidad especial de financiación* para tu posgrado. 🎁',
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

// ── 1. Consentimiento → (si autoriza) pide nombre; (si no) cierra ────────────

export async function handlePosgradoConsent(ctx: Ctx): Promise<void> {
  const { from, text, session } = ctx;
  const input = text.trim().toLowerCase();
  if (input !== 'si' && input !== 'no') { await invalid(from); return; }

  // No autoriza → cerrar respetando su decisión (no se recogen datos personales)
  if (input === 'no') {
    await setPosgradoSession(from, { step: 'posg_completada', data: {} });
    await posgradoMessaging.sendText({
      to: from,
      text:
        '¡Entendido! 🙌 Respetamos tu decisión y no trataremos tus datos.\n\n' +
        'Si quieres explorar los posgrados por tu cuenta, aquí tienes la info 👇\n\n' +
        `🎯 *Especialización:*\n${URL_ESP}\n\n` +
        `🎓 *Maestría:*\n${URL_MAESTRIA}\n\n` +
        `📝 *Inscripción:*\n${URL_INSCRIPCION}`,
    });
    return;
  }

  // Autoriza → guardamos el consentimiento en la sesión y pedimos el nombre
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
    text: `¡Gracias, ${primerNombre(nombre)}! 📧\n\n¿Cuál es tu *correo electrónico*?\n_(Para enviarte la información de los programas)_`,
  });
}

// ── 3. Correo → pregunta de interés (solo Sí / No) ───────────────────────────

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
      { id: 'si', displayText: '✅ Sí' },
      { id: 'no', displayText: '❌ No' },
    ],
  });
}

// ── 4. Interés → guarda y muestra las 2 opciones (o cierra) ───────────────────

export async function handlePosgradoInteres(ctx: Ctx): Promise<void> {
  const { from, text, session } = ctx;
  const input = text.trim().toLowerCase();
  const map: Record<string, string> = { si: 'Sí', no: 'No' };
  const interesFinanciacion = map[input];
  if (!interesFinanciacion) { await invalid(from); return; }

  const d: Record<string, string> = { ...session?.data, interesFinanciacion };

  // Guardar registro (el consentimiento ya fue 'Sí' al inicio del flujo)
  let fila = 0;
  try {
    fila = await guardarRegistroPosgrado({
      whatsapp:            from,
      nombre:              d.nombre ?? '',
      correo:              d.correo ?? '',
      interesFinanciacion,
    });
    if (fila) await actualizarConsentimiento(fila, 'Sí');
  } catch (err) {
    console.error('[posgrados] error guardando registro:', err);
  }

  // No le interesa → cierre con gancho de cupos limitados
  if (input === 'no') {
    await cerrarConCupos(from, 'no');
    return;
  }

  // Sí → elegir entre las 2 opciones
  await setPosgradoSession(from, { step: 'posg_cual', data: { ...d, filaSheet: String(fila) } });

  await posgradoMessaging.sendText({
    to: from,
    text:
      '🎓 *Tenemos 2 programas para ti:*\n\n' +
      '1️⃣ *Especialización en Gestión de Tecnologías Disruptivas en los Negocios*\n' +
      '📌 Presencial · 2 semestres\n\n' +
      '2️⃣ *Maestría en Management de la Transformación Digital*\n' +
      '📌 Presencial · 3 semestres\n\n' +
      '💰 Ambos con financiación del *Posgrado País de ICETEX*.',
  });

  await posgradoMessaging.sendButtons({
    to: from,
    title: BRAND,
    description: '¿En cuál de estas dos opciones estás interesado?',
    footer: 'Elige una opción',
    buttons: [
      { id: 'esp',      displayText: '🎯 Especialización' },
      { id: 'maestria', displayText: '🎓 Maestría' },
    ],
  });
}

// ── 5. ¿Cuál posgrado? → actualiza Sheet + CRM + cierre con cupos ─────────────

export async function handlePosgradoCual(ctx: Ctx): Promise<void> {
  const { from, text, session } = ctx;
  const input = text.trim().toLowerCase();
  if (input !== 'esp' && input !== 'maestria') { await invalid(from); return; }

  const fila  = parseInt(session?.data?.filaSheet ?? '0', 10);
  const valor = input === 'esp' ? NOMBRE_ESP : NOMBRE_MAESTRIA;
  const d     = session?.data ?? {};

  try {
    await actualizarPosgradoInteres(fila, valor);
  } catch (err) {
    console.error('[posgrados] error actualizando posgrado de interés:', err);
  }

  // Autorizó al inicio → empujar el lead a HubSpot (CRM de la UTB) — sin bloquear
  void upsertContactoHubspot({
    email:               d.correo ?? '',
    nombre:              d.nombre ?? '',
    whatsapp:            from,
    posgradoInteres:     valor,
    interesFinanciacion: d.interesFinanciacion ?? '',
    consentimiento:      true,
  });

  // Cierre del flujo: flyer + cupos limitados + enlace de inscripción
  await cerrarConCupos(from, 'si');
}

// ── Completada (si vuelve a escribir) → ofrece info o reiniciar encuesta ──────

export async function handlePosgradoCompletada(ctx: Ctx): Promise<void> {
  const { from } = ctx;

  await setPosgradoSession(from, { step: 'posg_reengage', data: {} });

  await posgradoMessaging.sendButtons({
    to: from,
    title: BRAND,
    description: '¿Te puedo ayudar con algo más?',
    footer: 'Elige una opción 👇',
    buttons: [
      { id: 'info',     displayText: '📄 Información adicional' },
      { id: 'encuesta', displayText: '🔄 Volver a la encuesta' },
    ],
  });
}

// ── Re-enganche → manda info adicional o reinicia el flujo ────────────────────

export async function handlePosgradoReengage(ctx: Ctx): Promise<void> {
  const { from, text } = ctx;
  const input = text.trim().toLowerCase();

  if (input === 'encuesta') {
    await handlePosgradoInicio({ from, text, session: null });
    return;
  }

  if (input === 'info') {
    await posgradoMessaging.sendText({
      to: from,
      text:
        '📚 *Toda la info aquí de la maestría* 👇\n' +
        `${URL_MAESTRIA}\n\n` +
        '🎯 *Toda la info aquí de la especialización* 👇\n' +
        `${URL_ESP}\n\n` +
        '📝 *Enlace de inscripción* 👇\n' +
        `${URL_INSCRIPCION}`,
    });
    // Permanece disponible: si vuelve a escribir, se le ofrece de nuevo el menú
    await setPosgradoSession(from, { step: 'posg_completada', data: {} });
    return;
  }

  await invalid(from);
}
