import { MetaCloudAdapter } from '../../adapters/messaging/MetaCloudAdapter';
import { config } from '../../config';
import { getSession, setSession, Session } from '../../services/session';

// ── Sale por el mismo número de NutriA (mismas credenciales de Meta) ──────────
export const voluntariosMessaging = new MetaCloudAdapter(
  config.nutria.token,
  config.nutria.phoneNumberId
);

// ── Sesiones con prefijo "vol:" para no colisionar con Tooli ni NutriA ────────
const PREFIX = 'vol';

export async function getVolSession(phone: string): Promise<Session | null> {
  return getSession(`${PREFIX}:${phone}`);
}

export async function setVolSession(phone: string, session: Session): Promise<void> {
  return setSession(`${PREFIX}:${phone}`, session);
}
