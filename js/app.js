import { renderLogin } from './views/login.js';
import { renderHome } from './views/home.js';
import { renderFill } from './views/fill.js';
import { renderCreate } from './views/create.js';
import { renderEdit } from './views/edit.js';
import { renderResults } from './views/results.js';

const state = {
  user: null,
  authChecked: false,
};

export function getUser() {
  return state.user;
}

export function setUser(user) {
  state.user = user;
}

export function clearUser() {
  state.user = null;
}

export function navigate(path) {
  const nextHash = `#${path}`;
  if (window.location.hash === nextHash) {
    window.dispatchEvent(new Event('hashchange'));
    return;
  }
  window.location.hash = path;
}

function buildError(message, payload = {}) {
  const err = new Error(message);
  Object.assign(err, payload);
  return err;
}

async function req(method, url, body) {
  const opts = {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw buildError(data?.error || `HTTP ${res.status}`, { status: res.status, code: data?.code, data });
  }
  return data;
}

export const api = {
  get: (url) => req('GET', url),
  post: (url, body) => req('POST', url, body),
  put: (url, body) => req('PUT', url, body),
  patch: (url, body) => req('PATCH', url, body),
  delete: (url, body) => req('DELETE', url, body),
};

export async function refreshSessionUser() {
  const data = await api.get('/api/auth/me');
  setUser(data.user || null);
  state.authChecked = true;
  return state.user;
}

export function toast(msg, type = 'info') {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function showModal({
  title,
  body = '',
  allowHtml = false,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  hideCancel = false,
  onConfirm,
  onOpen,
}) {
  const wrap = document.getElementById('modal-wrap');
  wrap.innerHTML = `
    <div class="modal">
      <div class="modal-title"></div>
      <div class="modal-body"></div>
      <div class="modal-actions">
        ${hideCancel ? '' : `<button class="btn btn-ghost btn-sm" id="modal-cancel">${cancelText}</button>`}
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-sm" id="modal-confirm">${confirmText}</button>
      </div>
    </div>`;
  const modal = wrap.querySelector('.modal');
  modal.querySelector('.modal-title').textContent = title;
  const bodyEl = modal.querySelector('.modal-body');
  if (allowHtml) bodyEl.innerHTML = body;
  else bodyEl.textContent = body;

  wrap.classList.add('open');
  wrap.onclick = (event) => {
    if (event.target === wrap) closeModal();
  };

  const cancelBtn = modal.querySelector('#modal-cancel');
  if (cancelBtn) cancelBtn.onclick = closeModal;

  const confirmBtn = modal.querySelector('#modal-confirm');
  confirmBtn.onclick = async () => {
    confirmBtn.disabled = true;
    try {
      const result = onConfirm ? await onConfirm(modal) : true;
      if (result !== false) closeModal();
    } catch (err) {
      toast(err.message || '操作失败', 'error');
      confirmBtn.disabled = false;
    }
  };

  onOpen?.(modal);
}

export function closeModal() {
  const wrap = document.getElementById('modal-wrap');
  wrap.classList.remove('open');
  wrap.innerHTML = '';
}

export function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseHash() {
  const hash = window.location.hash.replace(/^#/, '') || '/home';
  const parts = hash.split('/').filter(Boolean);
  return {
    path: parts[0] || 'home',
    id: parts[1] || null,
  };
}

function renderSplash(app) {
  app.innerHTML = `
    <div class="splash">
      <span class="splash-rune">✦</span>
    </div>`;
}

async function router() {
  const app = document.getElementById('app');
  renderSplash(app);

  if (!state.authChecked) {
    try {
      await refreshSessionUser();
    } catch {
      state.authChecked = true;
      setUser(null);
    }
  }

  const { path, id } = parseHash();
  const user = getUser();

  if (!user && path !== 'login') {
    navigate('/login');
    return;
  }

  if (user && path === 'login') {
    navigate('/home');
    return;
  }

  try {
    switch (path) {
      case 'login':
        renderLogin(app);
        break;
      case 'home':
        await renderHome(app, user, id);
        break;
      case 'channel':
        await renderHome(app, user, id);
        break;
      case 'create':
        await renderCreate(app, user, id);
        break;
      case 'edit':
        await renderEdit(app, user, id);
        break;
      case 'fill':
        await renderFill(app, user, id);
        break;
      case 'results':
        await renderResults(app, user, id);
        break;
      default:
        navigate('/home');
    }
  } catch (err) {
    if (err?.status === 401) {
      clearUser();
      state.authChecked = true;
      navigate('/login');
      return;
    }
    app.innerHTML = `
      <div class="page">
        <div class="container">
          <div class="empty-state">
            <span class="empty-rune">✦</span>
            <div class="empty-title">页面加载失败</div>
            <p class="empty-desc">${err?.message || '请稍后重试。'}</p>
          </div>
        </div>
      </div>`;
  }
}

window.addEventListener('hashchange', router);
document.addEventListener('DOMContentLoaded', router);
