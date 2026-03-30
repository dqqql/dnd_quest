// js/app.js — 路由 / 状态 / API / Toast / Modal
import { renderLogin }   from './views/login.js';
import { renderHome }    from './views/home.js';
import { renderFill }    from './views/fill.js';
import { renderCreate }  from './views/create.js';
import { renderEdit }    from './views/edit.js';
import { renderResults } from './views/results.js';

// ── State ────────────────────────────────────────
export function getUser() {
  try { return JSON.parse(localStorage.getItem('wj_user')) || null; }
  catch { return null; }
}
export function setUser(u) { localStorage.setItem('wj_user', JSON.stringify(u)); }
export function clearUser() { localStorage.removeItem('wj_user'); }

// ── Navigation ───────────────────────────────────
export function navigate(path) { window.location.hash = path; }

// ── API ──────────────────────────────────────────
async function req(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
export const api = {
  get:    (url)       => req('GET',    url),
  post:   (url, body) => req('POST',   url, body),
  put:    (url, body) => req('PUT',    url, body),
  patch:  (url, body) => req('PATCH',  url, body),
  delete: (url, body) => req('DELETE', url, body),
};

// ── Toast ────────────────────────────────────────
export function toast(msg, type = 'info') {
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ── Modal ─────────────────────────────────────────
export function showModal({ title, body, confirmText = '确认', onConfirm, cancelText = '取消', danger = false }) {
  const wrap = document.getElementById('modal-wrap');
  wrap.innerHTML = `
    <div class="modal">
      <div class="modal-title">${title}</div>
      <div class="modal-body">${body}</div>
      <div class="modal-actions">
        <button class="btn btn-ghost btn-sm" id="modal-cancel">${cancelText}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-sm" id="modal-confirm">${confirmText}</button>
      </div>
    </div>`;
  wrap.classList.add('open');
  wrap.querySelector('#modal-cancel').onclick = closeModal;
  wrap.querySelector('#modal-confirm').onclick = () => { closeModal(); onConfirm && onConfirm(); };
  wrap.onclick = (e) => { if (e.target === wrap) closeModal(); };
}
export function closeModal() { document.getElementById('modal-wrap').classList.remove('open'); }

// ── Router ───────────────────────────────────────
function parseHash() {
  const hash = window.location.hash.replace('#', '') || '/home';
  const parts = hash.split('/').filter(Boolean);
  return { path: parts[0] || 'home', id: parts[1] || null };
}

function router() {
  const { path, id } = parseHash();
  const app = document.getElementById('app');
  const user = getUser();

  if (!user && path !== 'login') { navigate('/login'); return; }
  if (user  && path === 'login') { navigate('/home');  return; }

  switch (path) {
    case 'login':   renderLogin(app); break;
    case 'home':    renderHome(app, user); break;
    case 'fill':    renderFill(app, user, id); break;
    case 'create':  renderCreate(app, user); break;
    case 'edit':    renderEdit(app, user, id); break;
    case 'results': renderResults(app, user, id); break;
    default:        renderHome(app, user);
  }
}

window.addEventListener('hashchange', router);
document.addEventListener('DOMContentLoaded', router);
