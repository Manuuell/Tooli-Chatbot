import { setSession } from '../services/session';
import {
  FlowContext,
  messaging,
  sendMenu,
  isMenuCommand,
  CODIGO_REGEX,
  CEDULA_REGEX,
  EMAIL_REGEX,
} from './shared';
import { iniciarConversacionAsesor } from './agentHandoff';

export async function handleTiCollectEmail(ctx: FlowContext): Promise<void> {
  const { from, text, session } = ctx;
  if (isMenuCommand(text)) {
    await setSession(from, { step: 'menu', data: {} });
    await sendMenu(from);
    return;
  }
  const email = text.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    await messaging.sendText({
      to: from,
      text:
        'El correo no es válido. Debe ser tu correo institucional (@utb.edu.co o @utbvirtual.edu.co).\n\nInténtalo de nuevo o escribe *menu* para cancelar.',
    });
    return;
  }
  await setSession(from, {
    step: 'ti_collect_codigo',
    data: { ...session?.data, verifEmail: email },
  });
  await messaging.sendText({
    to: from,
    text: 'Gracias. Ahora escribe tu *código estudiantil* (formato T seguido de 8 dígitos, ej: T00012345).',
  });
}

export async function handleTiCollectCodigo(ctx: FlowContext): Promise<void> {
  const { from, text, session } = ctx;
  if (isMenuCommand(text)) {
    await setSession(from, { step: 'menu', data: {} });
    await sendMenu(from);
    return;
  }
  const codigo = text.trim().toUpperCase();
  if (!CODIGO_REGEX.test(codigo)) {
    await messaging.sendText({
      to: from,
      text:
        'El código no es válido. Debe tener el formato T seguido de 8 dígitos.\n\nInténtalo de nuevo o escribe *menu* para cancelar.',
    });
    return;
  }
  await setSession(from, {
    step: 'ti_collect_cedula',
    data: { ...session?.data, verifCodigo: codigo },
  });
  await messaging.sendText({
    to: from,
    text: 'Perfecto. Por último, ¿cuál es tu *número de cédula*? (solo dígitos, sin puntos ni guiones)',
  });
}

export async function handleTiCollectCedula(ctx: FlowContext): Promise<void> {
  const { from, text, session } = ctx;
  if (isMenuCommand(text)) {
    await setSession(from, { step: 'menu', data: {} });
    await sendMenu(from);
    return;
  }
  const cedula = text.trim();
  if (!CEDULA_REGEX.test(cedula)) {
    await messaging.sendText({
      to: from,
      text:
        'La cédula no es válida. Debe tener entre 6 y 12 dígitos.\n\nInténtalo de nuevo o escribe *menu* para cancelar.',
    });
    return;
  }
  const data = { ...session?.data, verifCedula: cedula };
  await messaging.sendText({
    to: from,
    text: '✅ Datos recibidos. Conectándote con un asesor de TI…',
  });
  await iniciarConversacionAsesor(from, data, { aiNoResolvio: true, conVerificacionIdentidad: true });
}
