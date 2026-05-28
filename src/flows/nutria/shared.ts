import { MetaCloudAdapter } from '../../adapters/messaging/MetaCloudAdapter';
import { config } from '../../config';
import { getSession, setSession, Session } from '../../services/session';

// ── Adapter propio de NutriA (usa sus propias credenciales) ──────────────────
export const nutriaMessaging = new MetaCloudAdapter(
  config.nutria.token,
  config.nutria.phoneNumberId
);

// ── Sesiones con prefijo "nutria:" para no colisionar con Tooli ───────────────
const PREFIX = 'nutria';

export async function getNutriaSession(phone: string): Promise<Session | null> {
  return getSession(`${PREFIX}:${phone}`);
}

export async function setNutriaSession(phone: string, session: Session): Promise<void> {
  return setSession(`${PREFIX}:${phone}`, session);
}
