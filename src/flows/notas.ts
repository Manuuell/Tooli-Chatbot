import { setSession } from '../services/session';
import { startNotasLogin, submitNotasMfa, NotasLoginResult } from '../services/notasService';
import { getIdentity } from '../services/identityService';
import { track } from '../services/metrics';
import { FlowContext, messaging, sendMenu, isMenuCommand } from './shared';

// Flujo de NOTAS (opción B: login SSO automatizado con Playwright).
// Se llega aquí SOLO tras verificar identidad por OTP (tenemos el correo @utb).
// Estados: notas_password → (si hay MFA) notas_mfa.

async function entregarNotas(from: string, res: NotasLoginResult): Promise<void> {
  if (res.status === 'ok') {
    await track('notas_consultadas');
    let msg = '📊 *Tus notas del período*\n\n';
    for (const c of res.cursos) msg += `• ${c.titulo}: *${c.notaFinal}*\n`;
    msg += '\n_Escribe *menu* para volver al inicio._';
    await messaging.sendText({ to: from, text: msg });
  } else if (res.status === 'error') {
    await track('notas_no_encontradas');
    await messaging.sendText({ to: from, text: `No pude traer tus notas. ${res.error}\n\nEscribe *menu* para volver.` });
  }
  await setSession(from, { step: 'menu', data: {} });
}

export async function handleNotasPassword(ctx: FlowContext): Promise<void> {
  const { from, text } = ctx;
  if (isMenuCommand(text)) {
    await setSession(from, { step: 'menu', data: {} });
    await sendMenu(from);
    return;
  }

  const identity = await getIdentity(from);
  if (!identity) {
    await setSession(from, { step: 'menu', data: {} });
    await messaging.sendText({
      to: from,
      text: 'Necesitas verificar tu identidad primero. Escribe *menu* y elige *Ver notas*.',
    });
    return;
  }

  await messaging.sendText({ to: from, text: '🔄 Iniciando sesión en Banner por ti… (puede tardar hasta 1 min)' });

  const res = await startNotasLogin(from, identity.email, text);

  if (res.status === 'mfa') {
    await setSession(from, { step: 'notas_mfa', data: {} });
    await messaging.sendText({ to: from, text: `🔐 ${res.prompt}\n\n_Escribe *menu* para cancelar._` });
    return;
  }
  await entregarNotas(from, res);
}

export async function handleNotasMfa(ctx: FlowContext): Promise<void> {
  const { from, text } = ctx;
  if (isMenuCommand(text)) {
    await setSession(from, { step: 'menu', data: {} });
    await sendMenu(from);
    return;
  }

  await messaging.sendText({ to: from, text: '🔄 Verificando el código…' });
  const res = await submitNotasMfa(from, text.trim());
  await entregarNotas(from, res);
}
