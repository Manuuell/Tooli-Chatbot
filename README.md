# Tooli Chatbot

Plataforma de chatbot para WhatsApp de la **Universidad Tecnológica de Bolívar (UTB)**. Gestiona múltiples flujos conversacionales — servicios estudiantiles, encuestas de investigación y atención a prospectos — sobre una arquitectura de adaptadores que soporta tanto **Meta WhatsApp Cloud API** como **Evolution API (Baileys)**.

---

## Módulos activos

| Bot | Número | Función |
|-----|--------|---------|
| **Tooli** | WhatsApp UTB principal | Consulta de turnos, recibos de pago, handoff a agentes Chatwoot |
| **NutriA** | Número independiente | Encuesta de investigación sobre marketing y ultraprocesados |
| **Posgrado** | Número independiente | Registro de prospectos de posgrado → Google Sheets |

---

## Arquitectura

```
WhatsApp (usuario)
       │
       ▼
Meta Cloud API / Evolution API
       │  webhook
       ▼
┌─────────────────────────────────────┐
│         Express Backend (TS)        │
│                                     │
│  ┌─────────────┐  ┌──────────────┐  │
│  │ Flow Router │  │  REST /api   │  │
│  └──────┬──────┘  └──────┬───────┘  │
│         │                │          │
│  ┌──────▼──────────────────────┐    │
│  │  Flows: Tooli · NutriA      │    │
│  │         Posgrado · AI Chat  │    │
│  └──────┬──────────────────────┘    │
│         │                           │
│  ┌──────▼──────┐  ┌──────────────┐  │
│  │    Redis    │  │ Google Sheets│  │
│  │  (sesiones) │  │ (encuestas)  │  │
│  └─────────────┘  └──────────────┘  │
└─────────────────────────────────────┘
       │
       ▼
  Chatwoot (handoff humano)
  Grafana  (métricas)
```

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Runtime | Node.js 20 + TypeScript |
| Framework | Express.js |
| Mensajería | Meta WhatsApp Cloud API / Evolution API (Baileys) |
| Sesiones | Redis (ioredis) con TTL configurable |
| Base de datos | Google Sheets API v4 (service account) |
| IA | OpenAI GPT (flujo de chat libre) |
| Handoff | Chatwoot |
| Métricas | Prometheus + Grafana |
| Infraestructura | Docker Compose en Oracle Cloud VPS |
| Proxy | nginx + Let's Encrypt (SSL) |

---

## Flujos conversacionales

### Tooli (bot principal UTB)
- Consulta de turno de matrícula por código (`T########`)
- Descarga de recibo de pago (login + PDF)
- Información de programas de pregrado y posgrado
- Chat con IA (GPT) para consultas generales
- Escalado a agente humano vía Chatwoot

### NutriA (investigación UTB)
Encuesta de 19 preguntas sobre hábitos de consumo de ultraprocesados e influencia del marketing digital.

- Flujo guiado con botones interactivos de WhatsApp
- Opciones de texto libre para respuestas abiertas
- Guarda resultados en Google Sheets en tiempo real
- Dashboard público en `https://tooli-stand.duckdns.org/nutria/`
  - KPIs en vivo, 8 gráficas, tabla de respuestas individuales
  - Auto-refresh cada 30 segundos

### Posgrado
- Captura de datos de prospectos interesados en posgrados
- Almacenamiento en Google Sheets

---

## Estructura del proyecto

```
src/
├── adapters/messaging/
│   ├── IMessagingAdapter.ts       # Interfaz común
│   ├── MetaCloudAdapter.ts        # Meta WhatsApp Cloud API
│   └── EvolutionAPIAdapter.ts     # Evolution API (Baileys)
├── flows/
│   ├── index.ts                   # Router principal de mensajes
│   ├── menu.ts                    # Menú principal Tooli
│   ├── aiChat.ts                  # Chat libre con GPT
│   ├── programas.ts               # Info de programas UTB
│   ├── registro.ts                # Registro de usuarios
│   ├── prospecto.ts               # Flujo posgrado
│   └── nutria/
│       ├── index.ts               # Entry point NutriA
│       ├── shared.ts              # Sesiones Redis NutriA
│       └── survey.ts              # 19 pasos de la encuesta
├── routes/
│   ├── toolsRoutes.ts             # API REST (dashboard, bot management)
│   ├── metaWebhook.ts             # Webhook Meta Cloud API
│   └── chatwootWebhook.ts         # Webhook Chatwoot
├── services/
│   ├── nutriaSheets.ts            # Google Sheets — NutriA
│   ├── registroService.ts         # Google Sheets — Posgrado
│   ├── botUserService.ts          # Gestión usuarios del bot (Redis)
│   ├── metrics.ts                 # Métricas de uso
│   └── aiAssistant.ts             # Integración OpenAI
├── public/
│   ├── nutria/                    # Dashboard NutriA (público)
│   └── app/                      # Dashboard asesores (privado)
└── webhooks/
    ├── metaCloudParser.ts         # Parser webhook Meta
    └── evolutionParser.ts         # Parser webhook Evolution
```

