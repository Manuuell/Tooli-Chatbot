import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { webhookRouter } from './routes/webhook';
import { metaWebhookRouter } from './routes/metaWebhook';
import { chatwootWebhookRouter } from './routes/chatwootWebhook';
import { dashboardRouter, promRouter } from './routes/metrics';
import { authRouter } from './routes/authRoutes';
import { toolsRouter } from './routes/toolsRoutes';
import { healthRouter } from './routes/health';
import { seedDefaultAdmin } from './services/usersService';
import { startReminderWorker } from './services/reminderService';

const app = express();

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

app.use('/health', healthRouter);
app.use('/webhook', webhookRouter);
app.use('/meta-webhook', metaWebhookRouter);
app.use('/chatwoot-webhook', chatwootWebhookRouter);
app.use('/dashboard', dashboardRouter);
app.use('/metrics', promRouter);

app.use('/api/auth', authRouter);
app.use('/api/tools', toolsRouter);

// Static UI for asesores
app.use('/app', express.static(path.resolve(__dirname, 'public/app')));
app.get('/', (_req, res) => res.redirect('/app/'));
app.get('/app', (_req, res) => res.redirect('/app/'));

// Dashboard público NutriA
app.use('/nutria', express.static(path.resolve(__dirname, 'public/nutria')));

// Dashboard público Posgrados (presentación + QR del chat)
app.use('/posgrados', express.static(path.resolve(__dirname, 'public/posgrados')));

// Imágenes subidas por usuarios (capturas de pantalla métricas)
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

app.use('/public', express.static(path.resolve(__dirname, 'public')));

(async () => {
  await seedDefaultAdmin();
  // Dispara los recordatorios programados que ya vencieron (ver reminderService.ts).
  startReminderWorker();
  app.listen(config.port, () => {
    console.log(`Tooli Chatbot escuchando en puerto ${config.port}`);
    console.log(`UI Asesores → http://localhost:${config.port}/app/`);
  });
})();
