/**
 * Programador de recordatorios por WhatsApp.
 *
 * QUÉ RESUELVE:
 *   `src/flows/recordatorios.ts` ya sabía *enviar* un recordatorio, pero solo
 *   "ahora mismo": alguien tenía que apretar el botón en el momento exacto. Un
 *   asesor que quiere avisarle a un aspirante el día antes del evento, o
 *   recordarle a un estudiante que su matrícula vence el viernes, no podía.
 *
 *   Este servicio agrega el "cuándo": se programa, se persiste en Redis, y un
 *   worker lo dispara solo.
 *
 * QUÉ SIGUE SIN SER REAL (y no se simula):
 *   El disparo *automático* basado en datos académicos ("se vence tu tarea",
 *   "subieron tus notas") necesita una integración con el sistema de la
 *   universidad que este repo no tiene. Lo que existe acá es la infraestructura
 *   genérica: cuando esa integración exista, solo tiene que llamar a
 *   `scheduleReminder()` — no hay que reescribir nada de esto.
 *
 * DISEÑO EN REDIS:
 *   - `reminders:queue`  (sorted set)  score = timestamp de disparo, member = id
 *   - `reminder:<id>`    (string JSON) el recordatorio completo
 *   - `reminders:index`  (sorted set)  score = createdAt, member = id — para listar
 *   Los recordatorios ya enviados/cancelados salen de la cola pero quedan en el
 *   índice con TTL, para que el asesor vea el historial reciente.
 */

import Redis from 'ioredis';
import { config } from '../config';
import { enviarRecordatorio, normalizarTelefono } from '../flows/recordatorios';

const redis = new Redis(config.redis.url);

const QUEUE_KEY = 'reminders:queue';
const INDEX_KEY = 'reminders:index';
const ITEM_KEY = (id: string) => `reminder:${id}`;
/** Cuánto se conserva un recordatorio ya resuelto (7 días). */
const TTL_RESUELTO_SEG = 7 * 24 * 60 * 60;

export type ReminderEstado = 'programado' | 'enviado' | 'fallido' | 'cancelado';

export interface Reminder {
  id: string;
  telefono: string;
  mensaje: string;
  /** epoch ms en que debe dispararse */
  scheduledAt: number;
  createdAt: number;
  /** username del asesor que lo programó */
  createdBy: string;
  estado: ReminderEstado;
  sentAt?: number;
  error?: string;
}

export interface ScheduleInput {
  telefono: string;
  mensaje: string;
  /** ISO 8601 o epoch ms */
  scheduledAt: string | number;
  createdBy: string;
}

export class ReminderValidationError extends Error {}

