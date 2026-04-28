import { Router, Request, Response } from 'express';
import { parseEvolutionWebhook } from '../webhooks/evolutionParser';
import { EvolutionAPIAdapter } from '../adapters/messaging/EvolutionAPIAdapter';
import { getSession, setSession, claimMessageId } from '../services/session';
import { consultarTurno } from '../services/turnosService';
import { loginAndDownloadReceipt } from '../services/icebergService';
import {
  getOrCreateContact,
  createConversation,
  sendIncomingMessage,
  isWithinBusinessHours,
} from '../services/chatwootService';
import { config } from '../config';

const PLATAFORMAS_TI: Record<string, string> = {
  '1': 'Banner / Autoservicio',
  '2': 'Iceberg / Portal Financiero',
  '3': 'Correo institucional',
  '4': 'Aulas virtuales (Moodle)',
  '5': 'Wifi / Red',
  '6': 'Otro',
};

const NIVELES_ADMISIONES: Record<string, string> = {
  '1': 'Pregrado',
  '2': 'Posgrado (maestría / especialización)',
  '3': 'Educación continua / cursos',
  '4': 'No estoy seguro',
};

const ETAPAS_ADMISIONES: Record<string, string> = {
  '1': 'Información general',
  '2': 'Aplicando / inscribiéndose',
  '3': 'Ya admitido con dudas',
  '4': 'Estudiante actual con duda',
};

export const webhookRouter = Router();

const messaging = new EvolutionAPIAdapter();

const CODIGO_REGEX = /^T\d{8}$/i;
const CEDULA_REGEX = /^\d{6,12}$/;

