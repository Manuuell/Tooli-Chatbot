import { messaging } from '../shared';
import { getSession, setSession, Session } from '../../services/session';

// ── Reutiliza el adapter del bot principal de Posgrados (mismo número) ────────
export const eventoMessaging = messaging;

// ── Sesiones con prefijo "evento:" para no colisionar con el flujo clásico ────
const PREFIX = 'evento';

export async function getEventoSession(phone: string): Promise<Session | null> {
  return getSession(`${PREFIX}:${phone}`);
}

export async function setEventoSession(phone: string, session: Session): Promise<void> {
  return setSession(`${PREFIX}:${phone}`, session);
}
