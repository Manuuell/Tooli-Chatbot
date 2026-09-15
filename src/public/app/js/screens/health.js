import { $, $$, escapeHtml } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { setPullToRefresh } from '../core/screen.js';
import { attachTooltip } from '../ui/controls.js';

const HEALTH_LABELS = {
  ok: 'Operativo', degraded: 'Degradado', down: 'Caído', skipped: 'No verificado',
};

/* ============= ESTADO DEL SISTEMA ============= */
async function renderHealth(main) {
  main.innerHTML = `
    <div class="page-header">
      <div><h1>❤️ Estado del sistema</h1><div class="subtitle">Verifica que todos los servicios externos estén respondiendo.</div></div>
      <button class="btn btn-secondary" id="refreshHealth"><span class="refresh-icon">${icon('refresh', 16)}</span> Actualizar</button>
    </div>
    <div id="healthContent">
      <div class="card">
        <div class="skeleton skeleton-line" style="width:180px;height:18px;margin-bottom:16px;"></div>
        ${Array.from({ length: 4 }).map(() => `<div style="display:flex;gap:16px;padding:10px 0;border-bottom:1px solid var(--border);"><div class="skeleton skeleton-line" style="width:110px;height:12px;"></div><div class="skeleton skeleton-line" style="width:70px;height:12px;"></div><div class="skeleton skeleton-line" style="flex:1;height:12px;"></div></div>`).join('')}
      </div>
    </div>
  `;
  setPullToRefresh(() => load());
  const load = async () => {
    const refreshBtn = $('#refreshHealth');
    refreshBtn.disabled = true;
    refreshBtn.querySelector('.refresh-icon')?.classList.add('spin-once');
    $('#healthContent').innerHTML = `
      <div class="card">
        <div class="skeleton skeleton-line" style="width:220px;height:20px;margin-bottom:18px;"></div>
        ${Array.from({ length: 4 }).map(() => `<div style="display:flex;gap:16px;padding:10px 0;border-bottom:1px solid var(--border);"><div class="skeleton skeleton-line" style="width:120px;"></div><div class="skeleton skeleton-line" style="width:80px;"></div><div class="skeleton skeleton-line" style="width:200px;"></div></div>`).join('')}
      </div>`;
    try {
      const r = await fetch('/health/deep', { credentials: 'same-origin' });
      const data = await r.json();
      const entries = Object.entries(data.checks);
      const byStatus = entries.reduce((acc, [, c]) => { acc[c.status] = (acc[c.status] ?? 0) + 1; return acc; }, {});
      $('#healthContent').innerHTML = `
        <div class="widget-card" style="margin-bottom:16px;">
          <div class="widget-card-head">
            <h3>Estado general</h3>
            <span class="pulse-dot ${data.status}" style="font-weight:700;">${HEALTH_LABELS[data.status] ?? data.status}</span>
          </div>
          <div style="font-size:12.5px;color:var(--text-muted);padding:0 4px;">
            ${['ok', 'degraded', 'down'].filter(s => byStatus[s]).map(s => `${byStatus[s]} ${HEALTH_LABELS[s]?.toLowerCase() ?? s}`).join(' · ')}
            · Última verificación: ${new Date(data.timestamp).toLocaleTimeString('es-CO')}
          </div>
        </div>
        <div class="crm-grid stagger-in">
          ${entries.map(([name, c]) => `
            <div class="crm-card health-card" data-service="${name}">
              <div class="health-card-top">
                <span class="pulse-dot ${c.status}">${HEALTH_LABELS[c.status] ?? c.status}</span>
                ${c.latencyMs ? `<span class="health-latency">${c.latencyMs}ms</span>` : ''}
              </div>
              <div class="crm-card-name" style="text-transform:capitalize;">${escapeHtml(name.replace(/_/g, ' '))}</div>
              <div class="crm-card-row" data-detail>${escapeHtml(c.detail ?? 'Sin detalle adicional')}</div>
            </div>
          `).join('')}
        </div>
      `;
      $$('.health-card[data-service]').forEach(card => {
        const c = data.checks[card.dataset.service];
        if (c?.detail) attachTooltip(card.querySelector('.crm-card-name'), c.detail);
      });
    } catch {
      $('#healthContent').innerHTML = '<div class="alert alert-error">No se pudo verificar el estado.</div>';
    } finally {
      refreshBtn.disabled = false;
    }
  };
  $('#refreshHealth').addEventListener('click', load);
  load();
}

export { renderHealth };
