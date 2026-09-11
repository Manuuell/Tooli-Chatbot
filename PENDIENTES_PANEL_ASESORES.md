# Pendientes — Panel de asesores (Tooli)

Ideas y funciones grandes que se discutieron para el panel de asesores pero que
**todavía no están implementadas** porque dependen de una decisión de producto,
credenciales externas, o de un sistema de la universidad que aún no está
conectado. Se documentan aquí para no perderlas y para dejar explícito qué es
real hoy en la UI y qué no — el panel no debe simular una función que no
funciona de verdad.

## 1. Semestre y carrera del estudiante

Hoy el bot **no pregunta** semestre ni carrera en ningún flujo — solo captura
nombre, correo y programa de interés (ver `src/flows/registro.ts`,
`src/flows/prospecto.ts`, `src/flows/posgrados-evento/flow.ts`). El campo
`session.data` en `botUserService.ts` solo tiene lo que esos flujos guardan.

Cuando la universidad tenga un sistema (SIA, Banner, etc.) con el que
integrarse, el camino natural es:
- Un flujo del bot que pida el código estudiantil y consulte ese sistema
  (similar a como `turnosService.ts` / `icebergService.ts` ya hacen login
  contra el portal de matrículas).
- O una importación periódica (CSV / API) que enriquezca los perfiles del CRM
  (`src/public/app/index.html`, sección `renderRegistros`) con semestre y
  carrera reales, cruzando por código estudiantil o email.

**No implementar esto con datos inventados en el frontend.** El día que haya
un sistema real contra el cual consultar, se agrega el campo a
`BotUserInfo`/`registroService.ts` y se muestra en el CRM y en la bandeja de
Conversaciones (ya tienen espacio reservado en el layout de la tarjeta).

## 2. Agendar en Google Calendar

Requiere decidir: ¿cuenta de servicio de Google Workspace de la universidad?
¿calendario compartido por asesor o uno solo del área? Con eso se puede:
- Agregar un botón "Agendar cita" en la bandeja de Conversaciones y en el CRM.
- Backend: `googleapis` ya es dependencia del proyecto (se usa para Sheets),
  así que añadir Calendar API es una extensión natural, no una librería nueva.

## 3. Enviar correos desde el panel

Requiere SMTP o Gmail API con las credenciales de un remitente autorizado por
la universidad (para que no caiga en spam / no se use una cuenta personal).
Una vez se tenga eso, un botón "Enviar correo" en el CRM (ya tiene el email
del prospecto) es sencillo de conectar.

## 4. Actividad / rendimiento de asesores — ✅ implementado

Construido de punta a punta: `auditService.ts` registra cada acción (login,
turno consultado, recibo descargado, reset de sesión, baneos, toggle de IA)
etiquetada por `req.user.username`, expuesto en `/api/tools/audit/summary` y
mostrado en el panel como un dashboard real (podio + gráfico de barras +
detalle por tipo de acción) en `renderActividad` dentro de
`src/public/app/index.html`.

## 6. Mensajes masivos / campañas nativas (reemplazar el uso de Chatwoot para esto)

Pedido explícito: tener dentro del panel lo que hoy se hace en Chatwoot para
enviar mensajes a varios contactos a la vez, e idealmente mejor. Antes de
construirlo hay una restricción real de WhatsApp que no se puede evitar con
código: el adaptador de mensajería actual es `meta` (WhatsApp Business
Platform — ver `config.messagingAdapter` en `src/flows/shared.ts`), y Meta
**no permite enviar texto libre fuera de una ventana de 24h desde el último
mensaje del usuario** — un envío masivo real solo es posible usando
*message templates* pre-aprobados por Meta (ej. "Recordatorio de cita",
"Nueva convocatoria de posgrado"), cada uno sujeto a revisión y aprobación
de Meta antes de poder usarse.

Camino natural para construirlo bien (no como un botón que technically no
funciona):
- Backend: un servicio `broadcastService.ts` que use la Graph API de Meta
  para (a) listar los templates ya aprobados en el Business Manager de la
  universidad, y (b) enviarlos a una lista de números.
- Frontend: en el CRM (`renderRegistros`) ya existen los filtros por
  categoría de programa — se puede agregar un modo "seleccionar varios" +
  botón "Enviar plantilla a los seleccionados", reutilizando el mismo
  segmentado y las tarjetas que ya existen.
- Requisito externo real: acceso al Business Manager / WABA de la
  universidad para ver o crear los templates — sin eso se puede dejar la
  UI lista pero no probarla contra un envío real.

## 5. Multi-universidad / integración con la app móvil de la UTB

La arquitectura actual (adaptadores de mensajería intercambiables, flujos por
"área") ya está pensada para poder replicarse en otra institución cambiando
configuración y contenido, no código base. Conectarlo con una app móvil
existente de la UTB implicaría exponer parte de esta API REST (`toolsRoutes.ts`)
con autenticación de esa app — es una conversación de arquitectura/seguridad
con quien mantenga esa app, no un cambio que se pueda improvisar sin ese
contacto.