function nuevoId(): string {
  return `rem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseFecha(valor: string | number): number {
  const ms = typeof valor === 'number' ? valor : Date.parse(valor);
  if (!Number.isFinite(ms)) {
    throw new ReminderValidationError('scheduledAt no es una fecha válida (usa ISO 8601, ej. 2026-09-20T08:00:00-05:00)');
  }
  return ms;
}

/** Margen mínimo hacia el futuro: evita programar algo que ya venció. */
const MARGEN_MINIMO_MS = 30_000;

export async function scheduleReminder(input: ScheduleInput): Promise<Reminder> {
  const telefono = normalizarTelefono(input.telefono ?? '');
  if (telefono.length < 10 || telefono.length > 15) {
    throw new ReminderValidationError('telefono inválido (debe tener 10–15 dígitos)');
  }

  const mensaje = (input.mensaje ?? '').trim();
  if (mensaje.length < 1 || mensaje.length > 4096) {
    throw new ReminderValidationError('mensaje debe tener entre 1 y 4096 caracteres');
  }

  const scheduledAt = parseFecha(input.scheduledAt);
  if (scheduledAt < Date.now() + MARGEN_MINIMO_MS) {
    throw new ReminderValidationError('scheduledAt debe estar al menos 30 segundos en el futuro');
  }

  const reminder: Reminder = {
    id: nuevoId(),
    telefono,
    mensaje,
    scheduledAt,
    createdAt: Date.now(),
    createdBy: input.createdBy,
    estado: 'programado',
  };

  const pipe = redis.pipeline();
  pipe.set(ITEM_KEY(reminder.id), JSON.stringify(reminder));
  pipe.zadd(QUEUE_KEY, String(scheduledAt), reminder.id);
  pipe.zadd(INDEX_KEY, String(reminder.createdAt), reminder.id);
  await pipe.exec();

  return reminder;
}

export async function getReminder(id: string): Promise<Reminder | null> {
  const raw = await redis.get(ITEM_KEY(id));
  return raw ? (JSON.parse(raw) as Reminder) : null;
}

export async function listReminders(opts: { estado?: ReminderEstado; limit?: number } = {}): Promise<Reminder[]> {
  const limit = Math.max(1, Math.min(200, opts.limit ?? 50));
  // Del índice, los más recientes primero.
  const ids = await redis.zrevrange(INDEX_KEY, 0, limit * 2);
  if (!ids.length) return [];

  const raws = await redis.mget(ids.map(ITEM_KEY));
  const items: Reminder[] = [];
  const huerfanos: string[] = [];

  raws.forEach((raw, i) => {
    if (!raw) {
      // El item expiró pero quedó en el índice — se limpia solo.
      huerfanos.push(ids[i]);
      return;
    }
    items.push(JSON.parse(raw) as Reminder);
  });

  if (huerfanos.length) await redis.zrem(INDEX_KEY, ...huerfanos);

  return items
    .filter((r) => !opts.estado || r.estado === opts.estado)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export async function cancelReminder(id: string): Promise<Reminder | null> {
  const reminder = await getReminder(id);
  if (!reminder) return null;
  if (reminder.estado !== 'programado') return reminder;

  reminder.estado = 'cancelado';
  const pipe = redis.pipeline();
  pipe.set(ITEM_KEY(id), JSON.stringify(reminder), 'EX', TTL_RESUELTO_SEG);
  pipe.zrem(QUEUE_KEY, id);
  await pipe.exec();

  return reminder;
}

async function marcarResuelto(reminder: Reminder): Promise<void> {
  await redis.set(ITEM_KEY(reminder.id), JSON.stringify(reminder), 'EX', TTL_RESUELTO_SEG);
}

/**
 * Procesa los recordatorios vencidos. Exportada aparte del worker para poder
 * dispararla a mano (o desde un test) sin depender del intervalo.
 *
 * Idempotencia: cada id se saca de la cola con ZREM *antes* de enviarlo, y solo
 * el llamador que efectivamente lo removió (zrem devuelve 1) lo envía. Así dos
 * ticks superpuestos —o dos instancias del servidor— no mandan el mismo mensaje
 * dos veces.
 */
export async function processDueReminders(now: number = Date.now()): Promise<{ enviados: number; fallidos: number }> {
  let enviados = 0;
  let fallidos = 0;

  const vencidos = await redis.zrangebyscore(QUEUE_KEY, '-inf', String(now), 'LIMIT', 0, 50);

  for (const id of vencidos) {
    const removidos = await redis.zrem(QUEUE_KEY, id);
    if (removidos !== 1) continue; // otro tick/instancia se lo llevó

    const reminder = await getReminder(id);
    if (!reminder || reminder.estado !== 'programado') continue;

    try {
      await enviarRecordatorio({ telefono: reminder.telefono, mensaje: reminder.mensaje });
      reminder.estado = 'enviado';
      reminder.sentAt = Date.now();
      enviados++;
    } catch (err) {
      // Un fallo no debe frenar a los demás ni reintentar en bucle: se marca
      // fallido con la razón y el asesor decide si lo reprograma.
      reminder.estado = 'fallido';
      reminder.error = err instanceof Error ? err.message : String(err);
      fallidos++;
      console.error(`[recordatorios] falló el envío de ${id}:`, reminder.error);
    }

    await marcarResuelto(reminder);
  }

  return { enviados, fallidos };
}

let workerTimer: NodeJS.Timeout | null = null;

/**
 * Arranca el loop que dispara los recordatorios vencidos.
 * Es seguro llamarlo más de una vez: si ya hay un worker corriendo, no arranca otro.
 */
export function startReminderWorker(intervalMs = 30_000): void {
  if (workerTimer) return;

  const tick = async () => {
    try {
      const { enviados, fallidos } = await processDueReminders();
      if (enviados || fallidos) {
        console.log(`[recordatorios] tick: ${enviados} enviados, ${fallidos} fallidos`);
      }
    } catch (err) {
      // Si Redis está caído, se loguea y se reintenta en el siguiente tick.
      // Nunca se deja escapar la excepción: tumbaría el proceso entero.
      console.error('[recordatorios] error en el tick del worker:', err);
    }
  };

  workerTimer = setInterval(tick, intervalMs);
  // No mantener vivo el proceso solo por este timer.
  workerTimer.unref?.();
  console.log(`[recordatorios] worker iniciado (cada ${Math.round(intervalMs / 1000)}s)`);
}

export function stopReminderWorker(): void {
  if (!workerTimer) return;
  clearInterval(workerTimer);
  workerTimer = null;
}
