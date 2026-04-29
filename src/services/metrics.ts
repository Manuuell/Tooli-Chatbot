import Redis from 'ioredis';
import { config } from '../config';
import { recordEvent } from './promMetrics';

const redis = new Redis(config.redis.url);

const COUNTER_TTL = 60 * 60 * 24 * 90;

export type MetricEvent =
  | 'menu_shown'
  | 'turno_consultado'
  | 'turno_no_encontrado'
  | 'recibo_descargado'
  | 'recibo_login_failed'
  | 'recibo_no_pendientes'
  | 'recibo_error'
  | 'ai_request'
  | 'ai_resolved'
  | 'ai_failed'
  | 'ai_escalated_to_agent'
  | 'ai_used_tool'
  | 'ai_identity_verification_started'
  | 'agent_handoff'
  | 'agent_outside_hours'
  | 'rate_limited'
  | 'duplicate_message';

export interface MetricProps {
  area?: 'ti' | 'admisiones';
  plataforma?: string;
  nivel?: string;
  reason?: string;
  [k: string]: string | number | boolean | undefined;
}

function dayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function track(event: MetricEvent, props: MetricProps = {}): Promise<void> {
  const day = dayKey();
  const propsStr = Object.entries(props)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');

  console.log(`[metric] ${event}${propsStr ? ' ' + propsStr : ''}`);

  recordEvent(event, props);

  try {
    const pipe = redis.pipeline();
    pipe.hincrby(`metrics:${day}`, event, 1);
    pipe.expire(`metrics:${day}`, COUNTER_TTL);

    if (props.area) {
      pipe.hincrby(`metrics:${day}`, `${event}:area:${props.area}`, 1);
    }
    if (props.plataforma) {
      pipe.hincrby(`metrics:${day}`, `${event}:plataforma:${props.plataforma}`, 1);
    }
    await pipe.exec();
  } catch (err) {
    console.error('[metrics] redis error:', err);
  }
}

export async function getMetrics(day: string = dayKey()): Promise<Record<string, string>> {
  return await redis.hgetall(`metrics:${day}`);
}
