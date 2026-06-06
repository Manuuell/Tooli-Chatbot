import { messaging } from '../shared';
import { getSession, setSession, Session } from '../../services/session';

// ── Reutiliza el adapter del bot principal de Posgrados (mismo número) ────────
export const posgradoMessaging = messaging;

// ── Sesiones con prefijo "posg:" para no colisionar con otros flujos ──────────
const PREFIX = 'posg';

export async function getPosgradoSession(phone: string): Promise<Session | null> {
  return getSession(`${PREFIX}:${phone}`);
}

export async function setPosgradoSession(phone: string, session: Session): Promise<void> {
  return setSession(`${PREFIX}:${phone}`, session);
}
