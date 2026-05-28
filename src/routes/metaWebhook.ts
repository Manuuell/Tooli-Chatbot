import { Router, Request, Response } from 'express';
import { parseMetaCloudWebhook } from '../webhooks/metaCloudParser';
import { claimMessageId } from '../services/session';
import { checkUserRateLimit } from '../services/rateLimit';
import { track } from '../services/metrics';
import { isBanned, recordActivity } from '../services/botUserService';
import { config } from '../config';
import { messaging } from '../flows/shared';
import { handleMessage } from '../flows';
import { handleNutriaMessage } from '../flows/nutria';

export const metaWebhookRouter = Router();

// ── GET: verificación del webhook requerida por Meta ──────────────────────────
metaWebhookRouter.get('/', (req: Request, res: Response) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.metaCloud.verifyToken) {
    console.log('[meta-webhook] verificación OK');
    res.status(200).send(challenge);
  } else {
    console.warn('[meta-webhook] verificación fallida — token no coincide');
    res.sendStatus(403);
  }
});

// ── POST: mensajes entrantes de Meta Cloud API ────────────────────────────────
metaWebhookRouter.post('/', async (req: Request, res: Response) => {
  // Meta requiere respuesta 200 inmediata o reintentará el envío
  res.sendStatus(200);

  console.log(
    '[meta-webhook] payload object:',
    req.body?.object,
    '| entry count:',
    req.body?.entry?.length ?? 0
  );

  const inbound = parseMetaCloudWebhook(req.body);

  if (!inbound) {
    console.log('[meta-webhook] parser returned null — ignorado (status/no-text)');
    return;
  }

  console.log('[meta-webhook] inbound:', {
    from: inbound.from,
    text: inbound.text,
    id: inbound.messageId,
  });

  const isNew = await claimMessageId(inbound.messageId);
  if (!isNew) {
    console.log('[meta-webhook] mensaje duplicado, ignorado:', inbound.messageId);
    await track('duplicate_message');
    return;
  }

  // En Meta Cloud API el `from` ya es el número E.164 real — no hay @lid
  const from = inbound.from;

  if (await isBanned(from)) {
    console.warn('[meta-webhook] usuario baneado, ignorando:', from.slice(-4));
    return;
  }

  await recordActivity(from, 'in', inbound.text);

  const limit = await checkUserRateLimit(from);
  if (!limit.allowed) {
    console.warn('[meta-webhook] rate limit alcanzado para', from.slice(-4));
    await track('rate_limited');
    if (limit.firstBlock) {
      await messaging
        .sendText({
          to: from,
          text: `⚠️ Estás enviando mensajes muy rápido. Espera ${limit.retryAfterSec}s e intenta de nuevo.`,
        })
        .catch(() => {});
    }
    return;
  }

  // ── Rutear al bot correcto según el número que recibió el mensaje ────────────
  const isNutria = config.nutria.phoneNumberId && inbound.phoneNumberId === config.nutria.phoneNumberId;

  if (isNutria) {
    handleNutriaMessage(from, inbound.text).catch(err => {
      console.error('[meta-webhook] error en handleNutriaMessage para', from.slice(-4), err);
    });
  } else {
    handleMessage(from, inbound.text).catch(err => {
      console.error('[meta-webhook] error en handleMessage para', from.slice(-4), err);
    });
  }
});
