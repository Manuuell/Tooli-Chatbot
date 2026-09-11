// Service worker del panel de asesores. Objetivo puntual: que el shell de la
// app (HTML/CSS) cargue rápido y siga disponible con mala conexión o sin
// internet — nunca cachear /api/* ni el login, porque esos datos deben ser
// siempre frescos y la sesión depende de cookies validadas por el servidor.
const CACHE_NAME = 'tooli-asesores-shell-v1';
const SHELL_URLS = ['/app/index.html', '/app/styles.css'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return; // nunca cachear datos
  if (url.pathname.endsWith('/login.html')) return; // el login siempre debe ir a red

  const isShell = SHELL_URLS.some((p) => url.pathname.endsWith(p));
  if (!isShell) return; // fuentes, CDNs externos, etc. — comportamiento normal del navegador

  // Stale-while-revalidate: responde con la copia en caché al instante (rápido
  // y funciona sin internet) y en paralelo actualiza la caché desde la red
  // para que la próxima carga ya tenga la versión nueva.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((res) => { if (res.ok) cache.put(request, res.clone()); return res; })
        .catch(() => null);
      return cached || (await network) || new Response('Sin conexión', { status: 503, statusText: 'Offline' });
    })
  );
});
