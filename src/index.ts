import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { webhookRouter } from './routes/webhook';
import { chatwootWebhookRouter } from './routes/chatwootWebhook';
import { dashboardRouter, promRouter } from './routes/metrics';
import { authRouter } from './routes/authRoutes';
import { toolsRouter } from './routes/toolsRoutes';
import { healthRouter } from './routes/health';
import { seedDefaultAdmin } from './services/usersService';

const app = express();

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

app.use('/health', healthRouter);
app.use('/webhook', webhookRouter);
app.use('/chatwoot-webhook', chatwootWebhookRouter);
app.use('/dashboard', dashboardRouter);
app.use('/metrics', promRouter);

app.use('/api/auth', authRouter);
app.use('/api/tools', toolsRouter);

// Static UI for asesores
app.use('/app', express.static(path.resolve(__dirname, 'public/app')));
app.get('/', (_req, res) => res.redirect('/app/'));
app.get('/app', (_req, res) => res.redirect('/app/'));

app.use('/public', express.static(path.resolve(__dirname, 'public')));

(async () => {
  await seedDefaultAdmin();
  app.listen(config.port, () => {
    console.log(`Tooli Chatbot escuchando en puerto ${config.port}`);
    console.log(`UI Asesores → http://localhost:${config.port}/app/`);
  });
})();
