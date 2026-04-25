# Tooli Chatbot

Chatbot de WhatsApp para el Centro de Servicios de la UTB (Universidad Tecnológica de Bolívar).

## Estado
Piloto en diseño. Backend por definir (TS o Python).

## Stack (decidido)
- **Mensajería:** Evolution API (Baileys) — REST + webhooks.
- **Motor conversacional:** Typebot (flujos lineales y formularios).
- **Handoff humano:** Chatwoot.
- **Backend:** _por definir_ — Node.js+TS o Python+FastAPI.
- **Infra:** Docker Compose en VPS.

## Arquitectura asumida
```
WhatsApp ──> Evolution API ──> webhook ──> Backend ──┬──> Typebot
                                                      ├──> Chatwoot (handoff)
                                                      └──> API interna Tooli
                                  Backend ──> Evolution API ──> WhatsApp
```

## Features del piloto
1. Consulta de turno de matrícula por código estudiantil.
2. Estado de solicitudes activas en Tooli.
3. Escalado a agente humano vía Chatwoot.

## Deuda técnica conocida (piloto → producción)
Migración futura a **WhatsApp Cloud API**. El adapter de mensajería debe aislar:
- Templates aprobados para mensajes fuera de la ventana de 24h.
- Formato de mensajes interactivos (buttons / lists).
- Rate limits y reintentos más estrictos.
- Payloads de webhook incompatibles.

## Privacidad (Ley 1581 — Habeas Data)
- Código estudiantil: dato personal (no sensible).
- Información académica/financiera: dato sensible.
- Sesión en Redis con TTL corto; mínimo necesario.
- Sin logs en texto plano del contenido de mensajes.
