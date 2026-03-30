// js/views/home.js
import { api, navigate, toast, showModal, clearUser } from '../app.js';

function fmt(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

// ── Sample JSON for download ──────────────────────────────
const SAMPLE_JSON = {
  title: "示例问卷标题",
  description: "在这里填写问卷的说明文字（可选）",
  questions: [
    { type: "single", content: "单选题示例：你最喜欢哪种跑团风格？", options: ["轻松向", "叙事向", "战斗向", "随缘"], has_other: true },
    { type: "multiple", content: "多选题示例：你期待在本次团中体验哪些内容？", options: ["角色关系发展", "史诗战斗", "解谜探索", "情绪高光"], has_other: true },
    { type: "text", content: "主观题示例：请描述你想扮演的角色。", options: null, has_other: false }
  ]
};

export async function renderHome(app, user) {
  app.innerHTML = `
    <nav class="nav">
      <div class="container nav-inner">
        <a class="nav-logo" href="#/home"><span class="nav-logo-rune">⚜</span> 团卷</a>
        <div class="nav-right">
          <span class="nav-user">冒险者 <strong>${escHtml(user.name)}</strong></span>
          <button class="btn btn-ghost btn-sm" id="btn-sample" title="下载示例JSON格式文件">⬇ 示例JSON</button>
          <label class="btn btn-ghost btn-sm" id="btn-import-label" title="从JSON文件导入问卷" style="cursor:pointer">
            ↑ 导入JSON
            <input type="file" id="btn-import" accept=".json" style="display:none">
          </label>
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

  // Download sample JSON
  app.querySelector('#btn-sample').onclick = () => {
    const blob = new Blob([JSON.stringify(SAMPLE_JSON, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = '团卷示例.json'; a.click();
  };

  // Import JSON file
  app.querySelector('#btn-import').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.title || !Array.isArray(data.questions)) throw new Error('格式不正确：缺少 title 或 questions 字段');
      if (!data.questions.length) throw new Error('问题列表不能为空');
      for (const q of data.questions) {
        if (!['single','multiple','text'].includes(q.type)) throw new Error(`未知题目类型: ${q.type}`);
        if (!q.content) throw new Error('有题目缺少 content 字段');
      }
      showModal({
        title: '导入问卷',
        body: `即将导入「${escHtml(data.title)}」，共 ${data.questions.length} 道题目。确认发布？`,
        confirmText: '导入发布',
        onConfirm: async () => {
          try {
            await api.post('/api/surveys', { ...data, creator_id: user.id });
            toast('导入成功！', 'success');
            renderHome(app, user);
          } catch (err) { toast(err.message, 'error'); }
        }
      });
    } catch (err) {
      toast('JSON解析失败：' + err.message, 'error');
    }
    e.target.value = ''; // reset file input
  });

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
        <span>${escHtml(s.creator_name)}</span><span class="dot"></span>
        <span>${fmt(s.created_at)}</span><span class="dot"></span>
        ${statusBadge}${countBadge}
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
          try { await api.patch(`/api/surveys/${id}`, { creator_id: user.id, action: a }); toast(`已${label}`, 'success'); renderHome(app, user); }
          catch (err) { toast(err.message, 'error'); }
        }
      });
    }
    if (action === 'delete') {
      showModal({
        title: '删除问卷', body: `确定要永久删除「${title}」吗？此操作不可撤销。`,
        confirmText: '删除', danger: true,
        onConfirm: async () => {
          try { await api.delete(`/api/surveys/${id}`, { creator_id: user.id }); toast('已删除', 'success'); renderHome(app, user); }
          catch (err) { toast(err.message, 'error'); }
        }
      });
    }
  });
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
