import { getEventoSession } from './shared';
import {
  handleEventoInicio,
  handleEventoNombre,
  handleEventoEsUTB,
  handleEventoCarrera,
  handleEventoDiplomado,
  handleEventoDiplomadoTexto,
  handleEventoPosgrado,
  handleEventoContacto,
  handleEventoQuiereInfo,
  handleEventoConfirmar,
  handleEventoCompletada,
} from './flow';

type Handler = (ctx: { from: string; text: string; session: any }) => Promise<void>;

const HANDLERS: Record<string, Handler> = {
  evento_nombre:          handleEventoNombre,
  evento_es_utb:          handleEventoEsUTB,
  evento_carrera:         handleEventoCarrera,
  evento_diplomado:       handleEventoDiplomado,
  evento_diplomado_texto: handleEventoDiplomadoTexto,
  evento_posgrado:        handleEventoPosgrado,
  evento_contacto:        handleEventoContacto,
  evento_quiere_info:     handleEventoQuiereInfo,
  evento_confirmar:       handleEventoConfirmar,
  evento_completada:      handleEventoCompletada,
};

export async function handleEventoMessage(from: string, text: string, _inbound?: any): Promise<void> {
  const session = await getEventoSession(from);
  const step    = session?.step ?? 'evento_inicio';

  const handler = HANDLERS[step] ?? handleEventoInicio;

  await handler({ from, text, session });
}
