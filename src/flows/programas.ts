import { setSession } from '../services/session';
import { FlowContext, messaging, sendMenu } from './shared';
import { track } from '../services/metrics';

// ── Textos informativos (sin opciones numéricas) ──────────────────────────────

const ESPECIALIZACIONES_INFO =
  '📚 *Especializaciones UTB*\n' +
  '_Duración: 2 semestres — Inscripción: $247.000_\n\n' +
  '• Telecomunicaciones y Redes — $10.2M/sem\n' +
  '• Logística del Transporte — $9.8M/sem\n' +
  '• Gestión Ambiental Sostenible — $9.8M/sem\n' +
  '• Sistemas Energéticos Sostenibles — $11.2M/sem\n' +
  '• Automatización Industrial — $11.2M/sem\n' +
  '• Gerencia de Proyectos — $12.5M/sem\n' +
  '• Análisis y Diseño Estructural — $13M/sem\n' +
  '• Ingeniería de Software _(virtual)_ — $8.3M/sem\n' +
  '• Gerencia de Servicios de Salud _(virtual)_ — $7.95M/sem\n' +
  '• Educación Mediada por TIC _(virtual)_ — $6.95M/sem';

const MAESTRIAS_INFO =
  '🎓 *Maestrías UTB*\n' +
  '_Duración: 3-4 semestres — Inscripción: $284.000_\n\n' +
  '• Gestión de la Innovación — $9.8M/sem · 4 sem\n' +
  '• Ingeniería — $10.95M/sem · 4 sem\n' +
  '• Gerencia de Proyectos — $13.4M/sem · 4 sem\n' +
  '• *MBA* — $17.9M/sem · 3 sem\n' +
  '• Gerencia Tributaria — $10.95M/sem · 3 sem\n' +
  '• *Ciberseguridad* — $13M/sem · 3 sem\n' +
  '• Educación Mediada por TIC _(virtual)_ — $6.95M/sem · 3 sem';

const DOCTORADOS_INFO =
  '🔬 *Doctorados UTB*\n' +
  '_Duración: 8 semestres — Investigación avanzada_\n\n' +
  '• Doctorado en Ingeniería — 8 SMMLV/sem\n' +
  '• Doctorado en Desarrollo Regional y Local — $15.1M/sem\n' +
  '• Doctorado en Sostenibilidad — $12.3M/sem\n\n' +
  '_Requisito: título de maestría o pregrado con alto promedio._';

// ── Helper: muestra el selector de categoría como lista interactiva ───────────

export async function sendCategoriasMenu(to: string): Promise<void> {
  await messaging.sendList({
    to,
    title: '🎓 Programas de Posgrado UTB',
    description: '¿Qué tipo de programa te interesa?',
    footer: 'Escribe menu para volver al inicio',
    buttonText: 'Ver categorías',
    sections: [
      {
        title: 'Tipo de programa',
        rows: [
          { id: '1', title: '📚 Especializaciones', description: '2 semestres · Presencial y virtual' },
          { id: '2', title: '🎓 Maestrías',          description: '3-4 semestres · Presencial y virtual' },
          { id: '3', title: '🔬 Doctorados',          description: '8 semestres · Investigación avanzada' },
        ],
      },
    ],
  });
}

// ── Helper: botones de acción tras ver el detalle de un programa ─────────────

async function sendAccionesDetalle(to: string): Promise<void> {
  await messaging.sendButtons({
    to,
    title: '¿Qué quieres hacer?',
    description: 'Elige una opción para continuar',
    buttons: [
      { id: '1', displayText: '🤖 Preguntar a la IA' },
      { id: '2', displayText: '👤 Hablar con asesor' },
      { id: '3', displayText: '🔙 Otros programas' },
    ],
  });
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/** Paso 1: el usuario elige categoría */
export async function handleProgramasCategoria(ctx: FlowContext): Promise<void> {
  const { from, text } = ctx;
  const input = text.trim();

  if (input === '1') {
    await setSession(from, { step: 'programas_detalle', data: { categoria: 'especializaciones' } });
    await track('programas_especializaciones');
    await messaging.sendText({ to: from, text: ESPECIALIZACIONES_INFO });
    await sendAccionesDetalle(from);
    return;
  }

  if (input === '2') {
    await setSession(from, { step: 'programas_detalle', data: { categoria: 'maestrias' } });
    await track('programas_maestrias');
    await messaging.sendText({ to: from, text: MAESTRIAS_INFO });
    await sendAccionesDetalle(from);
    return;
  }

  if (input === '3') {
    await setSession(from, { step: 'programas_detalle', data: { categoria: 'doctorados' } });
    await track('programas_doctorados');
    await messaging.sendText({ to: from, text: DOCTORADOS_INFO });
    await sendAccionesDetalle(from);
    return;
  }

  if (input === '4' || input.toLowerCase() === 'menu') {
    await setSession(from, { step: 'menu', data: {} });
    await sendMenu(from);
    return;
  }

  // Input no reconocido — repetir lista
  await sendCategoriasMenu(from);
}

/** Paso 2: el usuario elige acción tras ver el listado */
export async function handleProgramasDetalle(ctx: FlowContext): Promise<void> {
  const { from, text, session } = ctx;
  const input = text.trim();
  const categoria = session?.data.categoria ?? 'maestrias';

  if (input === '1') {
    await setSession(from, {
      step: 'chatting_with_ai',
      data: { area: 'posgrados', categoria },
    });
    await messaging.sendText({
      to: from,
      text:
        '🤖 *Asistente IA de Posgrados*\n\n' +
        '¿Qué quieres saber sobre este programa o cualquier otro?\n\n' +
        '_Escribe *asesor* para hablar con una persona, o *menu* para volver._',
    });
    return;
  }

  if (input === '2') {
    await setSession(from, { step: 'prospecto_nombre', data: { categoria } });
    await messaging.sendText({
      to: from,
      text:
        '🧑‍💼 *Conectar con asesor de Posgrados*\n\n' +
        'Para que el asesor pueda ayudarte mejor, necesito algunos datos rápidos.\n\n' +
        '¿Cuál es tu *nombre completo*?',
    });
    await track('prospecto_iniciado');
    return;
  }

  if (input === '3') {
    await setSession(from, { step: 'programas_categoria', data: {} });
    await sendCategoriasMenu(from);
    return;
  }

  if (input.toLowerCase() === 'menu') {
    await setSession(from, { step: 'menu', data: {} });
    await sendMenu(from);
    return;
  }

  await sendAccionesDetalle(from);
}
