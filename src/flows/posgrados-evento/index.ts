import { getSession } from '../../services/session';
import { handleMessage } from '../index';
import { getPosgradoSession } from './shared';
import {
  handlePosgradoInicio,
  handlePosgradoNombre,
  handlePosgradoCorreo,
  handlePosgradoInteres,
  handlePosgradoCual,
  handlePosgradoConsent,
  handlePosgradoCompletada,
  handlePosgradoReengage,
} from './flow';
import { HANDLERS_VARIANTE_TALVEZ } from './variante-talvez';

type Handler = (ctx: { from: string; text: string; session: any }) => Promise<void>;

const HANDLERS: Record<string, Handler> = {
  posg_nombre:       handlePosgradoNombre,
  posg_correo:       handlePosgradoCorreo,
  // ── Variante "Tal vez" ACTIVA (Especialización / Maestría / Tal vez) ──
  posg_interes:      HANDLERS_VARIANTE_TALVEZ.posg_interes,
  posg_cual_v:       HANDLERS_VARIANTE_TALVEZ.posg_cual_v,
  posg_confirma_v:   HANDLERS_VARIANTE_TALVEZ.posg_confirma_v,
  posg_cual_final_v: HANDLERS_VARIANTE_TALVEZ.posg_cual_final_v,
  // ── Resto del flujo base (consentimiento al inicio en posg_consent) ──
  posg_consent:      handlePosgradoConsent,
  posg_cual:         handlePosgradoCual,
  posg_completada:   handlePosgradoCompletada,
  posg_reengage:     handlePosgradoReengage,
};

// Pasos del flujo principal a los que cedemos el control (IA / asesor humano)
const MAIN_BRIDGE_STEPS = ['chatting_with_ai', 'with_agent'];

export async function handlePosgradoMessage(from: string, text: string, _inbound?: any): Promise<void> {
  // ── Puente ──────────────────────────────────────────────────────────────────
  // Si el usuario ya fue transferido al asistente IA o a un asesor (sesión
  // principal), delegamos al flujo principal en vez de re-procesar posgrados.
  const mainSession = await getSession(from);
  if (mainSession && MAIN_BRIDGE_STEPS.includes(mainSession.step)) {
    return handleMessage(from, text);
  }

  const session = await getPosgradoSession(from);
  const step    = session?.step ?? 'posg_inicio';

  const handler = HANDLERS[step] ?? handlePosgradoInicio;

  await handler({ from, text, session });
}
