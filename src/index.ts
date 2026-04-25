import express from 'express';
import { config } from './config';
import { webhookRouter } from './routes/webhook';

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/webhook', webhookRouter);

app.listen(config.port, () => {
  console.log(`Tooli Chatbot escuchando en puerto ${config.port}`);
});
