import { setSession } from '../services/session';
import { preguntarAI, AIUnavailableError, ChatTurn } from '../services/aiAssistant';
import { track } from '../services/metrics';
import {
  FlowContext,
  messaging,
  sendMenu,
  sendAreaPrompt,
  sendAiHint,
  isMenuCommand,
  PLATAFORMAS_TI,
  NIVELES_ADMISIONES,
  ETAPAS_ADMISIONES,
} from './shared';
import { iniciarConversacionAsesor, iniciarVerificacionIdentidad } from './agentHandoff';

export async function handleAgentOutsideHours(ctx: FlowContext): Promise<void> {
  const { from, text } = ctx;
  const input = text.trim();
  if (input === '1') {
    await setSession(from, { step: 'agent_area', data: { outsideHours: 'true' } });
    await sendAreaPrompt(from);
    return;
  }
  if (input === '2' || isMenuCommand(input)) {
    await setSession(from, { step: 'menu', data: {} });
    await sendMenu(from);
    return;
  }
  await messaging.sendText({
    to: from,
    text: 'Responde *1* para dejar mensaje o *2* para volver al menú.',
  });
}

export async function handleAgentArea(ctx: FlowContext): Promise<void> {
  const { from, text, session } = ctx;
  const input = text.trim();
  if (isMenuCommand(input)) {
    await setSession(from, { step: 'menu', data: {} });
    await sendMenu(from);
    return;
  }
  if (input === '1') {
    await setSession(from, { step: 'agent_ti_p1', data: { ...session?.data, area: 'ti' } });
    await messaging.sendText({
      to: from,
      text:
        '🖥️ *Soporte TI*\n\n¿Con qué plataforma tienes el problema?\n\n' +
        '*1.* Banner / Autoservicio\n' +
        '*2.* Iceberg / Portal Financiero\n' +
        '*3.* Correo institucional\n' +
        '*4.* Aulas virtuales (Moodle)\n' +
        '*5.* Wifi / Red\n' +
        '*6.* Otro',
    });
    return;
  }
  if (input === '2') {
    await setSession(from, { step: 'agent_admisiones_p1', data: { ...session?.data, area: 'admisiones' } });
    await messaging.sendText({
      to: from,
      text:
        '📝 *Soporte Admisiones*\n\n¿Sobre qué nivel necesitas ayuda?\n\n' +
        '*1.* Pregrado\n' +
        '*2.* Posgrado (maestría / especialización)\n' +
        '*3.* Educación continua / cursos\n' +
        '*4.* No estoy seguro',
    });
    return;
  }
  await messaging.sendText({ to: from, text: 'Responde *1* para TI o *2* para Admisiones.' });
}

export async function handleAgentTiP1(ctx: FlowContext): Promise<void> {
  const { from, text, session } = ctx;
  const input = text.trim();
  if (isMenuCommand(input)) {
    await setSession(from, { step: 'menu', data: {} });
    await sendMenu(from);
    return;
  }
  const plataforma = PLATAFORMAS_TI[input];
  if (!plataforma) {
    await messaging.sendText({ to: from, text: 'Responde con un número del *1* al *6*.' });
    return;
  }
  await setSession(from, {
    step: 'agent_ti_p2',
    data: { ...session?.data, plataforma },
  });
  await messaging.sendText({
    to: from,
    text: 'Describe brevemente el problema (1-2 líneas).\n_Ej: "olvidé mi contraseña", "me sale error al ingresar"._',
  });
}

export async function handleAgentTiP2(ctx: FlowContext): Promise<void> {
  const { from, text, session } = ctx;
  if (isMenuCommand(text)) {
    await setSession(from, { step: 'menu', data: {} });
    await sendMenu(from);
    return;
  }

  const descripcion = text.trim();
  const data: Record<string, string> = { ...session?.data, descripcion };

  await messaging.sendText({ to: from, text: '🤖 Déjame revisar tu caso… ⏳' });
  await track('ai_request', { area: 'ti', plataforma: data.plataforma });

  try {
    const ai = await preguntarAI('ti', descripcion);

    await messaging.sendText({ to: from, text: `🤖 *Asistente TI*\n\n${ai.answer}` });

    if (ai.usedTool) await track('ai_used_tool', { area: 'ti' });
    await track('ai_resolved', { area: 'ti' });

    if (ai.triggerIdentityVerification) {
      await iniciarVerificacionIdentidad(from, data);
      return;
    }

    const history: ChatTurn[] = [
      { role: 'user', content: descripcion },
      { role: 'assistant', content: ai.answer },
    ];

    await setSession(from, {
      step: 'chatting_with_ai',
      data: {
        ...data,
        aiHistory: JSON.stringify(history),
        aiTurnCount: '1',
      },
    });

    await sendAiHint(from);
  } catch (err) {
    console.error('[ai-ti] error:', err);
    await track('ai_failed', { area: 'ti', reason: err instanceof AIUnavailableError ? err.reason : 'unknown' });
    await notifyAIDownAndEscalate(from, data);
  }
}

