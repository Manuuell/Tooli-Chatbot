import { setSession } from '../services/session';
import { track } from '../services/metrics';
import { FlowContext, messaging, sendMenu } from './shared';
import { sendCategoriasMenu } from './programas';

export async function handleMenu(ctx: FlowContext): Promise<void> {
  const { from, text } = ctx;
  const input = text.trim();

  // 1 — Ver programas de posgrado
  if (input === '1') {
    await setSession(from, { step: 'programas_categoria', data: {} });
    await sendCategoriasMenu(from);
    return;
  }

  // 2 — Asistente IA
  if (input === '2') {
    await setSession(from, { step: 'chatting_with_ai', data: { area: 'posgrados' } });
    await messaging.sendText({
      to: from,
      text:
        '🤖 *Asistente IA de Posgrados*\n\n' +
        'Cuéntame qué quieres saber: costos, requisitos, diferencias entre programas, perfil del egresado…\n\n' +
        '_Escribe *asesor* para hablar con una persona, o *menu* para volver._',
    });
    return;
  }

  // 3 — Registrarse en base de datos
  if (input === '3') {
    await setSession(from, { step: 'registro_nombre', data: {} });
    await messaging.sendText({
      to: from,
      text:
        '📬 *Registro de interés en Posgrados UTB*\n\n' +
        'Te agregaremos a nuestra base de datos para enviarte información sobre admisiones, becas y novedades.\n\n' +
        '¿Cuál es tu *nombre completo*?\n\n' +
        '_Escribe *menu* para cancelar._',
    });
    await track('registro_iniciado');
    return;
  }

  // 4 — Turno de matrícula
  if (input === '4') {
    await setSession(from, { step: 'esperando_codigo', data: {} });
    await messaging.sendText({
      to: from,
      text: 'Por favor escribe tu *código estudiantil*.\n_Ejemplo: T000XXXXX_\n\nEscribe *menu* para cancelar.',
    });
    return;
  }

  // 5 — Recibo de matrícula
  if (input === '5') {
    await setSession(from, { step: 'recibo_codigo', data: {} });
    await messaging.sendText({
      to: from,
      text:
        'Para descargar tu recibo necesito tus credenciales del portal.\n\n' +
        'Por favor escribe tu *código estudiantil*.\n_Ejemplo: T000XXXXX_\n\nEscribe *menu* para cancelar.',
    });
    return;
  }

  // 6 — Hablar con asesor
  if (input === '6') {
    await setSession(from, { step: 'prospecto_nombre', data: {} });
    await messaging.sendText({
      to: from,
      text:
        '🧑‍💼 *Conectar con asesor de Posgrados*\n\n' +
        'Para que el asesor pueda ayudarte mejor, necesito algunos datos rápidos.\n\n' +
        '¿Cuál es tu *nombre completo*?\n\n' +
        '_Escribe *menu* para cancelar._',
    });
    await track('prospecto_iniciado');
    return;
  }

  // Cualquier otro input — mostrar menú
  await track('menu_shown');
  await sendMenu(from);
}
