import { getVolSession } from './shared';
import {
  handleVolInicio,
  handleVolConsentimiento,
  handleVolNombre,
  handleVolCorreo,
  handleVolRechazado,
  handleVolCompletado,
} from './registro';

type Handler = (ctx: { from: string; text: string; session: any; _inbound?: any }) => Promise<void>;

const HANDLERS: Record<string, Handler> = {
  vol_consentimiento: handleVolConsentimiento,
  vol_nombre:         handleVolNombre,
  vol_correo:         handleVolCorreo,
  vol_rechazado:      handleVolRechazado,
  vol_completado:     handleVolCompletado,
};

export async function handleVoluntarioMessage(
  from: string,
  text: string,
  inbound?: any
): Promise<void> {
  const session = await getVolSession(from);
  const step    = session?.step ?? 'vol_inicio';

  const handler = HANDLERS[step] ?? handleVolInicio;

  await handler({ from, text, session, _inbound: inbound });
}
