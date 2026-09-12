# Pendientes — Panel de asesores (Tooli)

Ideas y funciones grandes que se discutieron para el panel de asesores pero que
**todavía no están implementadas** porque dependen de una decisión de producto,
credenciales externas, o de un sistema de la universidad que aún no está
conectado. Se documentan aquí para no perderlas y para dejar explícito qué es
real hoy en la UI y qué no — el panel no debe simular una función que no
funciona de verdad.

## 1. Semestre y carrera del estudiante

Hoy el bot **no pregunta** semestre ni carrera *actual* (la de un estudiante ya
matriculado) en ningún flujo — solo captura nombre, correo y programa/carrera
*de interés* de un aspirante (ver `src/flows/registro.ts`, `src/flows/prospecto.ts`,
`src/flows/pregrado.ts`, `src/flows/posgrados-evento/flow.ts`). El campo
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

## 7. Flujo de Pregrado en WhatsApp — ✅ implementado (pendiente probar en producción)

El bot completo estaba marcado como "Posgrados UTB" — no existía registro de
interés ni asesor propio para aspirantes de pregrado, solo Turno/Recibo de
matrícula. Se agregó (`src/flows/pregrado.ts`, `src/flows/menu.ts`,
`src/flows/shared.ts`): el menú inicial ahora pregunta Pregrado o Posgrado
primero, y cada rama tiene su propio registro de interés (carrera como texto
libre — no hay un listado de carreras de pregrado en el sistema, así que no
se inventó uno) y su propio asesor vía Chatwoot (etiqueta `pregrado-prospecto`).
El asistente IA de pregrado reutiliza el área `admisiones` de `aiAssistant.ts`,
que ya tenía su propia base de conocimiento y busca páginas `/pregrado/` — no
se creó una nueva.

Los prospectos de pregrado y posgrado ahora comparten el mismo Google Sheet,
distinguidos por una columna de área nueva (retrocompatible: filas viejas sin
esa columna se leen como "Posgrado"). El panel (CRM, Actividad de asesores,
bandeja de Conversaciones) ya distingue el área en badges y filtros.

**Honestidad sobre las pruebas:** se verificó con `tsc --noEmit` (compila
limpio) y revisión manual cuidadosa, y se probó en navegador la parte del
panel (CRM). **No se pudo probar el flujo conversacional real de WhatsApp
end-to-end** en este entorno porque no hay Redis ni credenciales de Meta
disponibles aquí — antes de considerar esto "en producción", conviene
probarlo manualmente por WhatsApp (o en el ambiente de staging que exista)
siguiendo el camino completo: menú → elegir Pregrado → registrarse → ver
que la fila aparece en el CRM con área "Pregrado".
