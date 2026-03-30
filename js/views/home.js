// js/views/home.js
import { api, navigate, toast, showModal, clearUser } from '../app.js';

function fmt(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

export async function renderHome(app, user) {
  app.innerHTML = `
    <nav class="nav">
      <div class="container nav-inner">
        <a class="nav-logo" href="#/home"><span class="nav-logo-rune">⚜</span> 团卷</a>
        <div class="nav-right">
          <span class="nav-user">冒险者 <strong>${user.name}</strong></span>
          <button class="btn btn-secondary btn-sm" id="btn-create">+ 发布问卷</button>
          <button class="btn btn-ghost btn-sm" id="btn-logout">退出</button>
        </div>
      </div>
    </nav>
    <div class="page">
      <div class="container">
        <div class="section-header">
          <h2 class="section-title">问卷列表 <span class="section-ornament">✦</span></h2>
        </div>
        <div id="survey-list"><div class="empty-state"><span class="splash-rune">⚜</span></div></div>
      </div>
    </div>`;

  app.querySelector('#btn-create').onclick = () => navigate('/create');
  app.querySelector('#btn-logout').onclick = () => {
    showModal({
      title: '退出确认', body: '确定要退出当前冒险者账号吗？',
      confirmText: '退出', danger: true,
      onConfirm: () => { clearUser(); navigate('/login'); }
    });
  };

  try {
    const surveys = await api.get('/api/surveys');
    const el = app.querySelector('#survey-list');
    if (!surveys.length) {
      el.innerHTML = `<div class="empty-state"><span class="empty-rune">📜</span><div class="empty-title">尚无问卷</div><p class="empty-desc">发布第一份问卷，开始记录冒险故事</p></div>`;
      return;
    }
    el.innerHTML = `<div class="survey-grid">${surveys.map((s, i) => surveyCard(s, user, i)).join('')}</div>`;
    bindCardEvents(app, user, surveys);
  } catch (e) {
    toast(e.message, 'error');
  }
}

function surveyCard(s, user, i) {
  const isOwner = String(s.creator_id) === String(user.id);
  const statusBadge = s.is_closed
    ? `<span class="badge badge-closed">已关闭</span>`
    : `<span class="badge badge-open">开放中</span>`;
  const countBadge = `<span class="badge badge-count">${s.response_count} 份</span>`;

  const ownerActions = isOwner ? `
    <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${s.id}">编辑</button>
    <button class="btn btn-ghost btn-sm" data-action="toggle" data-id="${s.id}" data-closed="${s.is_closed}">
      ${s.is_closed ? '重新开放' : '关闭'}
    </button>
    <button class="btn btn-danger btn-sm" data-action="delete" data-id="${s.id}" data-title="${escHtml(s.title)}">删除</button>` : '';

  const fillBtn = s.is_closed ? '' : `<button class="btn btn-primary btn-sm" data-action="fill" data-id="${s.id}">填写问卷</button>`;
  const resultBtn = isOwner ? `<button class="btn btn-secondary btn-sm" data-action="results" data-id="${s.id}">查看结果</button>` : '';

  return `
    <div class="survey-card" style="animation-delay:${i * 0.06}s">
      <h3 class="survey-card-title">${escHtml(s.title)}</h3>
      ${s.description ? `<p class="survey-card-desc">${escHtml(s.description)}</p>` : ''}
      <div class="survey-card-meta">
        <span>${escHtml(s.creator_name)}</span>
        <span class="dot"></span>
        <span>${fmt(s.created_at)}</span>
        <span class="dot"></span>
        ${statusBadge}
        ${countBadge}
      </div>
      <div class="survey-card-footer">
        <div class="survey-card-actions">${fillBtn}${resultBtn}</div>
        <div class="survey-card-actions">${ownerActions}</div>
      </div>
    </div>`;
}

function bindCardEvents(app, user, surveys) {
  app.querySelector('.survey-grid').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id, closed, title } = btn.dataset;

    if (action === 'fill')    return navigate(`/fill/${id}`);
    if (action === 'results') return navigate(`/results/${id}`);
    if (action === 'edit')    return navigate(`/edit/${id}`);

    if (action === 'toggle') {
      const a = closed === '1' ? 'reopen' : 'close';
      const label = a === 'close' ? '关闭' : '重新开放';
      showModal({
        title: `${label}问卷`, body: `确定要${label}此问卷吗？`,
        confirmText: label, danger: a === 'close',
        onConfirm: async () => {
          try {
            await api.patch(`/api/surveys/${id}`, { creator_id: user.id, action: a });
            toast(`已${label}`, 'success');
            renderHome(app, user);
          } catch (err) { toast(err.message, 'error'); }
        }
      });
    }

    if (action === 'delete') {
      showModal({
        title: '删除问卷', body: `确定要永久删除「${title}」吗？此操作不可撤销。`,
        confirmText: '删除', danger: true,
        onConfirm: async () => {
          try {
            await api.delete(`/api/surveys/${id}`, { creator_id: user.id });
            toast('已删除', 'success');
            renderHome(app, user);
          } catch (err) { toast(err.message, 'error'); }
        }
      });
    }
  });
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
