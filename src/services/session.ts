import Redis from 'ioredis';
import { config } from '../config';

const redis = new Redis(config.redis.url);

export interface Session {
  step: string;
  data: Record<string, string>;
}

export async function getSession(phoneNumber: string): Promise<Session | null> {
  const raw = await redis.get(`session:${phoneNumber}`);
  if (!raw) return null;
  return JSON.parse(raw) as Session;
}

export async function setSession(phoneNumber: string, session: Session): Promise<void> {
  await redis.setex(
    `session:${phoneNumber}`,
    config.redis.sessionTtl,
    JSON.stringify(session)
  );
}

export async function deleteSession(phoneNumber: string): Promise<void> {
  await redis.del(`session:${phoneNumber}`);
}
