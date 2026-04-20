import { api, navigate, toast } from '../app.js';
import { buildSurveyEditor, collectSurveyData } from './surveyEditor.js';

export async function renderEdit(app, user, surveyId) {
  app.innerHTML = `${navHtml(user)}
    <div class="page"><div class="container" style="max-width:720px"><div class="empty-state"><span class="splash-rune">✦</span></div></div></div>`;

  let survey;
  try {
    survey = await api.get(`/api/surveys/${surveyId}`);
  } catch (err) {
    toast(err.message, 'error');
    navigate('/home');
    return;
  }

  if (!survey.can_edit) {
    toast('无权编辑这份问卷', 'error');
    navigate('/home');
    return;
  }

  app.querySelector('.page .container').innerHTML = `
    <div class="section-header">
      <div>
        <h1 class="section-title">编辑问卷</h1>
        <p style="color:var(--text-d);margin-top:.35rem">当前频道：${escHtml(survey.channel?.name || '未知频道')}</p>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="history.back()">返回</button>
    </div>
    <div id="editor-wrap"></div>
    <div style="display:flex;gap:.75rem;margin-top:1.5rem;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="history.back()">取消</button>
      <button id="submit-btn" class="btn btn-primary btn-lg">保存更改</button>
    </div>`;

  buildSurveyEditor(app.querySelector('#editor-wrap'), survey);

  app.querySelector('#submit-btn').addEventListener('click', async () => {
    const data = collectSurveyData(app.querySelector('#editor-wrap'));
    if (!data) return;
    const btn = app.querySelector('#submit-btn');
    btn.disabled = true;
    btn.textContent = '保存中...';
    try {
      await api.put(`/api/surveys/${surveyId}`, data);
      toast('问卷已保存', 'success');
      navigate(`/channel/${survey.channel_id}`);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = '保存更改';
    }
  });
}

function navHtml(user) {
  return `<nav class="nav"><div class="container nav-inner">
    <a class="nav-logo" href="#/home"><span class="nav-logo-rune">✦</span> 团卷</a>
    <div class="nav-right"><span class="nav-user">冒险者 <strong>${escHtml(user.username)}</strong></span></div>
  </div></nav>`;
}

function escHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
