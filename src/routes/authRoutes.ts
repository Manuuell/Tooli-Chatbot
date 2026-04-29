import { Router, Response } from 'express';
import {
  verifyPassword,
  createUser,
  listUsers,
  deleteUser,
  updatePassword,
  toPublic,
  getUser,
} from '../services/usersService';
import {
  signSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireAdmin,
  AuthedRequest,
} from '../middleware/auth';
import { config } from '../config';
import { getChatwootSsoUrl, isChatwootSsoEnabled } from '../services/chatwootSsoService';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    res.status(400).json({ error: 'missing_credentials' });
    return;
  }
  const user = await verifyPassword(username, password);
  if (!user) {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }
  const token = signSession({ username: user.username, role: user.role, fullName: user.fullName });
  setSessionCookie(res, token);
  res.json({ user: toPublic(user) });
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req: AuthedRequest, res: Response) => {
  const user = await getUser(req.user!.username);
  if (!user) {
    res.status(401).json({ error: 'user_not_found' });
    return;
  }
  res.json({
    user: toPublic(user),
    urls: {
      chatwoot: config.publicUrls.chatwoot,
      grafana: config.publicUrls.grafana,
    },
    capabilities: {
      chatwootSso: isChatwootSsoEnabled() && !!user.chatwootUserId,
    },
  });
});

/**
 * Devuelve una URL SSO de Chatwoot que loguea automáticamente al asesor.
 * Si SSO no está configurado o el usuario no tiene cuenta en Chatwoot,
 * devuelve la URL pública (login manual).
 */
authRouter.get('/chatwoot-sso', requireAuth, async (req: AuthedRequest, res: Response) => {
  const user = await getUser(req.user!.username);
  if (!user) {
    res.status(401).json({ error: 'user_not_found' });
    return;
  }
  if (!isChatwootSsoEnabled() || !user.chatwootUserId) {
    res.json({ url: config.publicUrls.chatwoot, sso: false });
    return;
  }
  try {
    const url = await getChatwootSsoUrl(user.chatwootUserId);
    res.json({ url, sso: true });
  } catch (err: any) {
    console.error('[chatwoot-sso] error generando URL:', err?.message);
    res.json({ url: config.publicUrls.chatwoot, sso: false, error: err?.message });
  }
});

authRouter.post('/change-password', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }
  const ok = await verifyPassword(req.user!.username, currentPassword);
  if (!ok) {
    res.status(401).json({ error: 'wrong_current_password' });
    return;
  }
  await updatePassword(req.user!.username, newPassword);
  res.json({ ok: true });
});

authRouter.get('/users', requireAuth, requireAdmin, async (_req, res) => {
  res.json({ users: await listUsers() });
});

authRouter.post('/users', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
  try {
    const { username, password, fullName, email, role, area } = req.body ?? {};
    if (!username || !password || !fullName) {
      res.status(400).json({ error: 'missing_fields' });
      return;
    }
    const user = await createUser({ username, password, fullName, email, role, area });
    res.json({ user });
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'create_failed' });
  }
});

authRouter.delete('/users/:username', requireAuth, requireAdmin, async (req: AuthedRequest, res: Response) => {
  if (req.params.username.toLowerCase() === req.user!.username) {
    res.status(400).json({ error: 'cannot_delete_self' });
    return;
  }
  await deleteUser(req.params.username);
  res.json({ ok: true });
});
