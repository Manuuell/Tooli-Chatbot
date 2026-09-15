import { Session } from '../../services/session';
import { getVolSession, setVolSession, voluntariosMessaging as msg } from './shared';
import { guardarVoluntario, yaRegistrado } from '../../services/voluntariosSheets';

interface Ctx {
  from: string;
  text: string;
  session: Session | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Correo válido "de verdad": un @ , dominio con punto y TLD de 2+ letras. */
const EMAIL_RE = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;

async function pedirNombre(to: string): Promise<void> {
  await msg.sendText({
    to,
    text:
      '✍️ *¿Cuál es tu nombre y apellido?*\n\n' +
      'Escríbelo tal como quieres que aparezca en el equipo 👇',
  });
}

async function pedirCorreo(to: string, nombre: string): Promise<void> {
  await msg.sendText({
    to,
    text:
      `¡Gracias, ${nombre}! 🙌\n\n` +
      '📧 *¿Cuál es tu correo electrónico?*\n\n' +
      '_Lo necesitamos para enviarte la invitación a probar la app cuando esté lista._',
  });
}

// ── 0. Inicio → presentación + consentimiento ─────────────────────────────────

export async function handleVolInicio(ctx: Ctx): Promise<void> {
  const { from } = ctx;

  await msg.sendText({
    to: from,
    text:
      '👋 *¡Hola! Bienvenido/a a El Mundo Te Busca* 🌎\n\n' +
      'Somos una plataforma ciudadana *sin fines de lucro* para ayudar a localizar ' +
      'personas desaparecidas y coordinar ayuda tras el terremoto.\n\n' +
      'Estamos armando un equipo de *voluntarios digitales* 💻 — personas que nos ' +
      'ayuden a probar la aplicación que estamos construyendo y a difundirla.\n\n' +
      '⏱️ Registrarte toma *menos de 1 minuto*.',
  });

  await msg.sendText({
    to: from,
    text:
      '🔒 *Tratamiento de tus datos*\n\n' +
      'Vamos a guardar tu *nombre*, tu *correo* y este *número de WhatsApp* con un ' +
      'único fin: contactarte para que participes como *betatester* de la aplicación ' +
      'y coordinar el voluntariado.\n\n' +
      '• No compartimos tus datos con terceros\n' +
      '• No los usamos para publicidad\n' +
      '• Puedes pedir que los borremos cuando quieras, escribiendo *salir*\n\n' +
      'Al aceptar, autorizas que te contactemos por estos medios.',
  });

  await setVolSession(from, { step: 'vol_consentimiento', data: {} });

  await msg.sendButtons({
    to: from,
    title: 'El Mundo Te Busca',
    description: '¿Aceptas registrarte como voluntario/a digital?',
    footer: 'Plataforma ciudadana sin fines de lucro',
    buttons: [
      { id: 'si', displayText: '✅ Sí, quiero' },
      { id: 'no', displayText: '❌ Ahora no' },
    ],
  });
}

// ── 1. Consentimiento ─────────────────────────────────────────────────────────

export async function handleVolConsentimiento(ctx: Ctx): Promise<void> {
  const { from, text } = ctx;
  const input = text.trim().toLowerCase();

  if (input !== 'si' && input !== 'no') {
    await msg.sendText({ to: from, text: 'Por favor responde usando los botones 👆' });
    return;
  }

  if (input === 'no') {
    await setVolSession(from, { step: 'vol_rechazado', data: {} });
    await msg.sendText({
      to: from,
      text:
        'Sin problema, gracias por tu tiempo 🙏\n\n' +
        'Si cambias de opinión, escribe *voluntario* y te registramos en un minuto.\n\n' +
        '🌎 *El Mundo Te Busca*',
    });
    return;
  }

  await setVolSession(from, { step: 'vol_nombre', data: { consentimiento: 'Sí' } });
  await pedirNombre(from);
}

// ── 2. Nombre ─────────────────────────────────────────────────────────────────

export async function handleVolNombre(ctx: Ctx): Promise<void> {
  const { from, text, session } = ctx;
  const nombre = text.trim().replace(/\s+/g, ' ');

  if (nombre.length < 3 || nombre.length > 80) {
    await msg.sendText({
      to: from,
      text: '🤔 Ese nombre no parece válido. Escribe tu nombre y apellido 👇',
    });
    return;
  }

  await setVolSession(from, { step: 'vol_correo', data: { ...session?.data, nombre } });
  await pedirCorreo(from, nombre.split(' ')[0]);
}

// ── 3. Correo → guardar ───────────────────────────────────────────────────────

export async function handleVolCorreo(ctx: Ctx): Promise<void> {
  const { from, text, session } = ctx;
  const correo = text.trim().toLowerCase();

  if (!EMAIL_RE.test(correo)) {
    await msg.sendText({
      to: from,
      text:
        '📧 Ese correo no parece válido.\n\n' +
        'Escríbelo completo, por ejemplo: *tunombre@gmail.com* 👇',
    });
    return;
  }

  const nombre = session?.data.nombre ?? '';

  // Evita filas duplicadas si alguien reinicia el flujo
  if (await yaRegistrado(from)) {
    await setVolSession(from, { step: 'vol_completado', data: {} });
    await msg.sendText({
      to: from,
      text: '✅ ¡Ya estabas registrado/a con este número! No hace falta hacerlo de nuevo. 🙌',
    });
    return;
  }

  try {
    await guardarVoluntario({
      whatsapp: from,
      nombre,
      correo,
      consentimiento: session?.data.consentimiento ?? 'Sí',
    });
  } catch (err) {
    console.error('[voluntarios] error guardando registro:', err);
    await msg.sendText({
      to: from,
      text:
        '⚠️ Tuvimos un problema guardando tu registro.\n\n' +
        'Por favor escribe tu correo otra vez en unos segundos 🙏',
    });
    return;
  }

  await setVolSession(from, { step: 'vol_completado', data: {} });

  await msg.sendText({
    to: from,
    text:
      `✅ *¡Listo, ${nombre.split(' ')[0]}! Ya eres voluntario/a digital* 🎉\n\n` +
      'Te escribiremos a *' + correo + '* con la invitación para probar la aplicación ' +
      'apenas esté lista.\n\n' +
      '*Mientras tanto, la mejor ayuda es difundir:*\n' +
      '🌎 https://elmundotebusca.com\n\n' +
      'Entre más personas vean la página, más personas pueden estar a salvo. 🙏',
  });
}

// ── Estados finales ───────────────────────────────────────────────────────────

export async function handleVolRechazado(ctx: Ctx): Promise<void> {
  const { from, text } = ctx;

  if (['voluntario', 'voluntaria', 'registrar', 'registro'].includes(text.trim().toLowerCase())) {
    await handleVolInicio(ctx);
    return;
  }

  await msg.sendText({
    to: from,
    text: 'Escribe *voluntario* si quieres registrarte como voluntario/a digital. 🌎',
  });
}

export async function handleVolCompletado(ctx: Ctx): Promise<void> {
  const { from, text } = ctx;
  const input = text.trim().toLowerCase();

  if (input === 'salir' || input === 'borrar') {
    await msg.sendText({
      to: from,
      text:
        'Entendido 🙏 Escríbenos a *hola@elmundotebusca.com* desde este mismo número ' +
        'y eliminamos tus datos de inmediato.',
    });
    return;
  }

  await msg.sendText({
    to: from,
    text:
      '✅ Ya estás registrado/a como voluntario/a digital. ¡Gracias! 🙌\n\n' +
      'Te avisaremos por correo cuando la app esté lista para probar.\n\n' +
      '🌎 https://elmundotebusca.com\n\n' +
      '_Escribe *salir* si deseas que eliminemos tus datos._',
  });
}