export async function handleAgentAdmisionesP1(ctx: FlowContext): Promise<void> {
  const { from, text, session } = ctx;
  const input = text.trim();
  if (isMenuCommand(input)) {
    await setSession(from, { step: 'menu', data: {} });
    await sendMenu(from);
    return;
  }
  const nivel = NIVELES_ADMISIONES[input];
  if (!nivel) {
    await messaging.sendText({ to: from, text: 'Responde con un número del *1* al *4*.' });
    return;
  }
  await setSession(from, {
    step: 'agent_admisiones_p2',
    data: { ...session?.data, nivel },
  });
  await messaging.sendText({
    to: from,
    text:
      '¿En qué etapa del proceso estás?\n\n' +
      '*1.* Necesito información general\n' +
      '*2.* Estoy aplicando / inscribiéndome\n' +
      '*3.* Ya fui admitido y tengo dudas\n' +
      '*4.* Soy estudiante actual con duda académica',
  });
}

export async function handleAgentAdmisionesP2(ctx: FlowContext): Promise<void> {
  const { from, text, session } = ctx;
  const input = text.trim();
  if (isMenuCommand(input)) {
    await setSession(from, { step: 'menu', data: {} });
    await sendMenu(from);
    return;
  }
  const etapa = ETAPAS_ADMISIONES[input];
  if (!etapa) {
    await messaging.sendText({ to: from, text: 'Responde con un número del *1* al *4*.' });
    return;
  }
  await setSession(from, {
    step: 'agent_admisiones_p3',
    data: { ...session?.data, etapa },
  });
  await messaging.sendText({
    to: from,
    text: 'Cuéntame brevemente tu pregunta o situación.',
  });
}

export async function handleAgentAdmisionesP3(ctx: FlowContext): Promise<void> {
  const { from, text, session } = ctx;
  if (isMenuCommand(text)) {
    await setSession(from, { step: 'menu', data: {} });
    await sendMenu(from);
    return;
  }

  const descripcion = text.trim();
  const data: Record<string, string> = { ...session?.data, descripcion };

  await messaging.sendText({ to: from, text: '🤖 Déjame intentar ayudarte con eso… ⏳' });
  await track('ai_request', { area: 'admisiones' });

  try {
    const ai = await preguntarAI('admisiones', descripcion);

    await messaging.sendText({ to: from, text: `🤖 *Asistente UTB*\n\n${ai.answer}` });

    if (ai.usedTool) await track('ai_used_tool', { area: 'admisiones' });
    await track('ai_resolved', { area: 'admisiones' });

    const history: ChatTurn[] = [
      { role: 'user', content: descripcion },
      { role: 'assistant', content: ai.answer },
    ];

    await setSession(from, {
      step: 'chatting_with_ai',
      data: {
        ...data,
        aiHistory: JSON.stringify(history),
        aiTurnCount: '1',
      },
    });

    await sendAiHint(from);
  } catch (err) {
    console.error('[ai-admisiones] error:', err);
    await track('ai_failed', { area: 'admisiones', reason: err instanceof AIUnavailableError ? err.reason : 'unknown' });
    await notifyAIDownAndEscalate(from, data);
  }
}

/**
 * El AI no respondió: avisa al usuario explícitamente y escala a un asesor humano
 * con todo el contexto recogido hasta ahora.
 */
async function notifyAIDownAndEscalate(from: string, data: Record<string, string>): Promise<void> {
  await messaging.sendText({
    to: from,
    text:
      '⚠️ El asistente automático no está disponible en este momento.\n\n' +
      'Te conecto con un asesor humano para que te ayude.',
  });
  await iniciarConversacionAsesor(from, data);
}
