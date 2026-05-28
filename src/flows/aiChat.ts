import { setSession } from '../services/session';
import { preguntarAI, AIUnavailableError, ChatTurn } from '../services/aiAssistant';
import { track } from '../services/metrics';
import { FlowContext, messaging, sendAiHint, normalize } from './shared';
import { iniciarConversacionAsesor, iniciarVerificacionIdentidad } from './agentHandoff';

const TURN_LIMIT_SUGGEST_AGENT = 15;

export async function handleChattingWithAI(ctx: FlowContext): Promise<void> {
  const { from, text, session } = ctx;
  const input = normalize(text);

  if (
    input === 'salir' ||
    input === 'menu' ||
    input === 'gracias' ||
    input === 'listo' ||
    input === 'terminar'
  ) {
    await setSession(from, { step: 'menu', data: {} });
    await messaging.sendText({
      to: from,
      text: '¡Genial! 🙌 Vuelve cuando necesites algo más.\n\nEscribe *menu* para ver las opciones.',
    });
    return;
  }

  if (input === 'asesor' || input === 'humano' || input === 'agente') {
    await track('ai_escalated_to_agent', { reason: 'user_requested' });
    await iniciarConversacionAsesor(from, session?.data ?? {}, { aiNoResolvio: true });
    return;
  }

  const history: ChatTurn[] = JSON.parse(session?.data.aiHistory ?? '[]');
  const turnCount = parseInt(session?.data.aiTurnCount ?? '0');
  const areaRaw = session?.data.area ?? 'posgrados';
  const area = (['ti', 'admisiones', 'posgrados'].includes(areaRaw) ? areaRaw : 'posgrados') as 'ti' | 'admisiones' | 'posgrados';
  const tituloAsistente = area === 'ti' ? '🤖 *Asistente TI*' : '🤖 *Asistente Posgrados UTB*';

  await track('ai_request', { area: area as 'ti' | 'admisiones' | 'posgrados' });

  try {
    const ai = await preguntarAI(area, text.trim(), history);

    await messaging.sendText({ to: from, text: `${tituloAsistente}\n\n${ai.answer}` });

    if (ai.usedTool) await track('ai_used_tool', { area });
    await track('ai_resolved', { area });

    if (ai.triggerIdentityVerification && area === 'ti') {
      const newHistory: ChatTurn[] = [
        ...history,
        { role: 'user', content: text.trim() },
        { role: 'assistant', content: ai.answer },
      ];
      await iniciarVerificacionIdentidad(from, {
        ...session?.data,
        aiHistory: JSON.stringify(newHistory),
      });
      return;
    }

    const newHistory: ChatTurn[] = [
      ...history,
      { role: 'user', content: text.trim() },
      { role: 'assistant', content: ai.answer },
    ];
    const newTurnCount = turnCount + 1;

    await setSession(from, {
      step: 'chatting_with_ai',
      data: {
        ...session?.data,
        aiHistory: JSON.stringify(newHistory),
        aiTurnCount: String(newTurnCount),
      },
    });

    if (newTurnCount >= TURN_LIMIT_SUGGEST_AGENT) {
      await messaging.sendText({
        to: from,
        text:
          '🤔 Hemos hablado bastante. Si sientes que aún no resuelves tu duda, ' +
          'te recomiendo *hablar con un asesor humano* — escribe *asesor*.',
      });
      return;
    }

    if (newTurnCount % 3 === 1 && newTurnCount > 1) {
      await sendAiHint(from);
    }
  } catch (err) {
    console.error('[chatting_with_ai] error:', err);
    await track('ai_failed', { area, reason: err instanceof AIUnavailableError ? err.reason : 'unknown' });

    if (err instanceof AIUnavailableError) {
      await messaging.sendText({
        to: from,
        text:
          '⚠️ El asistente automático no está disponible en este momento.\n\n' +
          '¿Quieres que te conecte con un *asesor humano*? Escribe *asesor* para hacerlo, o *salir* para terminar.',
      });
      return;
    }

    await messaging.sendText({
      to: from,
      text:
        'Tuve un problema procesando tu pregunta. ¿Quieres *intentar de nuevo* o escribir *asesor* para hablar con un humano?',
    });
  }
}
