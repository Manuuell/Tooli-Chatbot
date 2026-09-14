import axios from 'axios';
import { config } from '../config';

const GRAPH_URL = 'https://graph.facebook.com/v20.0';

// ── Tipos (forma real que responde Meta) ────────────────────────────────────

export interface ApprovedTemplate {
  name: string;
  language: string;
  category: string;
  components: unknown[];
}

// Cache en memoria: evita golpear la API de Meta en cada render del panel
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
let cache: { data: ApprovedTemplate[]; at: number } | null = null;

// ── Listado de templates aprobados ──────────────────────────────────────────

/**
 * Lista templates con status=APPROVED del WABA configurado.
 * Respuesta real de Meta: { data: [{ name, language, category, components, ... }] }
 * Requiere WHATSAPP_WABA_ID y WHATSAPP_TOKEN válidos.
 */
export async function listApprovedTemplates(): Promise<ApprovedTemplate[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }

  const { wabaId, token } = config.metaCloud;
  if (!wabaId || !token) {
    // Sin credenciales no hay templates — devolver vacío honesto, no inventar
    return [];
  }

  const url = `${GRAPH_URL}/${wabaId}/message_templates`;
  const res = await axios.get(url, {
    params: { status: 'APPROVED' },
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15_000,
  });

  // Meta responde { data: [...] } — si no hay data, devolver vacío
  const raw: unknown[] = res.data?.data ?? [];
  const templates: ApprovedTemplate[] = raw.map((item: unknown) => {
    const t = item as Record<string, unknown>;
    return {
      name: String(t.name ?? ''),
      language: String(t.language ?? ''),
      category: String(t.category ?? ''),
      components: Array.isArray(t.components) ? (t.components as unknown[]) : [],
    };
  });

  cache = { data: templates, at: Date.now() };
  return templates;
}

/** Limpia el cache (útil para tests). */
export function clearTemplateCache(): void {
  cache = null;
}

// ── Envío masivo ────────────────────────────────────────────────────────────

export interface BroadcastResult {
  enviados: string[];
  fallidos: { numero: string; error: string }[];
}

/**
 * Envía un template aprobado a una lista de números.
 *
 * Limitación documentada: solo templates SIN placeholders {{1}} por ahora.
 * Si el template requiere parámetros, la API de Meta responderá error;
 * ese caso se reporta en `fallidos` sin tumbar el resto.
 *
 * Cada número se intenta independientemente (sin fail-fast).
 * Delay de ~300ms entre envíos para no golpear rate limits de golpe.
 */
export async function sendBroadcast(
  templateName: string,
  language: string,
  recipients: string[],
): Promise<BroadcastResult> {
  const { token, phoneNumberId } = config.metaCloud;
  if (!token || !phoneNumberId) {
    throw new Error('Faltan credenciales de Meta (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)');
  }
  if (!templateName || !language) {
    throw new Error('templateName y language son requeridos');
  }
  if (!recipients.length) {
    throw new Error('La lista de destinatarios está vacía');
  }

  const url = `${GRAPH_URL}/${phoneNumberId}/messages`;
  const enviados: string[] = [];
  const fallidos: { numero: string; error: string }[] = [];

  for (let i = 0; i < recipients.length; i++) {
    const to = recipients[i];
    // Delay entre envíos (excepto el primero) para no saturar rate limit
    if (i > 0) {
      await new Promise<void>(resolve => setTimeout(resolve, 300));
    }
    try {
      await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: { name: templateName, language: { code: language } },
        },
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          timeout: 15_000,
        },
      );
      enviados.push(to);
    } catch (err: unknown) {
      const msg = extractError(err);
      fallidos.push({ numero: to, error: msg });
    }
  }

  return { enviados, fallidos };
}

function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as Record<string, unknown> | undefined;
    // Forma real de error de Meta: { error: { message, error_user_msg, code } }
    const metaErr = data?.error as Record<string, unknown> | undefined;
    if (metaErr?.message) return String(metaErr.message);
    if (data?.error) return String(data.error);
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
