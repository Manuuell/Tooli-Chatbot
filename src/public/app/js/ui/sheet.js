import { $, $$, haptic } from '../core/dom.js';
import { icon } from '../core/icons.js';

const ActionSheet = {
  _escHandler: null,
  open({ title, subtitle, groups }) {
    this.close();
    haptic(12);
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    backdrop.id = 'activeSheet';

    const sheet = document.createElement('div');
    sheet.className = 'action-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    if (title) sheet.setAttribute('aria-label', String(title).replace(/<[^>]*>/g, ''));
    // Se recuerda quién tenía el foco para devolvérselo al cerrar: si no, el
    // teclado queda "perdido" al principio de la página tras cada sheet.
    this._focoPrevio = document.activeElement;

    let html = '<div class="sheet-grabber"></div>';
    if (title) {
      html += `<div class="sheet-header"><div class="sheet-title">${title}</div>${subtitle ? `<div class="sheet-subtitle">${subtitle}</div>` : ''}</div>`;
    }
    const flat = [];
    groups.forEach(group => {
      html += '<div class="sheet-group">' + group.map(a => {
        flat.push(a);
        const cls = [a.destructive ? 'destructive' : '', a.cancel ? 'cancel' : ''].filter(Boolean).join(' ');
        return `<button type="button" class="sheet-action ${cls}">${a.icon ? `<span class="sheet-icon">${a.icon}</span>` : ''}${a.label}</button>`;
      }).join('') + '</div>';
    });
    sheet.innerHTML = html;
    backdrop.appendChild(sheet);
    document.body.appendChild(backdrop);

    $$('.sheet-action', sheet).forEach((btn, i) => btn.addEventListener('click', () => {
      this.close();
      flat[i].onClick && flat[i].onClick();
    }));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) this.close(); });

    let startY = null;
    sheet.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener('touchmove', e => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    sheet.addEventListener('touchend', e => {
      const dy = e.changedTouches[0].clientY - startY;
      sheet.style.transform = '';
      startY = null;
      if (dy > 80) this.close();
    });

    this._escHandler = (e) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this._escHandler);
    requestAnimationFrame(() => backdrop.classList.add('open'));
    // El foco va con temporizador y no con otro requestAnimationFrame: rAF no
    // corre cuando la pestaña está en segundo plano, y entonces el sheet se
    // quedaría sin foco de teclado al volver a ella.
    setTimeout(() => sheet.querySelector('.sheet-action:not(.cancel)')?.focus({ preventScroll: true }), 60);
  },
  close() {
    const el = document.getElementById('activeSheet');
    if (this._escHandler) { document.removeEventListener('keydown', this._escHandler); this._escHandler = null; }
    if (this._focoPrevio?.isConnected) { this._focoPrevio.focus({ preventScroll: true }); }
    this._focoPrevio = null;
    if (!el) return;
    el.classList.remove('open');
    setTimeout(() => el.remove(), 260);
  },
};

function contextSheet(el, { title, subtitle, actions }) {
  attachLongPress(el, () => {
    ActionSheet.open({
      title, subtitle,
      groups: [actions, [{ label: 'Cancelar', cancel: true }]],
    });
  });
}

function attachLongPress(el, handler, opts = {}) {
  const delay = opts.delay ?? 460;
  let timer = null, moved = false, startX = 0, startY = 0, active = false;
  el.classList.add('longpressable');
  const clear = () => {
    clearTimeout(timer); timer = null;
    if (active) { el.classList.remove('longpress-active'); active = false; }
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    moved = false; startX = e.clientX; startY = e.clientY;
    timer = setTimeout(() => {
      if (moved) return;
      active = true;
      el.classList.add('longpress-active');
      const swallowClick = (ev) => { ev.preventDefault(); ev.stopImmediatePropagation(); };
      el.addEventListener('click', swallowClick, { capture: true, once: true });
      setTimeout(() => el.removeEventListener('click', swallowClick, { capture: true }), 700);
      handler();
    }, delay);
  });
  el.addEventListener('pointermove', (e) => {
    if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) { moved = true; clear(); }
  });
  el.addEventListener('pointerup', clear);
  el.addEventListener('pointerleave', clear);
  el.addEventListener('pointercancel', clear);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

export { ActionSheet, contextSheet, attachLongPress };
