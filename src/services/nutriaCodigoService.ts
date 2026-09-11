import Redis from 'ioredis';
import { config } from '../config';

const redis = new Redis(config.redis.url);

/** TTL: 48 horas — cubre el evento y un margen */
const TTL = 60 * 60 * 48;

export interface CodigoNutria {
  phone: string;
  canjeado: boolean;
  creadoEn: string;
  canjeadoEn?: string;
}

/** Genera un código legible evitando caracteres confusos (0/O, 1/I) */
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `NUTR-${suffix}`;
}

/**
 * Crea un código para un participante.
 * Si ya tiene uno, lo reutiliza (idempotente).
 */
export async function crearCodigoNutria(phone: string): Promise<string> {
  const existing = await redis.get(`nutria:phone:${phone}:codigo`);
  if (existing) return existing;

  const code = generateCode();
  const data: CodigoNutria = {
    phone,
    canjeado: false,
    creadoEn: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
  };

  await redis.setex(`nutria:codigo:${code}`, TTL, JSON.stringify(data));
  await redis.setex(`nutria:phone:${phone}:codigo`, TTL, code);

  return code;
}

/** Consulta el estado de un código. */
export async function getCodigoNutria(code: string): Promise<CodigoNutria | null> {
  const raw = await redis.get(`nutria:codigo:${code.toUpperCase()}`);
  if (!raw) return null;
  return JSON.parse(raw) as CodigoNutria;
}

/** Retorna los últimos N canjes realizados. */
export async function getCanjesRecientes(limit = 10): Promise<{ code: string; phone: string; canjeadoEn: string }[]> {
  const raw = await redis.lrange('nutria:canjes:log', 0, limit - 1);
  return raw.map(r => JSON.parse(r));
}

/**
 * Marca un código como canjeado.
 * Retorna error si no existe o ya fue canjeado.
 */
export async function canjearCodigoNutria(
  code: string
): Promise<{ ok: boolean; error?: 'not_found' | 'already_redeemed'; data?: CodigoNutria }> {
  const key = `nutria:codigo:${code.toUpperCase()}`;
  const raw = await redis.get(key);

  if (!raw) return { ok: false, error: 'not_found' };

  const data = JSON.parse(raw) as CodigoNutria;
  if (data.canjeado) return { ok: false, error: 'already_redeemed', data };

  data.canjeado = true;
  data.canjeadoEn = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });

  await redis.setex(key, TTL, JSON.stringify(data));

  // Registrar en el log de canjes (últimos 20)
  const logEntry = JSON.stringify({ code, phone: data.phone, canjeadoEn: data.canjeadoEn });
  await redis.lpush('nutria:canjes:log', logEntry);
  await redis.ltrim('nutria:canjes:log', 0, 19);

  return { ok: true, data };
}
