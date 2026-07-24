# Matrícula UTB — herramienta local

Interfaz web (marca UTB) para matricular materias por **NRC** en el portal Autoservicio (Banner, `ssbprod.utb.edu.co`). Es un paso previo a integrarlo en el bot Tooli.

## Correr

```bash
node matricula-local/server.js
# → http://localhost:4600
```

(Usa `express` y `googleapis`, ya instalados en el proyecto. Puerto configurable con `MATRICULA_PORT` — **no** con `PORT`, porque el `.env` de la raíz define `PORT=3000` para el bot.)

Lee el `.env` de la raíz del proyecto para `GOOGLE_SERVICE_ACCOUNT_JSON` (turnos).

## Estado

| Parte | Estado |
|-------|--------|
| Interfaz web (logo/colores UTB, NRC dinámicos, resultados) | ✅ |
| Motor de matrícula (`POST bwckcoms.P_Regs`) | ✅ validado contra el portal real |
| Inicio de sesión asistido por navegador (SSO Microsoft) | ✅ abre Chrome y captura la sesión solo; verificado hasta el login de Microsoft |
| Login nativo código + NIP (`twbkwbis.P_ValLogin`) | ✅ implementado (fallback; casi nadie tiene NIP) |
| Ver materias matriculadas + **eliminar** (drop, `RSTS_IN=DW`) | ✅ panel “Mis materias” con botón Eliminar por curso |
| **Horario visual** (calendario semanal) | ✅ grilla día/hora con colores por materia; toggle Horario/Lista |
| **Turno de matrícula** (Google Sheet) | ✅ ventana inicio→fin con cuenta regresiva, al conectarse |
| **Preview del horario** (“cómo quedaría”) | ✅ cupos + horas de cada NRC y **detección de choques**, sin necesidad de sesión |
| **Auto-matrícula en el turno** | ✅ keepalive de sesión, dispara a la hora del turno y reintenta hasta lograrlo |

## Inicio de sesión

En UTB los estudiantes entran a Banner por **Microsoft SSO** (`ssomanager` → CAS `appethosprod` → WSO2 → Microsoft, con Authenticator). El login nativo `sid`+`PIN` (NIP) existe pero casi nadie lo usa.

**Método principal — botón “Iniciar sesión en Banner”:** el programa abre tu **Google Chrome** en el SSO, tú te autenticas UNA vez (Microsoft + Authenticator) en esa ventana, y el programa **captura la sesión solo** (`lib/loginBrowser.js`, detecta la cookie `SESSID` de `ssbprod`). Con MFA no hay forma de evitar la aprobación del Authenticator (es el humano); todo lo demás es automático. La sesión queda en memoria del servidor hasta que expira o cierres sesión.

**Alternativas** (en “Otras formas de conexión”): NIP de Banner (`sid`+`PIN`), o **cookie de sesión** manual (pégala, o usa `.session` / `BANNER_COOKIE`).

Tras iniciar sesión, Banner exige fijar el **período** antes del worksheet; el motor lo hace solo (`bwcklibs.P_StoreTerm`, por defecto `202620`, configurable con `BANNER_TERM`).

## Estructura

```
matricula-local/
  server.js          Express: sirve la UI + API + motor de auto-matrícula
  lib/banner.js      login · enroll · drop · schedule · ping (keepalive)
  lib/catalogo.js    consulta pública de secciones (horarios y cupos por NRC)
  lib/turnos.js      turno de matrícula desde el Google Sheet (cuenta de servicio)
  lib/loginBrowser.js  abre Chrome en el SSO y captura la cookie de sesión
  public/index.html  interfaz UTB (autocontenida)
  public/utb-logo.png
```

## API

- `POST /api/login-browser` → abre Chrome en el SSO y captura la sesión. `{ ok }`
- `GET  /api/session-status` → `{ ready }`
- `POST /api/logout` → borra la sesión capturada.
- `POST /api/horario` → `{ ok, schedule:[{crn,subj,crse,sec,title}] }`
- `POST /api/matricula` → `{ nrcs:[...], codigo?, pin?, cookie? }` → `{ ok, results:[{nrc,ok,message}], schedule, hadErrors }`
- `POST /api/eliminar` → `{ crn, codigo?, pin?, cookie? }` → `{ ok, crn, schedule }`
- `GET  /api/turno?codigo=` → `{ ok, turno:{ turno, inicioISO, finISO, inicioTexto, finTexto, … } }` (sin `codigo` usa el de la sesión)
- `POST /api/seccion` → `{ nrcs:[...] }` → `{ ok, secciones:[{crn,title,subj,crse,sec,cupos:{capacidad,inscritos,disponibles},meetings}] }`
- `POST /api/auto/start` → `{ nrcs:[...], startAtISO? }` · `GET /api/auto/status` · `POST /api/auto/cancel`

