import { setSession } from '../services/session';
import { track } from '../services/metrics';
import { FlowContext, messaging, sendMenu, sendAreaPrompt } from './shared';
import { isVerified } from '../services/identityService';
import { startVerificationFlow } from './verificacion';
import { sendCategoriasMenu } from './programas';

// Menú de SERVICIOS AL ESTUDIANTE + captación de posgrados (opción 6).
// "Registrarme" sigue en el código (handlers registrados) pero no se muestra aquí.
export async function handleMenu(ctx: FlowContext): Promise<void> {
  const { from, text } = ctx;
  const input = text.trim();

  // 1 — Ver notas (requiere verificación de identidad por OTP al correo)
  if (input === '1') {
    if (await isVerified(from)) {
      await setSession(from, { step: 'notas_password', data: {} });
      await messaging.sendText({
        to: from,
        text:
          'Para ver tus notas, inicio sesión por ti en Banner.\n\n' +
          'Escribe tu *contraseña institucional* (la de tu correo @utb / Microsoft).\n\n' +
          '⚠️ Se usa solo para esta consulta y *no se guarda*.\n\nEscribe *menu* para cancelar.',
      });
    } else {
      // Aún no verificado → primero OTP al correo, luego retoma las notas.
      await startVerificationFlow(from, 'notas');
      await track('verificacion_iniciada');
    }
    return;
  }

  // 2 — Turno de matrícula
  if (input === '2') {
    await setSession(from, { step: 'esperando_codigo', data: {} });
    await messaging.sendText({
      to: from,
      text: 'Por favor escribe tu *código estudiantil*.\n_Ejemplo: T000XXXXX_\n\nEscribe *menu* para cancelar.',
    });
    return;
  }

  // 3 — Recibo de matrícula
  if (input === '3') {
    await setSession(from, { step: 'recibo_codigo', data: {} });
    await messaging.sendText({
      to: from,
      text:
        'Para descargar tu recibo necesito tus credenciales del portal.\n\n' +
        'Por favor escribe tu *código estudiantil*.\n_Ejemplo: T000XXXXX_\n\nEscribe *menu* para cancelar.',
    });
    return;
  }

  // 4 — Asistente IA
  if (input === '4') {
    await setSession(from, { step: 'chatting_with_ai', data: { area: 'posgrados' } });
    await messaging.sendText({
      to: from,
      text:
        '🤖 *Asistente IA*\n\n' +
        'Pregúntame lo que necesites sobre la UTB: trámites, fechas, requisitos, programas…\n\n' +
        '_Escribe *asesor* para hablar con una persona, o *menu* para volver._',
    });
    return;
  }

  // 5 — Hablar con asesor (handoff por área: TI / Admisiones)
  if (input === '5') {
    await setSession(from, { step: 'agent_area', data: {} });
    await sendAreaPrompt(from);
    return;
  }

  // 6 — Ver programas de posgrado (catálogo con costos → asesor de Admisiones)
  if (input === '6') {
    await setSession(from, { step: 'programas_categoria', data: {} });
    await sendCategoriasMenu(from);
    return;
  }

  // Cualquier otro input — mostrar menú
  await track('menu_shown');
  await sendMenu(from);
}
