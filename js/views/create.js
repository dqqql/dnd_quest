// js/views/create.js — 创建问卷
import { api, navigate, toast } from '../app.js';
import { buildSurveyEditor, collectSurveyData } from './surveyEditor.js';

export function renderCreate(app, user) {
  app.innerHTML = navHtml(user) + `
    <div class="page">
      <div class="container" style="max-width:720px">
        <div class="section-header">
          <h1 class="section-title">发布新问卷 <span class="section-ornament">✦</span></h1>
          <button class="btn btn-ghost btn-sm" onclick="history.back()">← 返回</button>
        </div>
        <div id="editor-wrap"></div>
        <div style="display:flex;gap:.75rem;margin-top:1.5rem;justify-content:flex-end">
          <button class="btn btn-ghost" onclick="history.back()">取消</button>
          <button id="submit-btn" class="btn btn-primary btn-lg">发布问卷 ✦</button>
        </div>
      </div>
    </div>`;

  buildSurveyEditor(app.querySelector('#editor-wrap'));

  app.querySelector('#submit-btn').addEventListener('click', async () => {
    const data = collectSurveyData(app.querySelector('#editor-wrap'));
    if (!data) return;
    const btn = app.querySelector('#submit-btn');
    btn.disabled = true; btn.textContent = '发布中…';
    try {
      const { id } = await api.post('/api/surveys', { ...data, creator_id: user.id });
      toast('问卷已发布！', 'success');
      navigate('/home');
    } catch (e) {
      toast(e.message, 'error');
      btn.disabled = false; btn.textContent = '发布问卷 ✦';
    }
  });
}

function navHtml(user) {
  return `<nav class="nav"><div class="container nav-inner">
    <a class="nav-logo" href="#/home"><span class="nav-logo-rune">⚜</span> 团卷</a>
    <div class="nav-right"><span class="nav-user">冒险者 <strong>${escHtml(user.name)}</strong></span></div>
  </div></nav>`;
}
function escHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
