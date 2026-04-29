import Redis from 'ioredis';
import { config } from '../config';

const redis = new Redis(config.redis.url);

export interface BotUserInfo {
  phone: string;
  session: { step: string; data: Record<string, string> } | null;
  banned: boolean;
  banReason?: string;
  recentMessages: Array<{ ts: number; direction: 'in' | 'out'; text: string }>;
}

const BAN_KEY = (phone: string) => `ban:${phone}`;
const ACTIVITY_KEY = (phone: string) => `activity:${phone}`;

export async function getBotUser(phone: string): Promise<BotUserInfo> {
  const [sessionRaw, banRaw, activityRaw] = await Promise.all([
    redis.get(`session:${phone}`),
    redis.get(BAN_KEY(phone)),
    redis.lrange(ACTIVITY_KEY(phone), 0, 49),
  ]);

  return {
    phone,
    session: sessionRaw ? JSON.parse(sessionRaw) : null,
    banned: !!banRaw,
    banReason: banRaw ?? undefined,
    recentMessages: activityRaw
      .map(s => {
        try { return JSON.parse(s); } catch { return null; }
      })
      .filter(Boolean),
  };
}

export async function resetSession(phone: string): Promise<void> {
  await redis.del(`session:${phone}`);
}

export async function banUser(phone: string, reason: string): Promise<void> {
  await redis.set(BAN_KEY(phone), reason);
}

export async function unbanUser(phone: string): Promise<void> {
  await redis.del(BAN_KEY(phone));
}

export async function isBanned(phone: string): Promise<boolean> {
  return (await redis.exists(BAN_KEY(phone))) === 1;
}

/**
 * Guarda actividad reciente del usuario (in/out) para que los asesores la consulten.
 * Mantiene los últimos 50 mensajes en una lista circular con TTL de 30 días.
 */
export async function recordActivity(phone: string, direction: 'in' | 'out', text: string): Promise<void> {
  const key = ACTIVITY_KEY(phone);
  const truncated = text.length > 200 ? text.slice(0, 200) + '…' : text;
  await redis.lpush(key, JSON.stringify({ ts: Date.now(), direction, text: truncated }));
  await redis.ltrim(key, 0, 49);
  await redis.expire(key, 60 * 60 * 24 * 30);
}

/**
 * Lista todos los usuarios que tuvieron actividad reciente (clave activity:*).
 * Limitado por SCAN para no bloquear Redis.
 */
export async function listActiveUsers(limit = 100): Promise<string[]> {
  const phones = new Set<string>();
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'activity:*', 'COUNT', 200);
    cursor = next;
    for (const k of keys) phones.add(k.replace('activity:', ''));
    if (phones.size >= limit) break;
  } while (cursor !== '0');
  return Array.from(phones).slice(0, limit);
}
