import { getSession } from '../services/session';
import { FlowContext, sendMenu } from './shared';
import { handleMenu } from './menu';
import { handleProgramasCategoria, handleProgramasDetalle } from './programas';
import { handleProspectoNombre, handleProspectoEmail, handleProspectoPrograma } from './prospecto';
import { handleRegistroNombre, handleRegistroEmail, handleRegistroPrograma } from './registro';
import { handleChattingWithAI } from './aiChat';
import { handleWithAgent } from './withAgent';
// Flujos legacy (turno, recibo, TI) — se mantienen por si algún usuario tiene sesión activa
import { handleEsperandoCodigo } from './turno';
import { handleReciboCodigo, handleReciboCedula } from './recibo';
import {
  handleAgentOutsideHours,
  handleAgentArea,
  handleAgentTiP1,
  handleAgentTiP2,
  handleAgentAdmisionesP1,
  handleAgentAdmisionesP2,
  handleAgentAdmisionesP3,
} from './agent';
import { handleTiCollectEmail, handleTiCollectCodigo, handleTiCollectCedula } from './identity';

const HANDLERS: Record<string, (ctx: FlowContext) => Promise<void>> = {
  // ── Posgrados ────────────────────────────────────────────────────────────────
  menu: handleMenu,
  programas_categoria: handleProgramasCategoria,
  programas_detalle: handleProgramasDetalle,
  prospecto_nombre: handleProspectoNombre,
  prospecto_email: handleProspectoEmail,
  prospecto_programa: handleProspectoPrograma,
  registro_nombre: handleRegistroNombre,
  registro_email: handleRegistroEmail,
  registro_programa: handleRegistroPrograma,
  chatting_with_ai: handleChattingWithAI,
  with_agent: handleWithAgent,
  // ── Legacy (sesiones activas anteriores) ────────────────────────────────────
  esperando_codigo: handleEsperandoCodigo,
  recibo_codigo: handleReciboCodigo,
  recibo_cedula: handleReciboCedula,
  agent_outside_hours: handleAgentOutsideHours,
  agent_area: handleAgentArea,
  agent_ti_p1: handleAgentTiP1,
  agent_ti_p2: handleAgentTiP2,
  agent_admisiones_p1: handleAgentAdmisionesP1,
  agent_admisiones_p2: handleAgentAdmisionesP2,
  agent_admisiones_p3: handleAgentAdmisionesP3,
  ti_collect_email: handleTiCollectEmail,
  ti_collect_codigo: handleTiCollectCodigo,
  ti_collect_cedula: handleTiCollectCedula,
};

export async function handleMessage(from: string, text: string): Promise<void> {
  const session = await getSession(from);
  const step = session?.step ?? 'menu';

  const handler = HANDLERS[step];
  if (!handler) {
    console.warn(`[flows] step desconocido "${step}", mostrando menú`);
    await sendMenu(from);
    return;
  }

  await handler({ from, text, session });
}