/** Normaliza texto: quita acentos, lowercase, trim. Útil para detectar "menu", "salir", etc. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

function isMenuCommand(text: string): boolean {
  return normalize(text) === 'menu';
}

async function sendAreaPrompt(to: string): Promise<void> {
  await messaging.sendText({
    to,
    text:
      '🧑‍💼 *Hablar con un asesor*\n\n¿En qué área necesitas ayuda?\n\n' +
      '*1.* 🖥️ Soporte TI / Plataformas\n' +
      '*2.* 📝 Soporte Admisiones\n\n' +
      'Escribe *menu* para volver al inicio.',
  });
}

async function sendMenu(to: string): Promise<void> {
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

async function handleMessage(from: string, text: string): Promise<void> {
  const session = await getSession(from);
  const step = session?.step ?? 'menu';

  if (step === 'menu') {
    const input = text.trim();

    if (input === '1') {
      await setSession(from, { step: 'esperando_codigo', data: {} });
      await messaging.sendText({
        to: from,
        text: 'Por favor escribe tu código estudiantil.\nEjemplo: T000XXXXX',
      });
      return;
    }

    if (input === '2') {
      await setSession(from, { step: 'recibo_codigo', data: {} });
      await messaging.sendText({
        to: from,
        text: 'Para descargar tu recibo necesito tus credenciales del portal.\n\nPor favor escribe tu *código estudiantil*.\nEjemplo: T000XXXXX',
      });
      return;
    }

    if (input === '3') {
      if (!isWithinBusinessHours()) {
        await setSession(from, { step: 'agent_outside_hours', data: {} });
        await messaging.sendText({
          to: from,
          text:
            '🕐 En este momento estamos *fuera de horario de atención*.\n' +
            '_Lunes a viernes, 8:00 AM – 8:00 PM_\n\n' +
            '¿Quieres dejar tu mensaje? Un asesor te responderá el próximo día hábil.\n\n' +
            '*1.* Sí, dejar mensaje\n' +
            '*2.* No, volver al menú',
        });
        return;
      }
      await setSession(from, { step: 'agent_area', data: {} });
      await sendAreaPrompt(from);
      return;
    }

    // Cualquier otro mensaje → mostrar menú
    await sendMenu(from);
    return;
  }

  if (step === 'esperando_codigo') {
    const input = text.trim().toUpperCase();

    // Volver al menú
    if (isMenuCommand(input)) {
      await setSession(from, { step: 'menu', data: {} });
      await sendMenu(from);
      return;
    }

    const codigo = input;

    if (!CODIGO_REGEX.test(codigo)) {
      await messaging.sendText({
        to: from,
        text: 'El código no es válido. Debe tener el formato T seguido de 8 dígitos.\nEjemplo: T000XXXXX\n\nInténtalo de nuevo:',
      });
      return;
    }

    try {
      const turno = await consultarTurno(codigo);

      if (!turno) {
        await messaging.sendText({
          to: from,
          text: `No encontré información para el código *${codigo}*.\n\nVerifica que sea correcto o escribe *menu* para volver al inicio.`,
        });
      } else {
        await messaging.sendText({
          to: from,
          text: `📋 *Turno de matrícula*\n\n👤 ${turno.nombre} ${turno.apellido}\n🎓 ${turno.programa}\n🔢 Turno: *${turno.turno}*\n📅 Fecha: ${turno.fecha}\n⏰ Hora: ${turno.hora}\n\nEscribe *menu* para volver al inicio.`,
        });
      }
    } catch {
      await messaging.sendText({
        to: from,
        text: 'Ocurrió un error consultando tu turno. Por favor intenta más tarde o escribe *menu* para volver al inicio.',
      });
    }

    await setSession(from, { step: 'menu', data: {} });
    return;
  }

  if (step === 'recibo_codigo') {
    const input = text.trim().toUpperCase();

    if (isMenuCommand(input)) {
      await setSession(from, { step: 'menu', data: {} });
      await sendMenu(from);
      return;
    }

    if (!CODIGO_REGEX.test(input)) {
      await messaging.sendText({
        to: from,
        text: 'El código no es válido. Debe tener el formato T seguido de 8 dígitos.\nEjemplo: T000XXXXX\n\nInténtalo de nuevo o escribe *menu*:',
      });
      return;
    }

    await setSession(from, { step: 'recibo_cedula', data: { codigo: input } });
    await messaging.sendText({
      to: from,
      text: 'Ahora escribe tu *número de cédula* (solo dígitos, sin puntos ni guiones).',
    });
    return;
  }

  if (step === 'recibo_cedula') {
    const input = text.trim();

    if (isMenuCommand(input)) {
      await setSession(from, { step: 'menu', data: {} });
      await sendMenu(from);
      return;
    }

    if (!CEDULA_REGEX.test(input)) {
      await messaging.sendText({
        to: from,
        text: 'La cédula no es válida. Debe tener entre 6 y 12 dígitos.\n\nInténtalo de nuevo o escribe *menu*:',
      });
      return;
    }

    const codigo = session?.data.codigo;
    if (!codigo) {
      await setSession(from, { step: 'menu', data: {} });
      await messaging.sendText({ to: from, text: 'Sesión expirada. Por favor inicia de nuevo escribiendo *menu*.' });
      return;
    }

    await messaging.sendText({
      to: from,
      text: '🔄 Estoy descargando tu recibo del portal. Esto puede tardar 30-60 segundos…',
    });

    try {
      const result = await loginAndDownloadReceipt(codigo, input);

      if (!result.ok) {
        await messaging.sendText({
          to: from,
          text: `No pude completar el proceso. ${result.error?.includes('Login falló') ? 'Verifica que el código y la cédula sean correctos.' : 'Intenta más tarde.'}\n\nEscribe *menu* para volver al inicio.`,
        });
      } else if (result.noRecibos) {
        const saludo = result.nombre ? `Hola *${result.nombre}*. ` : '';
        await messaging.sendText({
          to: from,
          text: `${saludo}No tienes recibos pendientes en el portal en este momento.\n\nEscribe *menu* para volver al inicio.`,
        });
      } else if (result.pdf) {
        await messaging.sendDocument({
          to: from,
          buffer: result.pdf,
          fileName: `recibo-${codigo}.pdf`,
          mimetype: 'application/pdf',
          caption: `🧾 Recibo de matrícula${result.nombre ? ` — ${result.nombre}` : ''}`,
        });
        await messaging.sendText({ to: from, text: 'Listo. Escribe *menu* para volver al inicio.' });
      } else {
        await messaging.sendText({
          to: from,
          text: 'No pude descargar el recibo. Por favor intenta más tarde o escribe *menu*.',
        });
      }
    } catch (err) {
      console.error('[recibo] error:', err);
      await messaging.sendText({
        to: from,
        text: 'Ocurrió un error inesperado. Intenta más tarde o escribe *menu*.',
      });
    }

    await setSession(from, { step: 'menu', data: {} });
    return;
  }

  // ─────────────────────────────────────────
  // Flujo: hablar con asesor
  // ─────────────────────────────────────────

  if (step === 'agent_outside_hours') {
    const input = text.trim();
    if (input === '1') {
      await setSession(from, { step: 'agent_area', data: { outsideHours: 'true' } });
      await sendAreaPrompt(from);
      return;
    }
    if (input === '2' || isMenuCommand(input)) {
      await setSession(from, { step: 'menu', data: {} });
      await sendMenu(from);
      return;
    }
    await messaging.sendText({
      to: from,
      text: 'Responde *1* para dejar mensaje o *2* para volver al menú.',
    });
    return;
  }

  if (step === 'agent_area') {
    const input = text.trim();
    if (isMenuCommand(input)) {
      await setSession(from, { step: 'menu', data: {} });
      await sendMenu(from);
      return;
    }
    if (input === '1') {
      await setSession(from, { step: 'agent_ti_p1', data: { ...session?.data, area: 'ti' } });
      await messaging.sendText({
        to: from,
        text:
          '🖥️ *Soporte TI*\n\n¿Con qué plataforma tienes el problema?\n\n' +
          '*1.* Banner / Autoservicio\n' +
          '*2.* Iceberg / Portal Financiero\n' +
          '*3.* Correo institucional\n' +
          '*4.* Aulas virtuales (Moodle)\n' +
          '*5.* Wifi / Red\n' +
          '*6.* Otro',
      });
      return;
    }
    if (input === '2') {
      await setSession(from, { step: 'agent_admisiones_p1', data: { ...session?.data, area: 'admisiones' } });
      await messaging.sendText({
        to: from,
        text:
          '📝 *Soporte Admisiones*\n\n¿Sobre qué nivel necesitas ayuda?\n\n' +
          '*1.* Pregrado\n' +
          '*2.* Posgrado (maestría / especialización)\n' +
          '*3.* Educación continua / cursos\n' +
          '*4.* No estoy seguro',
      });
      return;
    }
    await messaging.sendText({ to: from, text: 'Responde *1* para TI o *2* para Admisiones.' });
    return;
  }

  if (step === 'agent_ti_p1') {
    const input = text.trim();
    if (isMenuCommand(input)) {
      await setSession(from, { step: 'menu', data: {} });
      await sendMenu(from);
      return;
    }
    const plataforma = PLATAFORMAS_TI[input];
    if (!plataforma) {
      await messaging.sendText({ to: from, text: 'Responde con un número del *1* al *6*.' });
      return;
    }
    await setSession(from, {
      step: 'agent_ti_p2',
      data: { ...session?.data, plataforma },
    });
    await messaging.sendText({
      to: from,
      text: 'Describe brevemente el problema (1-2 líneas).\n_Ej: "olvidé mi contraseña", "me sale error al ingresar"._',
    });
    return;
  }

  if (step === 'agent_ti_p2') {
    if (isMenuCommand(text)) {
      await setSession(from, { step: 'menu', data: {} });
      await sendMenu(from);
      return;
    }
    const data = { ...session?.data, descripcion: text.trim() };
    await iniciarConversacionAsesor(from, data);
    return;
  }

  if (step === 'agent_admisiones_p1') {
    const input = text.trim();
    if (isMenuCommand(input)) {
      await setSession(from, { step: 'menu', data: {} });
      await sendMenu(from);
      return;
    }
    const nivel = NIVELES_ADMISIONES[input];
    if (!nivel) {
      await messaging.sendText({ to: from, text: 'Responde con un número del *1* al *4*.' });
      return;
    }
    await setSession(from, {
      step: 'agent_admisiones_p2',
      data: { ...session?.data, nivel },
    });
    await messaging.sendText({
      to: from,
      text:
        '¿En qué etapa del proceso estás?\n\n' +
        '*1.* Necesito información general\n' +
        '*2.* Estoy aplicando / inscribiéndome\n' +
        '*3.* Ya fui admitido y tengo dudas\n' +
        '*4.* Soy estudiante actual con duda académica',
    });
    return;
  }

  if (step === 'agent_admisiones_p2') {
    const input = text.trim();
    if (isMenuCommand(input)) {
      await setSession(from, { step: 'menu', data: {} });
      await sendMenu(from);
      return;
    }
    const etapa = ETAPAS_ADMISIONES[input];
    if (!etapa) {
      await messaging.sendText({ to: from, text: 'Responde con un número del *1* al *4*.' });
      return;
    }
    await setSession(from, {
      step: 'agent_admisiones_p3',
      data: { ...session?.data, etapa },
    });
    await messaging.sendText({
      to: from,
      text: 'Cuéntame brevemente tu pregunta o situación.',
    });
    return;
  }

  if (step === 'agent_admisiones_p3') {
    if (isMenuCommand(text)) {
      await setSession(from, { step: 'menu', data: {} });
      await sendMenu(from);
      return;
    }
    const data = { ...session?.data, descripcion: text.trim() };
    await iniciarConversacionAsesor(from, data);
    return;
  }

  if (step === 'with_agent') {
    const input = normalize(text);
    if (input === 'salir' || input === 'menu') {
      await setSession(from, { step: 'menu', data: {} });
      await messaging.sendText({
        to: from,
        text: '✅ Saliste del chat con el asesor.\n\nEscribe cualquier cosa para ver el menú.',
      });
      return;
    }
    const conversationId = parseInt(session?.data.conversationId ?? '0');
    if (!conversationId) {
      await setSession(from, { step: 'menu', data: {} });
      await messaging.sendText({ to: from, text: 'Sesión expirada. Escribe *menu* para volver.' });
      return;
    }
    try {
      await sendIncomingMessage(conversationId, text);
    } catch (err) {
      console.error('[with_agent] error reenviando a Chatwoot:', err);
      await messaging.sendText({
        to: from,
        text: 'No pude enviar tu mensaje al asesor. Intenta de nuevo o escribe *salir* para volver al menú.',
      });
    }
    return;
  }
}

/**
 * Crea contacto + conversación en Chatwoot con todo el contexto recolectado
 * y deja al usuario en step "with_agent" para que sus próximos mensajes se reenvíen.
 */
