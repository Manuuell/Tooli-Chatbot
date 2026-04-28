import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.string().default('3000'),
  EVOLUTION_API_BASE_URL: z.string().url(),
  EVOLUTION_API_INSTANCE: z.string(),
  EVOLUTION_API_KEY: z.string(),
  WEBHOOK_SECRET: z.string(),
  REDIS_URL: z.string().default('redis://redis:6379'),
  SESSION_TTL_SECONDS: z.string().default('3600'),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string(),
  OPENAI_API_KEY: z.string().optional(),
  CHATWOOT_URL: z.string().optional(),
  CHATWOOT_ACCOUNT_ID: z.string().optional(),
  CHATWOOT_INBOX_ID: z.string().optional(),
  CHATWOOT_API_TOKEN: z.string().optional(),
  CHATWOOT_HMAC_TOKEN: z.string().optional(),
  CHATWOOT_INBOX_IDENTIFIER: z.string().optional(),
  CHATWOOT_TEAM_TI_ID: z.string().optional(),
  CHATWOOT_TEAM_ADMISIONES_ID: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

export const config = {
  port: parseInt(env.PORT),
  webhookSecret: env.WEBHOOK_SECRET,
  evolutionApi: {
    baseUrl: env.EVOLUTION_API_BASE_URL,
    instance: env.EVOLUTION_API_INSTANCE,
    apiKey: env.EVOLUTION_API_KEY,
  },
  redis: {
    url: env.REDIS_URL,
    sessionTtl: parseInt(env.SESSION_TTL_SECONDS),
  },
  google: {
    serviceAccount: JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON),
  },
  openai: {
    apiKey: env.OPENAI_API_KEY,
  },
  chatwoot: {
    url: env.CHATWOOT_URL ?? '',
    accountId: env.CHATWOOT_ACCOUNT_ID ?? '',
    inboxId: env.CHATWOOT_INBOX_ID ?? '',
    apiToken: env.CHATWOOT_API_TOKEN ?? '',
    hmacToken: env.CHATWOOT_HMAC_TOKEN ?? '',
    inboxIdentifier: env.CHATWOOT_INBOX_IDENTIFIER ?? '',
    teamTiId: env.CHATWOOT_TEAM_TI_ID ?? '',
    teamAdmisionesId: env.CHATWOOT_TEAM_ADMISIONES_ID ?? '',
  },
};