Todas resuelven la sesión así: cookie explícita → sesión del navegador → `.session`/`BANNER_COOKIE` → código+NIP.

> ⚠️ La matrícula es real. `enroll` reenvía el horario completo con `RSTS_IN=""` (mantener) e inyecta cada NRC en una casilla libre con `RSTS_IN=RW`. No elimina materias.

## El código del estudiante (y por qué se rompía)

El turno se busca **por código**, así que sin código no hay turno ni auto-matrícula. Se resuelve en tres pasos, en orden:

1. **Cookie `sghe_magellan_username`** (base64 del `T########`). Ojo: el SSO la deja a veces en el dominio padre `.utb.edu.co` — no en `ssbprod.utb.edu.co` — y a veces **unos segundos después** de `SESSID`. Filtrar sólo por `ssbprod` y cortar apenas aparece `SESSID` hacía que el código saliera `null` de forma intermitente. `loginBrowser.js` ahora acepta ambos dominios y espera hasta ~5,6 s por ella.
2. **`banner.codigoFromPortal`**: si la cookie no llegó, busca el `T########` en seis páginas del portal que ya requieren sesión, y si falla imprime en consola qué revisó y qué vio.
3. **`POST /api/codigo`**: el usuario lo escribe una vez (la tarjeta del turno se lo pide sola).

Al iniciar sesión la consola dice cuál de los caminos funcionó: `código T00070682 (cookie)` o `(portal: /ruta)`.

## Turno de matrícula

Sale del Google Sheet `1OdXAte…` (“Turnos de matrícula web”), leído con la **cuenta de servicio** (`GOOGLE_SERVICE_ACCOUNT_JSON`); el export CSV anónimo está bloqueado por la unidad compartida. Se busca por código en la columna **B**: la hoja repite encabezados por cada “Turnos - Grupo N”, así que no sirve asumir una fila de inicio fija.

Las celdas vienen como `"viernes, 24 de julio de 2026"` + `"8:00"`, y la hora de cierre como `"12:00:00  m."` — que en uso colombiano es **mediodía** (`lib/turnos.js` lo interpreta así).

## Preview del horario (`lib/catalogo.js`)

Ambas páginas responden **sin sesión**, así que el preview funciona antes de iniciar sesión:

1. `bwckschd.p_disp_detail_sched?term_in&crn_in=<NRC>` → título, `SUBJ/CRSE/SEC` y cupos.
   En esta instalación **no** trae la tabla de horarios.
2. `bwckschd.p_disp_listcrse?term_in&subj_in&crse_in&crn_in=<NRC>` → “Horas de Reunión Programadas”.
   Con sólo `crn_in` responde **HTTP 500**; de ahí que haga falta el paso 1 para sacar `subj/crse`.

Nomenclatura de días real: **L M I J V S D** (la leyenda de la propia página dice “Jueves (E)”, pero los datos usan `J`; el parser acepta ambas).

## Auto-matrícula

Un solo trabajo a la vez, en memoria del servidor (si se reinicia, se pierde — a propósito).

1. Espera hasta la hora de inicio del turno, tocando `twbkwbis.P_GenMenu` cada 2 min para que la sesión no caduque (`AUTO_PING_MS` para ajustar).
2. Al abrir el turno dispara `enroll` y **reintenta**: cada 2 s durante el primer minuto, luego cada 10 s, hasta 15 min.
3. Los NRC que fallan por causa **permanente** (prerrequisito, repetida, retención, choque…) se descartan; los de causa pasajera (“sin cupo”, worksheet cerrado) se siguen reintentando.

> ⚠️ Se arma con confirmación explícita y envía matrícula **real** sin volver a preguntar. Requiere sesión viva: con MFA y la caducidad (~30 min) de Banner, conviene armarlo con el turno cerca.