async function iniciarConversacionAsesor(from: string, data: Record<string, string>): Promise<void> {
  const fueraHorario = data.outsideHours === 'true';
  const area = data.area;
  const teamId =
    area === 'ti'
      ? parseInt(config.chatwoot.teamTiId)
      : parseInt(config.chatwoot.teamAdmisionesId);

  // Construir contexto que verá el asesor
  const ahora = new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'short',
    timeStyle: 'short',
  });

  let contexto = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  contexto += `🆘 Solicitud nueva — ${area === 'ti' ? 'Soporte TI' : 'Soporte Admisiones'}\n`;
  contexto += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  contexto += `📱 WhatsApp: +${from}\n`;
  contexto += `📅 Recibido: ${ahora}\n`;
  contexto += `🕐 Dentro de horario: ${fueraHorario ? '❌ NO (fuera de horario)' : '✅ Sí'}\n\n`;

  if (area === 'ti') {
    contexto += `🔎 Plataforma: ${data.plataforma}\n`;
    contexto += `📝 Problema: ${data.descripcion}\n`;
  } else {
    contexto += `🎓 Nivel: ${data.nivel}\n`;
    contexto += `📌 Etapa: ${data.etapa}\n`;
    contexto += `📝 Pregunta: ${data.descripcion}\n`;
  }
  contexto += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  await messaging.sendText({
    to: from,
    text: '⏳ Conectándote con un asesor…',
  });

  try {
    const contact = await getOrCreateContact(from, `Usuario ${from.slice(-4)}`);
    const conversationId = await createConversation({
      sourceId: contact.sourceId,
      contactId: contact.contactId,
      teamId,
      initialMessage: contexto,
      customAttributes: {
        area: area === 'ti' ? 'Soporte TI' : 'Soporte Admisiones',
        ...(area === 'ti'
          ? { plataforma: data.plataforma }
          : { nivel: data.nivel, etapa: data.etapa }),
      },
      labels: fueraHorario ? ['fuera-horario'] : undefined,
    });

    await setSession(from, {
      step: 'with_agent',
      data: { conversationId: String(conversationId), area },
    });

    if (fueraHorario) {
      await messaging.sendText({
        to: from,
        text:
          '✅ Tu mensaje quedó registrado. Un asesor te responderá *el próximo día hábil*.\n\n' +
          'Si quieres cancelar, escribe *salir*.',
      });
    } else {
      await messaging.sendText({
        to: from,
        text:
          '✅ Listo. Un asesor te responderá en breve.\n\n' +
          'Cualquier mensaje que escribas le llegará al asesor. Para terminar la conversación, escribe *salir*.',
      });
    }
  } catch (err) {
    console.error('[chatwoot] error creando conversación:', err);
    await setSession(from, { step: 'menu', data: {} });
    await messaging.sendText({
      to: from,
      text: 'No pude conectarte con un asesor en este momento. Intenta más tarde o escribe *menu*.',
    });
  }
}

