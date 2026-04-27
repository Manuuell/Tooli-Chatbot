import { Router, Request, Response } from 'express';
import { parseEvolutionWebhook } from '../webhooks/evolutionParser';
import { EvolutionAPIAdapter } from '../adapters/messaging/EvolutionAPIAdapter';
import { getSession, setSession } from '../services/session';
import { consultarTurno } from '../services/turnosService';
import { config } from '../config';

export const webhookRouter = Router();

const messaging = new EvolutionAPIAdapter();

const CODIGO_REGEX = /^T\d{8}$/i;

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
      '*2.* 📄 Estado de solicitudes\n' +
      '     _Próximamente disponible_\n\n' +
      '*3.* 🧑‍💼 Hablar con un agente\n' +
      '     _Lunes a viernes 8am–5pm_',
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
      await messaging.sendText({
        to: from,
        text: '📄 El estado de solicitudes estará disponible _próximamente_.\n\nEscribe *menu* para volver al inicio.',
      });
      return;
    }

    if (input === '3') {
      await messaging.sendText({
        to: from,
        text: '🧑‍💼 En breve un agente del Centro de Servicios te atenderá.\n\n🕐 Horario: lunes a viernes 8am–5pm.',
      });
      return;
    }

    // Cualquier otro mensaje → mostrar menú
    await sendMenu(from);
    return;
  }

  if (step === 'esperando_codigo') {
    const input = text.trim().toUpperCase();

    // Volver al menú
    if (input === 'MENU') {
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
}

webhookRouter.post('/', async (req: Request, res: Response) => {
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

  console.log('[webhook] inbound:', { from: inbound.from, text: inbound.text });

  // Responder 200 inmediatamente — Evolution API no espera respuesta del bot
  res.sendStatus(200);

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
