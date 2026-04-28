import express from 'express';
import { config } from './config';
import { webhookRouter } from './routes/webhook';
import { chatwootWebhookRouter } from './routes/chatwootWebhook';

const app = express();

app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/webhook', webhookRouter);
app.use('/chatwoot-webhook', chatwootWebhookRouter);

app.listen(config.port, () => {
  console.log(`Tooli Chatbot escuchando en puerto ${config.port}`);
});