webhookRouter.post(['/', '/:event'], async (req: Request, res: Response) => {
  const apikey = req.body?.apikey;
  if (apikey !== config.webhookSecret) {
    res.sendStatus(401);
    return;
  }

  console.log('[webhook] event:', req.body?.event, 'fromMe:', req.body?.data?.key?.fromMe, 'remoteJid:', req.body?.data?.key?.remoteJid, 'senderPn:', req.body?.data?.key?.senderPn);

  const inbound = parseEvolutionWebhook(req.body);

  if (!inbound) {
    console.log('[webhook] parser returned null — ignored');
    res.sendStatus(200);
    return;
  }

  console.log('[webhook] inbound:', { from: inbound.from, text: inbound.text, id: inbound.messageId });

  // Responder 200 inmediatamente — Evolution API no espera respuesta del bot
  res.sendStatus(200);

  // Deduplicación: si este messageId ya fue procesado, ignorar
  // (Evolution API o el setup webhook-en-instancia + global pueden disparar 2x el mismo evento)
  const isNew = await claimMessageId(inbound.messageId);
  if (!isNew) {
    console.log('[webhook] mensaje duplicado, ignorado:', inbound.messageId);
    return;
  }

  // Resolver @lid → número real antes de pasar al handler
  messaging.resolveSenderId(inbound.from)
    .then(resolvedFrom => {
      // Si sigue siendo @lid, no podemos responder (usuario con privacidad estricta o spam).
      // Log y skip — Evolution rechazaría el envío con 400 de todos modos.
      if (resolvedFrom.endsWith('@lid')) {
        console.warn('[webhook] no se pudo resolver número real para', resolvedFrom, '— ignorando mensaje');
        return;
      }
      if (resolvedFrom !== inbound.from) {
        console.log('[webhook] resolved', inbound.from, '→', resolvedFrom);
      }
      return handleMessage(resolvedFrom, inbound.text);
    })
    .catch(err => {
      console.error('Error en handleMessage para', inbound.from.slice(-4), err);
    });
});
