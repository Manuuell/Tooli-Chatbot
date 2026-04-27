import { z } from 'zod';
import { InboundMessage } from '../adapters/messaging/IMessagingAdapter';

// Payload de Evolution API v2 para evento MESSAGES_UPSERT
const EvolutionPayloadSchema = z.object({
  event: z.string(),
  instance: z.string(),
  // sender: número real en formato E.164 con @s.whatsapp.net (nivel raíz del payload)
  sender: z.string().optional(),
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
      // Respuesta de botón interactivo
      buttonsResponseMessage: z.object({
        selectedButtonId: z.string(),
      }).optional(),
      // Respuesta de lista interactiva
      listResponseMessage: z.object({
        singleSelectReply: z.object({
          selectedRowId: z.string(),
        }).optional(),
      }).optional(),
    }),
    messageTimestamp: z.number(),
  }),
});

export type EvolutionPayload = z.infer<typeof EvolutionPayloadSchema>;

export function parseEvolutionWebhook(body: unknown): InboundMessage | null {
  const result = EvolutionPayloadSchema.safeParse(body);

  if (!result.success) return null;

  const { data, sender } = result.data;

  // Ignorar mensajes propios
  if (data.key.fromMe) return null;

  // Extraer texto en orden de prioridad:
  // 1. Mensaje de texto normal
  // 2. Texto extendido (links, menciones)
  // 3. ID del botón pulsado
  // 4. ID de la fila de lista seleccionada
  const text =
    data.message.conversation ??
    data.message.extendedTextMessage?.text ??
    data.message.buttonsResponseMessage?.selectedButtonId ??
    data.message.listResponseMessage?.singleSelectReply?.selectedRowId;

  if (!text) return null; // audio, imagen, sticker — ignorar

  // Identificador del remitente para responder. Prioridad:
  // 1. senderPn (número E.164 real, cuando Evolution lo incluye)
  // 2. remoteJid completo (@s.whatsapp.net o @lid) — Evolution routea ambos formatos
  // NOTA: el campo `sender` del payload raíz es el número de la INSTANCIA (el bot), NO el remitente.
  const remoteJid = data.key.remoteJid;
  // `from` se devuelve sin el sufijo @… cuando es número, o como JID completo si es @lid
  let from: string;
  if (data.key.senderPn) {
    from = data.key.senderPn.split('@')[0];
  } else if (remoteJid.endsWith('@s.whatsapp.net')) {
    from = remoteJid.split('@')[0];
  } else {
    // @lid u otro formato: pasamos el JID completo como destinatario
    from = remoteJid;
  }

  // Guard: nunca responder al propio número de la instancia (self-message)
  if (sender && from === sender.split('@')[0]) return null;

  return {
    from,
    messageId: data.key.id,
    text,
    timestamp: data.messageTimestamp,
  };
}
