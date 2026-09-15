import { $, haptic } from './dom.js';
import { icon } from './icons.js';
import { navigate } from './router.js';

/* ============= PULL TO REFRESH =============
   Patrón de FastFood traducido a JS puro: arrastre con resistencia (no 1:1),
   el spinner rota siguiendo el dedo, haptic al cruzar el umbral y solo se
   dispara si efectivamente se pasó. Se activa únicamente cuando la página
   ya está arriba del todo, para no pelearse con el scroll normal. */
const PTR_UMBRAL = 62;
const PTR_MAX = 96;
let ptrHandler = null;   // callback de la pantalla actual (null = sin recarga)
let ptrIndicador = null;

/** Cada pantalla con datos registra acá cómo recargarse. navigate() lo limpia. */
function setPullToRefresh(fn) { ptrHandler = fn; }

/* Timers de la pantalla actual. Sin esto, cada intervalo que arranca una
   pantalla sigue corriendo después de navegar a otra: el panel se va poniendo
   lento solo con el uso y las peticiones se acumulan en segundo plano. */
let screenTimers = [];
function screenInterval(fn, ms) {
  const id = setInterval(fn, ms);
  screenTimers.push(id);
  return id;
}
function clearScreenTimers() {
  screenTimers.forEach(clearInterval);
  screenTimers = [];
}

function ptrGetIndicador() {
  if (ptrIndicador) return ptrIndicador;
  ptrIndicador = document.createElement('div');
  ptrIndicador.className = 'ptr-indicator';
  ptrIndicador.setAttribute('aria-hidden', 'true');
  ptrIndicador.innerHTML = `<span class="ptr-spinner">${icon('refresh', 20)}</span>`;
  document.body.appendChild(ptrIndicador);
  return ptrIndicador;
}

(function initPullToRefresh() {
  let startY = null;
  let activo = false;
  let cruzado = false;
  let recargando = false;

  document.addEventListener('touchstart', (e) => {
    if (recargando || !ptrHandler || e.touches.length !== 1) return;
    // Solo si ya estamos arriba del todo y el dedo no empezó dentro de un
    // contenedor con su propio scroll (el hilo de mensajes, por ejemplo).
    if (window.scrollY > 4) return;
    const dentroDeScroll = e.target.closest?.('.inbox-messages, .profile-sheet, .action-sheet');
    if (dentroDeScroll) return;
    startY = e.touches[0].clientY;
    activo = true;
    cruzado = false;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!activo || startY == null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) return;
    const dist = Math.min(PTR_MAX, dy * 0.45);   // resistencia
    const ind = ptrGetIndicador();
    ind.style.transform = `translate(-50%, ${dist}px)`;
    ind.style.opacity = String(Math.min(1, dist / PTR_UMBRAL));
    ind.querySelector('.ptr-spinner').style.transform = `rotate(${dist * 4}deg)`;
    if (dist >= PTR_UMBRAL && !cruzado) { cruzado = true; haptic(12); ind.classList.add('ready'); }
    if (dist < PTR_UMBRAL && cruzado) { cruzado = false; ind.classList.remove('ready'); }
  }, { passive: true });

  const soltar = async () => {
    if (!activo) return;
    activo = false;
    startY = null;
    const ind = ptrGetIndicador();

    if (!cruzado || !ptrHandler) {
      ind.style.transform = '';
      ind.style.opacity = '0';
      ind.classList.remove('ready');
      return;
    }

    recargando = true;
    ind.classList.add('loading');
    ind.style.transform = `translate(-50%, ${PTR_UMBRAL}px)`;
    try { await ptrHandler(); } catch { /* la pantalla ya muestra su propio error */ }
    haptic([10, 18, 10]);
    ind.classList.remove('loading', 'ready');
    ind.style.transform = '';
    ind.style.opacity = '0';
    recargando = false;
    cruzado = false;
  };
  document.addEventListener('touchend', soltar, { passive: true });
  document.addEventListener('touchcancel', soltar, { passive: true });
})();

export { setPullToRefresh, screenInterval, clearScreenTimers };
