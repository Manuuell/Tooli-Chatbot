import { z } from 'zod';
import { InboundMessage } from '../adapters/messaging/IMessagingAdapter';

// Payload de Evolution API v2 para evento MESSAGES_UPSERT
const EvolutionPayloadSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.object({
    key: z.object({
      remoteJid: z.string(),
      id: z.string(),
      fromMe: z.boolean(),
      // senderPn aparece cuando remoteJid usa formato @lid (nuevo WhatsApp)
      senderPn: z.string().optional(),
    }),
    message: z.object({
      conversation: z.string().optional(),
      extendedTextMessage: z.object({ text: z.string() }).optional(),
    }),
    messageTimestamp: z.number(),
  }),
});

export type EvolutionPayload = z.infer<typeof EvolutionPayloadSchema>;

export function parseEvolutionWebhook(body: unknown): InboundMessage | null {
  const result = EvolutionPayloadSchema.safeParse(body);

  if (!result.success) return null;

  const { data } = result.data;

  // Ignorar mensajes propios
  if (data.key.fromMe) return null;

  const text =
    data.message.conversation ??
    data.message.extendedTextMessage?.text;

  if (!text) return null; // audio, imagen, sticker — ignorar por ahora

  // senderPn tiene el número real cuando remoteJid usa formato @lid
  const jid = data.key.senderPn ?? data.key.remoteJid;
  const from = jid.split('@')[0];

  return {
    from,
    messageId: data.key.id,
    text,
    timestamp: data.messageTimestamp,
  };
}
