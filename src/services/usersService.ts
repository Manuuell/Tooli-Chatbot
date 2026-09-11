import bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { config } from '../config';
import { createChatwootUser, deleteChatwootUser, isChatwootSsoEnabled } from './chatwootSsoService';

const redis = new Redis(config.redis.url);

export type UserRole = 'admin' | 'asesor';

export interface User {
  username: string;
  passwordHash: string;
  fullName: string;
  email?: string;
  role: UserRole;
  area?: 'ti' | 'admisiones' | 'all';
  createdAt: number;
  chatwootUserId?: number;
}

export interface PublicUser {
  username: string;
  fullName: string;
  email?: string;
  role: UserRole;
  area?: 'ti' | 'admisiones' | 'all';
  createdAt: number;
  chatwootUserId?: number;
}

const KEY = (username: string) => `user:${username.toLowerCase()}`;
const INDEX_KEY = 'users:index';

export function toPublic(u: User): PublicUser {
  const { passwordHash: _, ...rest } = u;
  return rest;
}

export async function getUser(username: string): Promise<User | null> {
  const raw = await redis.get(KEY(username));
  return raw ? (JSON.parse(raw) as User) : null;
}

export async function listUsers(): Promise<PublicUser[]> {
  const usernames = await redis.smembers(INDEX_KEY);
  const users: PublicUser[] = [];
  for (const u of usernames) {
    const user = await getUser(u);
    if (user) users.push(toPublic(user));
  }
  return users.sort((a, b) => a.createdAt - b.createdAt);
}

export async function createUser(input: {
  username: string;
  password: string;
  fullName: string;
  email?: string;
  role?: UserRole;
  area?: 'ti' | 'admisiones' | 'all';
}): Promise<PublicUser> {
  const username = input.username.toLowerCase().trim();
  if (!username || !input.password) throw new Error('Usuario y contraseña son obligatorios');

  const existing = await getUser(username);
  if (existing) throw new Error('El usuario ya existe');

  const user: User = {
    username,
    passwordHash: await bcrypt.hash(input.password, 10),
    fullName: input.fullName,
    email: input.email,
    role: input.role ?? 'asesor',
    area: input.area ?? 'all',
    createdAt: Date.now(),
  };

  // Si Chatwoot SSO está configurado y el usuario tiene email, crear cuenta en Chatwoot también
  if (input.email && isChatwootSsoEnabled()) {
    try {
      const teamIds: number[] = [];
      if (user.area === 'ti' || user.area === 'all') {
        const id = parseInt(config.chatwoot.teamTiId);
        if (id) teamIds.push(id);
      }
      if (user.area === 'admisiones' || user.area === 'all') {
        const id = parseInt(config.chatwoot.teamAdmisionesId);
        if (id) teamIds.push(id);
      }
      const cw = await createChatwootUser({
        email: input.email,
        name: input.fullName,
        password: input.password,
        role: user.role === 'admin' ? 'administrator' : 'agent',
        teamIds,
      });
      user.chatwootUserId = cw.userId;
      console.log(`[users] usuario ${username} creado en Chatwoot con id ${cw.userId}`);
    } catch (err: any) {
      const detail = err?.response?.data ?? err?.message;
      console.warn(`[users] no se pudo crear ${username} en Chatwoot:`, JSON.stringify(detail));
    }
  }

  await redis.set(KEY(username), JSON.stringify(user));
  await redis.sadd(INDEX_KEY, username);
  return toPublic(user);
}

export async function setChatwootUserId(username: string, chatwootUserId: number): Promise<void> {
  const user = await getUser(username);
  if (!user) throw new Error('Usuario no encontrado');
  user.chatwootUserId = chatwootUserId;
  await redis.set(KEY(username), JSON.stringify(user));
}

export async function deleteUser(username: string): Promise<void> {
  const user = await getUser(username);
  if (user?.chatwootUserId) await deleteChatwootUser(user.chatwootUserId);
  await redis.del(KEY(username));
  await redis.srem(INDEX_KEY, username.toLowerCase());
}

export async function verifyPassword(username: string, password: string): Promise<User | null> {
  const user = await getUser(username);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

export async function updatePassword(username: string, newPassword: string): Promise<void> {
  const user = await getUser(username);
  if (!user) throw new Error('Usuario no encontrado');
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await redis.set(KEY(username), JSON.stringify(user));
}

/**
 * Crea el usuario admin por defecto si no existe ningún usuario.
 * Se llama al arranque del servidor.
 */
export async function seedDefaultAdmin(): Promise<void> {
  const count = await redis.scard(INDEX_KEY);
  if (count > 0) {
    console.log('[users] ya hay usuarios en el sistema, no se siembra admin por defecto');
    return;
  }
  await createUser({
    username: config.auth.adminUser,
    password: config.auth.adminPassword,
    fullName: 'Administrador',
    role: 'admin',
    area: 'all',
  });
  console.log(`[users] usuario admin creado: ${config.auth.adminUser} / ${config.auth.adminPassword}`);
  console.log('[users] ⚠️  cambia la contraseña por defecto en producción');
}
