/* Lógica de la pantalla de inicio de sesión.
   Vive en su propio archivo (y no incrustada en login.html) para que el CSP
   pueda prohibir scripts inline: con 'unsafe-inline' activo, cualquier
   inyección de HTML en la página se ejecutaría como código. */

const form = document.getElementById('loginForm');
const alertBox = document.getElementById('alert');
const btn = document.getElementById('submitBtn');
const btnText = document.getElementById('btnText');
const btnSpinner = document.getElementById('btnSpinner');

function haptic(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch {}
}

function showError(msg) {
  alertBox.classList.remove('hidden');
  alertBox.style.animation = 'none';
  void alertBox.offsetWidth;
  alertBox.style.animation = '';
  alertBox.textContent = msg;
  haptic([20, 30, 20]);
  form.style.animation = 'none';
  void form.offsetWidth;
  form.style.animation = 'shake-x 0.4s ease';
}

function setLoading(loading) {
  btn.disabled = loading;
  btnText.classList.toggle('hidden', loading);
  btnSpinner.classList.toggle('hidden', !loading);
}

const passwordInput = document.getElementById('password');
const toggleBtn = document.getElementById('togglePassword');
const eyeOpen = document.getElementById('eyeOpen');
const eyeClosed = document.getElementById('eyeClosed');
toggleBtn.addEventListener('click', () => {
  const show = passwordInput.type === 'password';
  passwordInput.type = show ? 'text' : 'password';
  eyeOpen.classList.toggle('hidden', show);
  eyeClosed.classList.toggle('hidden', !show);
  toggleBtn.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
  toggleBtn.classList.add('pop');
  setTimeout(() => toggleBtn.classList.remove('pop'), 220);
  haptic(8);
  passwordInput.focus({ preventScroll: true });
});

document.querySelectorAll('.input-wrap input').forEach(inp => {
  inp.addEventListener('focus', () => inp.closest('.input-wrap').classList.add('focused'));
  inp.addEventListener('blur', () => inp.closest('.input-wrap').classList.remove('focused'));
});

(async () => {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (r.ok) window.location.href = '/app/';
  } catch {}
})();

/* Bloq Mayús activado es la causa número uno de "usuario o contraseña
   incorrectos" cuando la contraseña sí está bien. Avisarlo antes evita el
   intento fallido (y el rate limit que viene después de varios). */
const capsWarn = document.getElementById('capsWarn');
const passInput = document.getElementById('password');
const revisarCaps = (e) => {
  const activo = typeof e.getModifierState === 'function' && e.getModifierState('CapsLock');
  capsWarn.classList.toggle('hidden', !activo);
};
passInput.addEventListener('keydown', revisarCaps);
passInput.addEventListener('keyup', revisarCaps);
passInput.addEventListener('blur', () => capsWarn.classList.add('hidden'));

/* Recordar el último usuario: en un panel interno la misma persona entra desde
   el mismo equipo todos los días. Solo el usuario, nunca la contraseña. */
const USUARIO_KEY = 'tooli_ultimo_usuario';
const userInput = document.getElementById('username');
try {
  const guardado = localStorage.getItem(USUARIO_KEY);
  if (guardado) {
    userInput.value = guardado;
    passInput.focus();   // si ya sabemos quién es, el cursor va a la contraseña
  }
} catch { /* modo privado o storage bloqueado: se ignora */ }

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  alertBox.classList.add('hidden');
  setLoading(true);
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error === 'invalid_credentials' ? 'Usuario o contraseña incorrectos.'
        : err.error === 'too_many_attempts' ? `Demasiados intentos. Espera ${Math.ceil((err.retryAfterSec ?? 60) / 60)} minuto(s) e inténtalo de nuevo.`
        : 'No se pudo iniciar sesión. Intenta de nuevo.';
      showError(msg);
      setLoading(false);
      return;
    }
    try { localStorage.setItem(USUARIO_KEY, document.getElementById('username').value.trim()); } catch { /* storage bloqueado */ }
    haptic([15, 30, 15]);
    btnSpinner.classList.add('hidden');
    btn.classList.add('btn-success');
    document.getElementById('btnCheck').classList.remove('hidden');
    const form = document.querySelector('.login-form');
    setTimeout(() => {
      form.style.transition = 'opacity 0.25s ease, transform 0.25s var(--ease-spring)';
      form.style.opacity = '0';
      form.style.transform = 'scale(0.98)';
    }, 260);
    setTimeout(() => { window.location.href = '/app/'; }, 460);
  } catch {
    showError('Error de conexión. Verifica tu red.');
    setLoading(false);
  }
});
