async function doLogout() {
  await api('/api/auth/logout', { method: 'POST' });
  window.location.href = '/app/login.html';
}

async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (res.status === 401) { window.location.href = '/app/login.html'; return; }
  return res;
}

export { api, doLogout };
