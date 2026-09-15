# Tarea: pulido visual de tres pantallas del panel

## Contexto del proyecto (léelo, no asumas)

- Panel web privado para asesores de una universidad, dentro de un chatbot de WhatsApp.
- JavaScript puro con **módulos ES nativos** (sin framework, sin bundler) en
  `src/public/app/js/`: `core/`, `ui/`, `screens/`. Estilos en `src/public/app/styles.css`.
- **El estándar visual es iOS**: tarjetas de vidrio con `backdrop-filter`, esquinas muy redondeadas,
  sombras suaves que crecen al pasar el mouse, `transform: scale(0.96)` al presionar, transiciones
  con curvas tipo *spring*. Ya hay variables y clases para todo eso en `styles.css`
  (`--ease-spring`, `.glass`, `.crm-card`, `.widget-card`, `.segmented`, `.skeleton`, `.pulse-dot`).
  **Reutiliza lo que existe; no inventes un estilo nuevo ni metas colores sueltos a mano.**
- Todo el texto visible está en español (Colombia). Los comentarios del código también.

## Problema concreto a arreglar (verificado en el navegador)

En la pantalla de **Gestión de usuarios** (`src/public/app/js/screens/usuarios.js`), cada asesor se
muestra en una tarjeta con tres datos al pie: acciones, a cargo y área. Las etiquetas largas se
parten a mitad de palabra y se lee **"Admisi ones"** y **"Posgra dos"** en dos renglones. Se ve roto.

1. Arréglalo de forma general, no con un ancho fijo: las etiquetas de esas tarjetas no deben
   partirse a mitad de palabra. Considera `hyphens: none`, `overflow-wrap: normal`, permitir que el
   texto largo se muestre en una línea con puntos suspensivos (`text-overflow: ellipsis`) o dar más
   espacio a esa columna. Elige una y explica por qué en un comentario.
2. Revisa que el arreglo se vea bien también a 375 px de ancho (móvil), donde el espacio es menor.

## Además, repasa estas tres pantallas y corrige lo que esté flojo

Mira el código de:

- `src/public/app/js/screens/usuarios.js`
- `src/public/app/js/screens/turno.js`
- `src/public/app/js/screens/recibo.js`

y busca, **solo dentro de esos tres archivos y de `styles.css`**:

3. Botones o elementos tocables sin realimentación al presionar (`:active`) o sin la elevación al
   pasar el mouse que sí tienen los del resto del panel.
4. Textos que puedan desbordar su contenedor con datos largos (nombres largos, programas largos,
   correos largos).
5. Estados de carga que sean texto plano ("Cargando…", un spinner suelto) donde el resto del panel
   usa `.skeleton`.
6. Estados vacíos mudos: cuando no hay nada que mostrar, debe decir qué pasó y qué puede hacer la
   persona, no quedar en blanco.

Cada arreglo, por pequeño que sea, con un comentario corto en español que diga **por qué**.

## Reglas

- **ARCHIVOS BLOQUEADOS** (los edita otra persona ahora mismo; NO los toques):
  `src/routes/`, `src/services/`, `src/flows/`, `src/middleware/`, `package.json`, `tsconfig.json`,
  `src/public/app/index.html`, y cualquier `screens/*.js` que no sea uno de los tres de arriba.
- En `styles.css` **solo agrega** reglas nuevas o ajusta las de las clases que uses; no reescribas
  ni reordenes el archivo, y no toques variables globales de color.
- No instales paquetes. No hagas commit. No borres archivos.
- No cambies el comportamiento ni los datos que muestra ninguna pantalla: esto es pulido visual.
- Verifica que no rompiste la sintaxis de cada archivo que toques:
  `node --check <archivo>` (copiándolo antes a un `.mjs` si hace falta).

## Si algo no aplica

Si al revisar un punto resulta que ya estaba bien, **no inventes un cambio**: anótalo en
`AGENT_PROGRESS.md` como "revisado, ya estaba correcto" y sigue. Un cambio innecesario cuesta más
que uno que falta.

## Progreso incremental (obligatorio)

Crea `AGENT_PROGRESS.md` en la raíz del worktree ANTES de empezar, con un `- [ ]` por cada punto
numerado. Marca `- [x]` con una línea de qué hiciste y en qué archivo apenas termines CADA punto.
Cuando todos estén marcados, agrega como última línea exactamente:

## ESTADO: TERMINADO
