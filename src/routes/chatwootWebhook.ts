import { Router, Request, Response } from 'express';
import { EvolutionAPIAdapter } from '../adapters/messaging/EvolutionAPIAdapter';
import { getSession, setSession } from '../services/session';

export const chatwootWebhookRouter = Router();

const messaging = new EvolutionAPIAdapter();

/**
 * Webhook que recibe Chatwoot cuando un asesor escribe en una conversación.
 * Eventos relevantes:
 *  - message_created: mensaje nuevo (filtramos los outgoing públicos)
 *  - conversation_status_changed: la conversación cambió de estado (resuelta → cerrar)
 *
 * Validación: comparamos que el conversation pertenezca a nuestro inbox y que
 * el contacto tenga phone_number / identifier que podamos contactar.
 */
chatwootWebhookRouter.post('/', async (req: Request, res: Response) => {
  // Responder rápido para no hacer timeout a Chatwoot
  res.sendStatus(200);

  try {
    const event = req.body?.event;

    if (event === 'message_created') {
      await handleMessageCreated(req.body);
      return;
    }

    if (event === 'conversation_status_changed' || event === 'conversation_resolved') {
      await handleConversationResolved(req.body);
      return;
    }
  } catch (err) {
    console.error('[chatwoot-webhook] error:', err);
  }
});

async function handleMessageCreated(payload: any): Promise<void> {
  // Solo nos interesan mensajes outgoing (del asesor) y no privados (notas internas)
  const messageType = payload?.message_type;
  const isPrivate = payload?.private === true;
  const content = payload?.content;

  if (messageType !== 'outgoing' || isPrivate || !content) return;

  // Sacar el número del usuario (en Chatwoot Inbox API es identifier)
  const phone =
    payload?.conversation?.meta?.sender?.identifier ??
    payload?.sender?.identifier;

  const conversationId =
    payload?.conversation?.id ??
    payload?.conversation_id;

  if (!phone) {
    console.warn('[chatwoot-webhook] mensaje outgoing sin identifier de contacto');
    return;
  }

  console.log('[chatwoot-webhook] reenviando mensaje a WhatsApp:', phone.slice(-4));

  // Reactivar el step "with_agent" del usuario (caso típico: dejó mensaje fuera
  // de horario o escribió "exit", el asesor responde después → su próxima respuesta
  // debe ir al asesor, no al menú).
  if (conversationId) {
    await setSession(phone, {
      step: 'with_agent',
      data: { conversationId: String(conversationId) },
    });
  }

  // Prefijo "Asesor:" para que el usuario vea claro que es un humano respondiéndole
  await messaging.sendText({
    to: phone,
    text: `*Asesor:* ${content}`,
  });
}

async function handleConversationResolved(payload: any): Promise<void> {
  const status = payload?.status ?? payload?.conversation?.status;
  if (status !== 'resolved') return;

  const phone =
    payload?.meta?.sender?.identifier ??
    payload?.conversation?.meta?.sender?.identifier;

  if (!phone) return;

  // Limpiar session del usuario (volver al menú)
  const session = await getSession(phone);
  if (session?.step === 'with_agent') {
    await setSession(phone, { step: 'menu', data: {} });
  }

  await messaging.sendText({
    to: phone,
    text: '✅ La conversación con el asesor fue cerrada.\n\nEscribe *menu* para volver al inicio.',
  });
}