---

## Variables de entorno

```env
# General
PORT=3000
MESSAGING_ADAPTER=meta          # 'meta' o 'evolution'
WEBHOOK_SECRET=...
REDIS_URL=redis://redis:6379
SESSION_TTL_SECONDS=3600

# Meta WhatsApp Cloud API — Bot principal (Tooli)
WHATSAPP_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_WABA_ID=...
WHATSAPP_VERIFY_TOKEN=...

# Meta WhatsApp Cloud API — NutriA
NUTRIA_WHATSAPP_TOKEN=...
NUTRIA_PHONE_NUMBER_ID=...
NUTRIA_WABA_ID=...
NUTRIA_SHEET_ID=...             # ID del Google Sheet de encuestas

# Evolution API (opcional)
EVOLUTION_API_BASE_URL=http://localhost:8080
EVOLUTION_API_INSTANCE=tooli
EVOLUTION_API_KEY=...

# Google Sheets
GOOGLE_SERVICE_ACCOUNT_JSON='{...}'   # JSON completo del service account
POSGRADO_REGISTRO_SHEET_ID=...

# OpenAI
OPENAI_API_KEY=...

# Chatwoot
CHATWOOT_URL=...
CHATWOOT_ACCOUNT_ID=...
CHATWOOT_INBOX_ID=...
CHATWOOT_API_TOKEN=...
CHATWOOT_HMAC_TOKEN=...
CHATWOOT_INBOX_IDENTIFIER=...
CHATWOOT_TEAM_TI_ID=...
CHATWOOT_TEAM_ADMISIONES_ID=...
CHATWOOT_PLATFORM_TOKEN=...

# Auth (dashboard asesores)
JWT_SECRET=...
ADMIN_USER=admin
ADMIN_PASSWORD=...

# URLs públicas
PUBLIC_CHATWOOT_URL=https://...
PUBLIC_GRAFANA_URL=https://...
```

---

## Despliegue

```bash
# Build y levantar
docker compose build backend
docker compose up -d

# Ver logs
docker compose logs -f backend

# Reiniciar solo el backend
docker compose restart backend
```

El VPS expone el backend en el puerto `3000`. nginx actúa como reverse proxy con SSL (Let's Encrypt) para los dominios:
- `tooli-utb.duckdns.org` — Bot principal + dashboard asesores
- `tooli-stand.duckdns.org` — Dashboard NutriA (público)

---

## API REST destacada

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/api/tools/nutria/encuestas` | ❌ Pública | Leer todas las encuestas NutriA |
| `POST` | `/api/tools/nutria/encuestas/seed` | ❌ Pública* | Insertar fila de prueba |
| `GET` | `/api/tools/turno/:codigo` | ✅ JWT | Consultar turno de matrícula |
| `POST` | `/api/tools/recibo` | ✅ JWT | Descargar recibo de pago (PDF) |
| `GET` | `/api/tools/metrics/today` | ✅ JWT | Métricas del día |
| `GET` | `/api/tools/bot-users` | ✅ JWT | Listar usuarios activos |
| `POST` | `/api/tools/bot-users/:phone/reset-session` | ✅ JWT | Resetear sesión de un usuario |
| `POST` | `/api/tools/bot-users/:phone/ban` | ✅ JWT | Banear usuario |

*Protegido por clave interna.

---

## Privacidad (Ley 1581 — Habeas Data)

- Los números de WhatsApp se usan únicamente para gestionar la sesión conversacional.
- Las encuestas NutriA son voluntarias; el participante acepta explícitamente ser contactado.
- Sesiones almacenadas en Redis con TTL de 1 hora; no se persisten en disco.
- Sin logs en texto plano del contenido de los mensajes.
- Datos de Google Sheets accesibles solo mediante service account con permisos acotados.
