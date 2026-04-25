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
};
