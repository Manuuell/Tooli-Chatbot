import { Router } from 'express';
import axios from 'axios';
import Redis from 'ioredis';
import { config } from '../config';

export const healthRouter = Router();

const redis = new Redis(config.redis.url, { lazyConnect: true, maxRetriesPerRequest: 1 });

interface CheckResult {
  status: 'ok' | 'degraded' | 'down' | 'skipped';
  latencyMs?: number;
  detail?: string;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; latencyMs: number }> {
  const start = Date.now();
  const value = await fn();
  return { value, latencyMs: Date.now() - start };
}

async function checkRedis(): Promise<CheckResult> {
  try {
    const { latencyMs } = await timed(async () => {
      if (redis.status !== 'ready') await redis.connect().catch(() => {});
      return await redis.ping();
    });
    return { status: 'ok', latencyMs };
  } catch (err: any) {
    return { status: 'down', detail: err?.message };
  }
}

async function checkEvolution(): Promise<CheckResult> {
  try {
    const { latencyMs } = await timed(() =>
      axios.get(`${config.evolutionApi.baseUrl}/instance/connectionState/${config.evolutionApi.instance}`, {
        headers: { apikey: config.evolutionApi.apiKey },
        timeout: 5_000,
      })
    );
    return { status: 'ok', latencyMs };
  } catch (err: any) {
    const msg = err?.response?.status ? `HTTP ${err.response.status}` : err?.code ?? err?.message;
    return { status: 'down', detail: msg };
  }
}

async function checkOpenAI(): Promise<CheckResult> {
  if (!config.openai.apiKey) return { status: 'skipped', detail: 'OPENAI_API_KEY no configurada' };
  try {
    const { latencyMs } = await timed(() =>
      axios.get('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${config.openai.apiKey}` },
        timeout: 5_000,
      })
    );
    return { status: 'ok', latencyMs };
  } catch (err: any) {
    return { status: 'down', detail: err?.response?.status ?? err?.message };
  }
}

async function checkChatwoot(): Promise<CheckResult> {
  if (!config.chatwoot.url || !config.chatwoot.apiToken) return { status: 'skipped' };
  try {
    const { latencyMs } = await timed(() =>
      axios.get(`${config.chatwoot.url}/api/v1/accounts/${config.chatwoot.accountId}/inboxes`, {
        headers: { api_access_token: config.chatwoot.apiToken },
        timeout: 5_000,
      })
    );
    return { status: 'ok', latencyMs };
  } catch (err: any) {
    return { status: 'down', detail: err?.response?.status ?? err?.message };
  }
}

async function checkGoogleSheets(): Promise<CheckResult> {
  if (!config.google.serviceAccount?.client_email) return { status: 'skipped' };
  try {
    const { google } = await import('googleapis');
    const auth = new google.auth.JWT({
      email: config.google.serviceAccount.client_email,
      key: config.google.serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const { latencyMs } = await timed(() => auth.authorize());
    return { status: 'ok', latencyMs };
  } catch (err: any) {
    return { status: 'down', detail: err?.message };
  }
}

healthRouter.get('/', async (_req, res) => {
  res.json({ status: 'ok', message: 'use /health/deep para chequeo completo' });
});

healthRouter.get('/deep', async (_req, res) => {
  const [redisR, evolutionR, openaiR, chatwootR, sheetsR] = await Promise.all([
    checkRedis(),
    checkEvolution(),
    checkOpenAI(),
    checkChatwoot(),
    checkGoogleSheets(),
  ]);

  const checks = {
    redis: redisR,
    evolution_api: evolutionR,
    openai: openaiR,
    chatwoot: chatwootR,
    google_sheets: sheetsR,
  };

  const downCount = Object.values(checks).filter(c => c.status === 'down').length;
  const overall = downCount === 0 ? 'ok' : downCount >= 2 ? 'down' : 'degraded';
  const httpStatus = overall === 'down' ? 503 : 200;

  res.status(httpStatus).json({
    status: overall,
    timestamp: new Date().toISOString(),
    checks,
  });
});
