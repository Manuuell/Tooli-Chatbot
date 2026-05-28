import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';
import type { MetricEvent, MetricProps } from './metrics';

export const registry = new Registry();
registry.setDefaultLabels({ app: 'tooli-chatbot' });

collectDefaultMetrics({ register: registry });

const eventsTotal = new Counter({
  name: 'tooli_events_total',
  help: 'Conteo de eventos del bot por tipo y dimensiones opcionales',
  labelNames: ['event', 'area', 'plataforma', 'reason'] as const,
  registers: [registry],
});

const aiLatency = new Histogram({
  name: 'tooli_ai_latency_seconds',
  help: 'Latencia de llamadas al asistente IA',
  labelNames: ['area', 'outcome'] as const,
  buckets: [0.5, 1, 2, 3, 5, 8, 13, 21, 34],
  registers: [registry],
});

const recibosLatency = new Histogram({
  name: 'tooli_recibo_descarga_seconds',
  help: 'Latencia del flujo de descarga de recibos desde Iceberg',
  labelNames: ['outcome'] as const,
  buckets: [5, 10, 20, 30, 45, 60, 90, 120],
  registers: [registry],
});

export function recordEvent(event: MetricEvent, props: MetricProps = {}): void {
  eventsTotal.inc({
    event,
    area: props.area ? String(props.area) : '',
    plataforma: props.plataforma ? String(props.plataforma) : '',
    reason: props.reason ? String(props.reason) : '',
  });
}

export function observeAILatency(area: 'ti' | 'admisiones' | 'posgrados', outcome: 'success' | 'error', seconds: number): void {
  aiLatency.observe({ area, outcome }, seconds);
}

export function observeReciboLatency(outcome: 'success' | 'error' | 'no_recibos', seconds: number): void {
  recibosLatency.observe({ outcome }, seconds);
}

export async function getMetricsText(): Promise<string> {
  return registry.metrics();
}

export function getMetricsContentType(): string {
  return registry.contentType;
}
