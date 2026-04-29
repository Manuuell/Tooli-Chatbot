import { setSession } from '../services/session';
import { isWithinBusinessHours } from '../services/chatwootService';
import { track } from '../services/metrics';
import { FlowContext, messaging, sendMenu, sendAreaPrompt } from './shared';

export async function handleMenu(ctx: FlowContext): Promise<void> {
  const { from, text } = ctx;
  const input = text.trim();

  if (input === '1') {
    await setSession(from, { step: 'esperando_codigo', data: {} });
    await messaging.sendText({
      to: from,
      text: 'Por favor escribe tu código estudiantil.\nEjemplo: T000XXXXX',
    });
    return;
  }

  if (input === '2') {
    await setSession(from, { step: 'recibo_codigo', data: {} });
    await messaging.sendText({
      to: from,
      text: 'Para descargar tu recibo necesito tus credenciales del portal.\n\nPor favor escribe tu *código estudiantil*.\nEjemplo: T000XXXXX',
    });
    return;
  }

  if (input === '3') {
    if (!isWithinBusinessHours()) {
      await setSession(from, { step: 'agent_outside_hours', data: {} });
      await track('agent_outside_hours');
      await messaging.sendText({
        to: from,
        text:
          '🕐 En este momento estamos *fuera de horario de atención*.\n' +
          '_Lunes a viernes, 8:00 AM – 8:00 PM_\n\n' +
          '¿Quieres dejar tu mensaje? Un asesor te responderá el próximo día hábil.\n\n' +
          '*1.* Sí, dejar mensaje\n' +
          '*2.* No, volver al menú',
      });
      return;
    }
    await setSession(from, { step: 'agent_area', data: {} });
    await sendAreaPrompt(from);
    return;
  }

  await track('menu_shown');
  await sendMenu(from);
}
