import axios, { AxiosInstance } from 'axios';
import { config } from '../config';

let client: AxiosInstance | null = null;

function cw(): AxiosInstance {
  if (!client) {
    client = axios.create({
      baseURL: `${config.chatwoot.url}/api/v1/accounts/${config.chatwoot.accountId}`,
      headers: { api_access_token: config.chatwoot.apiToken },
      timeout: 15_000,
    });
  }
  return client;
}

export interface ChatwootContact {
  contactId: number;
  sourceId: string;
}

/**
 * Busca un contacto por número de teléfono en el inbox o lo crea si no existe.
 * `phoneNumber` debe ser solo dígitos (E.164 sin el +), ej: "573215640735"
 */
export async function getOrCreateContact(phoneNumber: string, name: string): Promise<ChatwootContact> {
  const inboxId = parseInt(config.chatwoot.inboxId);

  // 1. Buscar por identifier
  try {
    const search = await cw().get('/contacts/search', { params: { q: phoneNumber } });
    const existing = search.data?.payload?.find(
      (c: any) => c.identifier === phoneNumber || c.phone_number === `+${phoneNumber}`
    );

    if (existing) {
      // Buscar contact_inbox para nuestro inbox
      const ci = await cw().get(`/contacts/${existing.id}/contactable_inboxes`);
      const inb = ci.data?.payload?.find((x: any) => x.inbox?.id === inboxId);
      if (inb?.source_id) {
        return { contactId: existing.id, sourceId: inb.source_id };
      }
      // No existe contact_inbox para este inbox → crearlo
      const newCi = await cw().post(`/contacts/${existing.id}/contact_inboxes`, {
        inbox_id: inboxId,
        source_id: phoneNumber,
      });
      return { contactId: existing.id, sourceId: newCi.data?.source_id ?? phoneNumber };
    }
  } catch (err: any) {
    console.error('[chatwoot] error buscando contacto:', err?.response?.data ?? err?.message);
  }

  // 2. Crear contacto nuevo
  const create = await cw().post('/contacts', {
    inbox_id: inboxId,
    name,
    phone_number: `+${phoneNumber}`,
    identifier: phoneNumber,
  });

  const contact = create.data?.payload?.contact;
  const contactInbox = create.data?.payload?.contact_inbox;
  if (!contact?.id) throw new Error('Chatwoot no devolvió contact.id');

  return {
    contactId: contact.id,
    sourceId: contactInbox?.source_id ?? phoneNumber,
  };
}

export interface CreateConversationOpts {
  sourceId: string;
  contactId: number;
  /** ID del Team al que asignar (Soporte TI o Soporte Admisiones) */
  teamId: number;
  /** Mensaje inicial visible para el asesor (resumen del caso) */
  initialMessage: string;
  /** Atributos extra que se ven en el panel del agente */
  customAttributes?: Record<string, string>;
  /** Etiquetas (labels) para clasificar */
  labels?: string[];
  /** Prioridad: low | medium | high | urgent */
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  /** Nota privada inicial (solo visible para asesores, no para el usuario) */
  privateNote?: string;
}

/**
 * Crea una conversación nueva en Chatwoot, asignada a un team.
 * Devuelve el conversation_id.
 */
export async function createConversation(opts: CreateConversationOpts): Promise<number> {
  const inboxId = parseInt(config.chatwoot.inboxId);

  const res = await cw().post('/conversations', {
    source_id: opts.sourceId,
    inbox_id: inboxId,
    contact_id: opts.contactId,
    team_id: opts.teamId,
    custom_attributes: opts.customAttributes ?? {},
    additional_attributes: opts.customAttributes ?? {},
    message: { content: opts.initialMessage, message_type: 'incoming' },
  });

  const conversationId: number | undefined = res.data?.id;
  if (!conversationId) throw new Error('Chatwoot no devolvió conversation.id');

  // Aplicar labels si hay
  if (opts.labels?.length) {
    await cw().post(`/conversations/${conversationId}/labels`, { labels: opts.labels }).catch(() => {});
  }

  // Setear priority si aplica
  if (opts.priority) {
    await cw()
      .post(`/conversations/${conversationId}/toggle_priority`, { priority: opts.priority })
      .catch(() => {});
  }

  // Agregar nota privada con el contexto del AI si aplica
  if (opts.privateNote) {
    await cw()
      .post(`/conversations/${conversationId}/messages`, {
        content: opts.privateNote,
        message_type: 'outgoing',
        private: true,
      })
      .catch(() => {});
  }

  return conversationId;
}

/**
 * Agrega una nota privada (solo visible para asesores) a una conversación existente.
 */
export async function addPrivateNote(conversationId: number, content: string): Promise<void> {
  await cw()
    .post(`/conversations/${conversationId}/messages`, {
      content,
      message_type: 'outgoing',
      private: true,
    })
    .catch(() => {});
}

/**
 * Envía un mensaje "incoming" (del usuario) a una conversación existente.
 * Esto es lo que se usa cuando el usuario sigue escribiendo y queremos
 * reenviarlo al asesor en Chatwoot.
 */
export async function sendIncomingMessage(conversationId: number, content: string): Promise<void> {
  await cw().post(`/conversations/${conversationId}/messages`, {
    content,
    message_type: 'incoming',
  });
}

/**
 * Marca una conversación como resuelta.
 */
export async function resolveConversation(conversationId: number): Promise<void> {
  await cw().post(`/conversations/${conversationId}/toggle_status`, { status: 'resolved' }).catch(() => {});
}

/**
 * Verifica si la fecha actual está dentro del horario de atención
 * Lunes a viernes, 8:00 AM – 8:00 PM hora de Bogotá (UTC-5).
 */
export function isWithinBusinessHours(now: Date = new Date()): boolean {
  const bogotaStr = now.toLocaleString('en-US', {
    timeZone: 'America/Bogota',
    hour12: false,
  });
  const bogota = new Date(bogotaStr);
  const day = bogota.getDay(); // 0=Dom, 6=Sáb
  if (day === 0 || day === 6) return false;
  const hour = bogota.getHours();
  return hour >= 8 && hour < 20;
}
