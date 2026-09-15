import { api } from '../core/api.js';
import { FLOW_CATEGORIES, crmEstadoMeta, fichaHtml, flowCategory, wireFicha } from '../core/crm.js';
import { $, $$, copyToClipboard, escapeHtml, haptic, toast } from '../core/dom.js';
import { avatarTone, initialsFor, relativeTime } from '../core/format.js';
import { icon } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { screenInterval, setPullToRefresh } from '../core/screen.js';
import { setRemPrefill } from './recordatorios.js';
import { buildSegmented } from '../ui/controls.js';
import { groupMessages, openPhonePreview, previewPhoneFor } from '../ui/phone-preview.js';
import { openProfileSheet } from '../ui/profile.js';
import { ActionSheet, contextSheet } from '../ui/sheet.js';

let conversationsCache = [];
let inboxFilter = 'todos';

async function renderConversaciones(main) {
  main.innerHTML = `
    <div class="page-header">
      <div><h1>💬 Conversaciones</h1><div class="subtitle">Últimos usuarios que han escrito por WhatsApp — historial, sesión y acciones rápidas.</div></div>
    </div>
    <div class="inbox" id="inbox">
      <div class="inbox-list glass" id="inboxList">
        <div class="inbox-search"><input type="text" id="inboxSearch" placeholder="Buscar por número, nombre o mensaje…" aria-label="Buscar conversaciones"></div>
        <div class="inbox-filter-wrap" id="inboxFilterWrap"></div>
        <button type="button" class="inbox-nuevos" id="inboxNuevos" hidden></button>
        <div class="inbox-rows" id="inboxRows">
          ${Array.from({ length: 7 }).map(() => `
            <div class="inbox-row">
              <div class="skeleton" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;"></div>
              <div style="flex:1;min-width:0;">
                <div class="skeleton skeleton-line" style="width:60%;height:13px;margin-bottom:8px;"></div>
                <div class="skeleton skeleton-line" style="width:85%;height:11px;"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="inbox-thread glass" id="inboxThread">
        <div class="inbox-empty"><div style="font-size:40px;">💬</div>Selecciona una conversación</div>
      </div>
    </div>
  `;

  $('#inboxSearch').addEventListener('input', (e) => renderInboxRows(e.target.value.trim().toLowerCase()));
  $('#inboxNuevos').addEventListener('click', () => { haptic(12); renderConversaciones(main); });
  setPullToRefresh(() => renderConversaciones(main));

  // Sondeo suave de mensajes nuevos. No se re-renderiza la lista sola: si el
  // asesor está leyendo o escribiendo, moverle el piso es peor que avisarle.
  screenInterval(() => buscarMensajesNuevos(), 25_000);

  try {
    const r = await api('/api/tools/bot-users');
    const { phones } = await r.json();
    if (!phones.length) {
      $('#inboxRows').innerHTML = `
        <div class="inbox-empty" style="height:auto;padding:44px 20px;flex-direction:column;text-align:center;gap:6px;">
          <div class="inbox-empty-icon">💬</div>
          <div class="inbox-empty-title">Aún no hay conversaciones</div>
          <div class="inbox-empty-sub">Cuando alguien escriba por WhatsApp aparecerá aquí.</div>
        </div>`;
      return;
    }
    const preview = phones.slice(0, 30);
    // Una sola petición para las 30: antes era una por tarjeta (31 en total
    // cada vez que se abría la bandeja).
    let details;
    try {
      const rb = await api('/api/tools/bot-users/batch', { method: 'POST', body: JSON.stringify({ phones: preview }) });
      details = (await rb.json()).users ?? [];
    } catch {
      details = preview.map(phone => ({ phone, recentMessages: [], banned: false, session: null }));
    }
    conversationsCache = details
      .map(info => ({
        phone: info.phone,
        banned: info.banned,
        nombre: info.session?.data?.nombre,
        last: info.recentMessages[0] ?? null,
        cat: flowCategory(info.session?.step),
      }))
      .concat(phones.slice(30).map(phone => ({ phone, banned: false, nombre: undefined, last: null, cat: null })))
      .sort((a, b) => (b.last?.ts ?? 0) - (a.last?.ts ?? 0));

    const counts = conversationsCache.reduce((acc, c) => { const k = c.cat?.key ?? 'otro'; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
    inboxFilter = 'todos';
    $('#inboxFilterWrap').appendChild(buildSegmented(
      [
        { value: 'todos', label: `Todos (${conversationsCache.length})` },
        ...Object.entries(FLOW_CATEGORIES).filter(([k]) => counts[k]).map(([k, cat]) => ({ value: k, label: `${cat.label} (${counts[k]})` })),
      ],
      inboxFilter, (v) => { inboxFilter = v; renderInboxRows($('#inboxSearch')?.value.trim().toLowerCase() ?? ''); },
    ));
    renderInboxRows('');
  } catch {
    $('#inboxRows').innerHTML = '<div class="alert alert-error" style="margin:12px;">No se pudo cargar la lista.</div>';
  }
}

/* Compara el último mensaje entrante de cada conversación con lo que ya está
   en pantalla y, si hay novedades, muestra una píldora para recargar a voluntad. */
async function buscarMensajesNuevos() {
  if (document.hidden || !conversationsCache.length) return;
  try {
    const { phones } = await (await api('/api/tools/bot-users')).json();
    const revisar = (phones ?? []).slice(0, 15);
    if (!revisar.length) return;
    const rb = await api('/api/tools/bot-users/batch', { method: 'POST', body: JSON.stringify({ phones: revisar }) });
    const detalles = (await rb.json()).users ?? [];

    let nuevas = 0;
    detalles.forEach((info) => {
      if (!info) return;
      const ultimo = info.recentMessages?.[0];
      if (!ultimo || ultimo.direction !== 'in') return;
      const actual = conversationsCache.find(c => c.phone === info.phone);
      if (!actual || !actual.last || ultimo.ts > actual.last.ts) nuevas++;
    });

    const pill = $('#inboxNuevos');
    if (!pill) return;
    if (nuevas > 0) {
      // "conversaciones" pierde la tilde en plural — no se puede armar pegando "es".
      pill.textContent = `${nuevas} ${nuevas === 1 ? 'conversación' : 'conversaciones'} con mensajes nuevos · Actualizar`;
      pill.hidden = false;
    } else {
      pill.hidden = true;
    }
  } catch { /* si falla el sondeo se reintenta en el siguiente ciclo */ }
}

function renderInboxRows(filter) {
  const rowsEl = $('#inboxRows');
  const list = conversationsCache.filter(c => {
    if (inboxFilter !== 'todos' && c.cat?.key !== inboxFilter) return false;
    if (!filter) return true;
    // También busca dentro del último mensaje: para encontrar "beca" o "recibo"
    // hay que poder buscar por lo que la persona escribió, no solo por su nombre.
    return c.phone.includes(filter)
      || (c.nombre?.toLowerCase().includes(filter) ?? false)
      || (c.last?.text?.toLowerCase().includes(filter) ?? false);
  });
  if (!list.length) {
    const hasSearch = !!filter;
    rowsEl.innerHTML = `
      <div class="inbox-empty" style="height:auto;padding:44px 20px;flex-direction:column;text-align:center;gap:6px;">
        <div class="inbox-empty-icon">${hasSearch ? '🔍' : '💬'}</div>
        <div class="inbox-empty-title">${hasSearch ? 'Sin resultados' : 'Nada por aquí'}</div>
        <div class="inbox-empty-sub">${hasSearch ? 'Busca por nombre, número o por lo que dice el último mensaje.' : 'No hay conversaciones en esta categoría.'}</div>
        ${hasSearch ? '<button type="button" class="btn btn-ghost" id="inboxLimpiar" style="margin-top:8px;font-size:13px;">Limpiar búsqueda</button>' : ''}
      </div>`;
    // Listener en vez de onclick inline: el CSP del panel prohíbe ejecutar
    // JavaScript escrito dentro del HTML (ver src/middleware/security.ts).
    $('#inboxLimpiar')?.addEventListener('click', () => {
      const input = $('#inboxSearch');
      if (!input) return;
      input.value = '';
      input.dispatchEvent(new Event('input'));
      input.focus();
    });
    return;
  }
  rowsEl.innerHTML = list.map(c => `
    <div class="swipe-row" data-phone="${c.phone}">
      <div class="swipe-actions">
        <button class="sw-primary" data-swipe-reset>🔄<span>Resetear</span></button>
        <button class="sw-danger" data-swipe-ban>⛔<span>${c.banned ? 'Desbanear' : 'Banear'}</span></button>
      </div>
      <div class="swipe-content">
        <button type="button" class="inbox-row" data-open="${c.phone}">
          <div class="avatar" style="background:${avatarTone(c.phone)}">${initialsFor(c.phone, c.nombre)}</div>
          <div class="inbox-row-body">
            <div class="inbox-row-top">
              <span class="inbox-row-name">${c.nombre ? escapeHtml(c.nombre) : `+${c.phone}`}</span>
              ${c.last ? `<span class="inbox-row-time">${relativeTime(c.last.ts)}</span>` : ''}
            </div>
            <div class="inbox-row-preview">
              ${c.cat ? `<span class="flow-badge" style="background:${c.cat.color}1a;color:${c.cat.color};">${c.cat.label}</span>` : ''}
              ${c.banned ? '⛔ Baneado' : (c.last ? escapeHtml(c.last.text) : 'Sin mensajes registrados')}
            </div>
          </div>
          <span class="swipe-hint" aria-hidden="true">${icon('chevronLeft', 14)}</span>
        </button>
      </div>
    </div>
  `).join('');

  $$('.inbox-row[data-open]', rowsEl).forEach(row => {
    row.addEventListener('click', () => openThread(row.dataset.open));
    contextSheet(row, {
      title: row.dataset.open,
      actions: [
        { label: 'Vista previa en teléfono', icon: '📱', onClick: () => previewPhoneFor(row.dataset.open) },
        { label: 'Copiar número', icon: '🔗', onClick: () => copyToClipboard(row.dataset.open, 'Número copiado') },
        { label: 'Resetear sesión', icon: '🔄', onClick: () => quickAction(row.dataset.open, 'reset-session') },
        { label: 'Banear', icon: '⛔', destructive: true, onClick: () => quickAction(row.dataset.open, 'ban') },
      ],
    });
  });

  $$('.swipe-row', rowsEl).forEach(attachSwipeRow);
  $$('[data-swipe-reset]', rowsEl).forEach(b => b.addEventListener('click', () => quickAction(b.closest('.swipe-row').dataset.phone, 'reset-session')));
  $$('[data-swipe-ban]', rowsEl).forEach(b => b.addEventListener('click', () => {
    const row = b.closest('.swipe-row');
    quickAction(row.dataset.phone, conversationsCache.find(c => c.phone === row.dataset.phone)?.banned ? 'unban' : 'ban');
  }));
}

async function quickAction(phone, action) {
  haptic(action === 'ban' ? [20, 30, 20] : 15);
  await api(`/api/tools/bot-users/${phone}/${action}`, { method: 'POST', body: action === 'ban' ? JSON.stringify({ reason: 'Baneado por asesor' }) : undefined });
  toast(action === 'ban' ? 'Usuario baneado' : action === 'unban' ? 'Usuario desbaneado' : 'Sesión reseteada');
  const c = conversationsCache.find(x => x.phone === phone);
  if (c && action !== 'reset-session') c.banned = action === 'ban';
  renderInboxRows($('#inboxSearch')?.value.trim().toLowerCase() ?? '');
}

/* Swipe-to-reveal (patrón Mail/iOS): arrastra la fila para revelar acciones */
function attachSwipeRow(row) {
  const content = row.querySelector('.swipe-content');
  const actionsEl = row.querySelector('.swipe-actions');
  const REVEAL = Math.ceil(actionsEl?.getBoundingClientRect().width || 140);
  let startX = 0, startY = 0, dx = 0, dragging = false, decided = false, isHorizontal = false;

  const closeAllOthers = () => $$('.swipe-row.swiped').forEach(r => { if (r !== row) { r.classList.remove('swiped'); r.style.setProperty('--swipe-x', '0px'); } });

  row.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    startX = e.clientX; startY = e.clientY; dx = 0; dragging = true; decided = false; isHorizontal = false;
    content.style.transition = 'none';
  });
  row.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rawDx = e.clientX - startX;
    const rawDy = e.clientY - startY;
    if (!decided) {
      if (Math.abs(rawDx) > 8 || Math.abs(rawDy) > 8) { decided = true; isHorizontal = Math.abs(rawDx) > Math.abs(rawDy); }
      else return;
    }
    if (!isHorizontal) { dragging = false; return; }
    e.preventDefault();
    const base = row.classList.contains('swiped') ? -REVEAL : 0;
    dx = Math.min(0, Math.max(-REVEAL - 24, base + rawDx));
    content.style.transform = `translateX(${dx}px)`;
  });
  const finish = () => {
    if (!dragging) return;
    dragging = false;
    content.style.transition = '';
    content.style.transform = '';
    if (dx < -REVEAL / 2) { row.classList.add('swiped'); row.style.setProperty('--swipe-x', `-${REVEAL}px`); haptic(10); closeAllOthers(); }
    else { row.classList.remove('swiped'); row.style.setProperty('--swipe-x', '0px'); }
  };
  row.addEventListener('pointerup', finish);
  row.addEventListener('pointercancel', finish);
  content.querySelector('.inbox-row').addEventListener('click', (e) => {
    if (row.classList.contains('swiped')) { e.preventDefault(); e.stopImmediatePropagation(); row.classList.remove('swiped'); row.style.setProperty('--swipe-x', '0px'); }
  }, { capture: true });
}

async function openThread(phone) {
  const thread = $('#inboxThread');
  $('#inbox').classList.add('thread-open');
  thread.innerHTML = `
    <div class="inbox-thread-header">
      <button type="button" class="mobile-only back-link" id="threadBack" aria-label="Volver a la lista de conversaciones" style="margin:0;">${icon('chevronLeft', 18)}</button>
      <div class="skeleton skeleton-line" style="width:140px;height:16px;"></div>
    </div>
    <div class="inbox-messages">${Array.from({ length: 4 }).map((_, i) => `<div class="skeleton" style="width:${50 + (i % 2) * 15}%;height:36px;border-radius:16px;margin:6px 0;${i % 2 ? 'margin-left:auto;' : ''}"></div>`).join('')}</div>
  `;
  $('#threadBack')?.addEventListener('click', () => $('#inbox').classList.remove('thread-open'));

  try {
    // La ficha del CRM va en paralelo: da contexto para responder (en qué punto
    // del embudo está, quién lo tiene, qué anotó el compañero) sin cambiar de
    // pantalla. Si falla, el hilo se abre igual — es contexto, no un requisito.
    const [r, fichaRes] = await Promise.all([
      api(`/api/tools/bot-users/${phone}`),
      api(`/api/tools/crm/${phone}`).then(x => x.json()).catch(() => null),
    ]);
    const info = await r.json();
    const ficha = fichaRes?.ficha ?? null;
    const nombre = info.session?.data?.nombre;
    const msgs = [...info.recentMessages].reverse();
    const groups = groupMessages(msgs);

    thread.innerHTML = `
      <div class="inbox-thread-header">
        <button type="button" class="mobile-only back-link" id="threadBack" aria-label="Volver a la lista de conversaciones" style="margin:0;">${icon('chevronLeft', 18)}</button>
        <div class="avatar" style="background:${avatarTone(phone)};width:36px;height:36px;font-size:13px;">${initialsFor(phone, nombre)}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:14px;">${nombre ? escapeHtml(nombre) : `+${phone}`}</div>
          <div class="pulse-dot ${info.banned ? 'down' : 'ok'}" style="font-size:11px;">${info.banned ? 'Baneado' : 'Activo'}</div>
        </div>
        <label class="ai-toggle" title="Si la apagas, Tooli deja de responder con IA y escala directo a un asesor">
          <span class="ai-toggle-label">🤖 IA</span>
          <span class="switch">
            <input type="checkbox" id="aiToggleInput" ${info.aiDisabled ? '' : 'checked'}>
            <span class="track"></span><span class="thumb"></span>
          </span>
        </label>
        <button type="button" class="btn btn-ghost" id="threadPhoneBtn" title="Ver cómo lo ve el estudiante" aria-label="Ver la conversación como la ve el estudiante" style="padding:8px;">${icon('phone', 18)}</button>
        <button type="button" class="btn btn-ghost" id="threadMenuBtn" aria-label="Más acciones de esta conversación" style="padding:8px;">${icon('more', 18)}</button>
      </div>
      ${(() => {
        if (!ficha || (ficha.estado === 'nuevo' && !ficha.notas?.length && !ficha.asignadoA && !ficha.etiquetas?.length)) return '';
        const em = crmEstadoMeta(ficha.estado);
        const ultima = ficha.notas?.[0];
        return `
          <div class="thread-crm">
            <span class="badge" style="background:${em.color}1f;color:${em.color};">${em.icon} ${em.label}</span>
            ${ficha.asignadoA ? `<span class="thread-crm-item">${icon('user', 12)} ${escapeHtml(ficha.asignadoA)}</span>` : ''}
            ${ficha.etiquetas?.length ? ficha.etiquetas.slice(0, 3).map(e => `<span class="thread-crm-tag">${escapeHtml(e)}</span>`).join('') : ''}
            ${ultima ? `<span class="thread-crm-nota" title="${escapeHtml(ultima.texto)}">${icon('note', 12)} ${escapeHtml(ultima.texto)}</span>` : ''}
          </div>`;
      })()}
      <div class="inbox-messages" id="inboxMessages">
        ${info.session?.step ? `<div class="thread-meta">Paso actual de la sesión: <strong>${escapeHtml(info.session.step)}</strong></div>` : ''}
        ${groups.length === 0 ? `
          <div class="inbox-empty" style="height:auto;padding:48px 16px;flex-direction:column;text-align:center;gap:6px;">
            <div class="inbox-empty-icon">📭</div>
            <div class="inbox-empty-title">Sin mensajes aún</div>
            <div class="inbox-empty-sub">Los mensajes de WhatsApp aparecerán aquí cuando haya actividad.</div>
          </div>` : groups.map(g => g.map((m, i) => `
          <div class="bubble-row ${m.direction === 'out' ? 'out' : 'in'} ${i === 0 ? 'group-start' : 'group-mid'}">
            <div class="bubble ${m.direction === 'out' ? 'out' : 'in'} ${i !== 0 ? 'not-first' : ''} ${i !== g.length - 1 ? 'not-last' : ''}">
              ${escapeHtml(m.text)}
              ${i === g.length - 1 ? `<span class="bubble-time">${new Date(m.ts).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>` : ''}
            </div>
          </div>
        `).join('')).join('')}
      </div>
      <div class="inbox-thread-footer">
        ${info.banned ? `
          <div class="composer-blocked">${icon('ban', 15)} Esta persona está baneada. Desbanéala para poder responder.</div>
        ` : `
          <form class="composer" id="composer" autocomplete="off">
            <button type="button" class="composer-quick" id="composerQuick" aria-label="Respuestas rápidas" title="Respuestas rápidas">${icon('bolt', 18)}</button>
            <textarea class="composer-input" id="composerInput" rows="1" maxlength="4096"
              placeholder="Escribe un mensaje…" aria-label="Escribir mensaje para ${nombre ? escapeHtml(nombre) : `+${phone}`}"></textarea>
            <button type="submit" class="composer-send" id="composerSend" disabled aria-label="Enviar mensaje">${icon('send', 18)}</button>
          </form>
          <div class="composer-hint" id="composerHint">Enter envía · Shift+Enter salta de línea</div>
        `}
      </div>
    `;
    $('#threadBack')?.addEventListener('click', () => $('#inbox').classList.remove('thread-open'));
    $('#aiToggleInput').addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      haptic(enabled ? [10, 20, 10] : 15);
      await api(`/api/tools/bot-users/${phone}/ai-toggle`, { method: 'POST', body: JSON.stringify({ enabled }) });
      toast(enabled ? 'IA activada para esta conversación' : 'IA apagada — escalará a un asesor');
    });
    $('#threadMenuBtn').addEventListener('click', () => ActionSheet.open({
      title: nombre ?? `+${phone}`,
      groups: [[
        { label: 'Ficha del prospecto', icon: '🗂️', onClick: () => openFichaSheet(phone, nombre, ficha, info) },
        { label: 'Programar recordatorio', icon: '⏰', onClick: () => { setRemPrefill({ telefono: phone, nombre }); navigate('recordatorios'); } },
        { label: 'Copiar número', icon: '🔗', onClick: () => copyToClipboard(phone, 'Número copiado') },
        { label: 'Resetear sesión', icon: '🔄', onClick: () => quickAction(phone, 'reset-session').then(() => openThread(phone)) },
        { label: info.banned ? 'Desbanear' : 'Banear', icon: '⛔', destructive: !info.banned, onClick: () => quickAction(phone, info.banned ? 'unban' : 'ban').then(() => openThread(phone)) },
      ], [{ label: 'Cancelar', cancel: true }]],
    }));
    $('#threadPhoneBtn').addEventListener('click', () => {
      // Si el asesor tiene algo escrito sin enviar, la vista previa lo incluye:
      // el punto de mirar el teléfono es ver cómo va a quedar lo que va a mandar,
      // sobre todo con el formato de WhatsApp (*negrita*, saltos de línea).
      const borrador = $('#composerInput')?.value?.trim();
      const conBorrador = borrador
        ? [...groups, [{ ts: Date.now(), direction: 'out', text: borrador }]]
        : groups;
      openPhonePreview(phone, nombre, conBorrador);
    });
    setupComposer(phone, nombre);
    const msgsEl = $('#inboxMessages');
    requestAnimationFrame(() => {
      try { msgsEl.scrollTo({ top: msgsEl.scrollHeight, behavior: 'smooth' }); } catch { msgsEl.scrollTop = msgsEl.scrollHeight; }
    });
  } catch {
    thread.innerHTML = '<div class="alert alert-error" style="margin:16px;">No se pudo cargar la conversación.</div>';
  }
}



/* Ficha del prospecto desde la bandeja — el mismo componente que usa el CRM,
   para que anotar el resultado de una conversación no obligue a cambiar de
   pantalla ni a buscar a la persona otra vez. */
function openFichaSheet(phone, nombre, ficha, info) {
  const cat = flowCategory(info?.session?.step);
  openProfileSheet({
    avatarBg: avatarTone(phone),
    avatarText: initialsFor(phone, nombre),
    title: nombre || `+${phone}`,
    subtitle: nombre ? `+${phone}` : undefined,
    badges: [
      ...(cat ? [{ label: cat.label, color: cat.color }] : []),
      ...(info?.banned ? [{ label: 'Baneado', color: '#dc2626' }] : []),
      ...(info?.aiDisabled ? [{ label: 'IA apagada', color: '#f59e0b' }] : []),
    ],
    rows: [
      ...(info?.session?.data?.correo ? [{ icon: '📧', label: 'Correo', value: info.session.data.correo }] : []),
      ...(info?.session?.data?.programa ? [{ icon: '🎓', label: 'Programa', value: info.session.data.programa }] : []),
      ...(info?.session?.step ? [{ icon: '🔄', label: 'Paso de la sesión', value: info.session.step }] : []),
    ],
    extraHtml: fichaHtml(ficha),
    onMount: (sheet) => wireFicha(sheet, phone, ficha, null),
    actions: [{ label: 'Vista previa en teléfono', icon: '📲', onClick: () => previewPhoneFor(phone), closeAfter: false }],
  });
}

/* Respuestas rápidas: plantillas compartidas del equipo. El placeholder
   {nombre} se reemplaza acá con el nombre real que capturó el bot — nunca se
   inserta el literal "{nombre}" en un mensaje que va a un estudiante. */
let quickRepliesCache = null;

function aplicarPlaceholders(texto, nombre) {
  const primerNombre = (nombre ?? '').trim().split(/\s+/)[0];
  return texto.replace(/\{nombre\}/g, primerNombre || 'hola');
}

async function abrirRespuestasRapidas(input, sync, nombre) {
  haptic(10);
  if (!quickRepliesCache) {
    try {
      quickRepliesCache = (await (await api('/api/tools/quick-replies')).json()).replies ?? [];
    } catch {
      toast('No se pudieron cargar las respuestas rápidas');
      return;
    }
  }

  const insertar = (texto) => {
    const final = aplicarPlaceholders(texto, nombre);
    // Se inserta en el cursor y NO se envía: el asesor siempre revisa antes.
    const pos = input.selectionStart ?? input.value.length;
    input.value = input.value.slice(0, pos) + final + input.value.slice(pos);
    input.focus();
    input.setSelectionRange(pos + final.length, pos + final.length);
    sync();
    haptic(12);
  };

  const guardarActual = async () => {
    const texto = input.value.trim();
    if (!texto) { toast('Escribe primero el mensaje que quieres guardar'); return; }
    const titulo = texto.split('\n')[0].slice(0, 48);
    try {
      const r = await api('/api/tools/quick-replies', { method: 'POST', body: JSON.stringify({ titulo, texto }) });
      const data = await r.json();
      if (!r.ok) { toast(data.message ?? 'No se pudo guardar'); return; }
      quickRepliesCache = null;
      toast('Guardada como respuesta rápida');
      haptic([10, 20, 10]);
    } catch { toast('No se pudo guardar'); }
  };

  const grupos = [];
  if (quickRepliesCache.length) {
    grupos.push(quickRepliesCache.slice(0, 10).map(q => ({
      label: q.titulo,
      icon: icon('bolt', 15),
      onClick: () => insertar(q.texto),
    })));
  }
  grupos.push([{ label: 'Guardar el mensaje actual', icon: icon('plus', 15), onClick: guardarActual }]);
  grupos.push([{ label: 'Cancelar', cancel: true }]);

  ActionSheet.open({
    title: 'Respuestas rápidas',
    subtitle: quickRepliesCache.length
      ? 'Se inserta en el mensaje para que la revises antes de enviar.'
      : 'Aún no hay ninguna. Escribe un mensaje y guárdalo para reutilizarlo.',
    groups: grupos,
  });
}

/* Composer de la bandeja: responder por WhatsApp sin salir del panel.
   El backend valida la ventana de 24h de Meta y devuelve 409 con el motivo. */
function setupComposer(phone, nombre) {
  const form = $('#composer');
  if (!form) return;
  const input = $('#composerInput');
  const sendBtn = $('#composerSend');
  const hint = $('#composerHint');
  const msgsEl = $('#inboxMessages');

  const autoGrow = () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  };
  const sync = () => {
    sendBtn.disabled = input.value.trim().length === 0;
    autoGrow();
  };
  input.addEventListener('input', sync);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });

  $('#composerQuick')?.addEventListener('click', () => abrirRespuestasRapidas(input, sync, nombre));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = input.value.trim();
    if (!texto) return;

    // Burbuja optimista: el mensaje aparece al instante y se marca "enviando".
    const row = document.createElement('div');
    row.className = 'bubble-row out group-start sending';
    row.innerHTML = `<div class="bubble out">${escapeHtml(texto)}<span class="bubble-time">enviando…</span></div>`;
    msgsEl?.appendChild(row);
    msgsEl?.scrollTo({ top: msgsEl.scrollHeight, behavior: 'smooth' });

    input.value = '';
    sync();
    input.disabled = true;
    sendBtn.disabled = true;
    haptic(12);

    try {
      const r = await api(`/api/tools/bot-users/${phone}/reply`, { method: 'POST', body: JSON.stringify({ text: texto }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        row.remove();
        input.value = texto;   // no perder lo que escribió
        haptic([20, 30, 20]);
        if (data.error === 'fuera_de_ventana') {
          hint.innerHTML = `<span class="composer-warn">${icon('clock', 13)} ${escapeHtml(data.message ?? '')}</span>`;
        } else {
          hint.innerHTML = `<span class="composer-warn">${icon('x', 13)} No se pudo enviar: ${escapeHtml(data.message ?? 'error desconocido')}</span>`;
        }
        return;
      }
      row.classList.remove('sending');
      row.querySelector('.bubble-time').textContent = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
      hint.textContent = 'Enter envía · Shift+Enter salta de línea';
      haptic([10, 20, 10]);
    } catch {
      row.remove();
      input.value = texto;
      hint.innerHTML = `<span class="composer-warn">${icon('x', 13)} Sin conexión con el servidor.</span>`;
      haptic([20, 30, 20]);
    } finally {
      input.disabled = false;
      sync();
      input.focus();
    }
  });
}

export { renderConversaciones };
