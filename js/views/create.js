import { api, navigate, toast } from '../app.js';
import { buildSurveyEditor, collectSurveyData } from './surveyEditor.js';

export async function renderCreate(app, user, preferredChannelId) {
  const channelsData = await api.get('/api/channels');
  const publishableChannels = channelsData.channels.filter((channel) => channel.is_public || channel.is_owner);
  const selectedChannelId = Number(preferredChannelId) && publishableChannels.some((channel) => Number(channel.id) === Number(preferredChannelId))
    ? Number(preferredChannelId)
    : publishableChannels.find((channel) => channel.is_public)?.id || publishableChannels[0]?.id;

  app.innerHTML = `
    ${navHtml(user)}
    <div class="page">
      <div class="container" style="max-width:720px">
        <div class="section-header">
          <h1 class="section-title">发布问卷</h1>
          <button class="btn btn-ghost btn-sm" onclick="history.back()">返回</button>
        </div>
        <div class="card" style="margin-bottom:1rem">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" for="create-channel-select">发布到频道</label>
            <select id="create-channel-select" class="form-input">
              ${publishableChannels.map((channel) => `
                <option value="${channel.id}" ${Number(channel.id) === Number(selectedChannelId) ? 'selected' : ''}>
                  ${escHtml(channel.name)}${channel.is_public ? '（公共频道）' : ''}
                </option>`).join('')}
            </select>
          </div>
        </div>
        <div id="editor-wrap"></div>
        <div style="display:flex;gap:.75rem;margin-top:1.5rem;justify-content:flex-end">
          <button class="btn btn-ghost" onclick="history.back()">取消</button>
          <button id="submit-btn" class="btn btn-primary btn-lg">发布问卷</button>
        </div>
      </div>
    </div>`;

  buildSurveyEditor(app.querySelector('#editor-wrap'));

  app.querySelector('#submit-btn').addEventListener('click', async () => {
    const data = collectSurveyData(app.querySelector('#editor-wrap'));
    if (!data) return;
    const btn = app.querySelector('#submit-btn');
    btn.disabled = true;
    btn.textContent = '发布中...';
    try {
      const channelId = Number(app.querySelector('#create-channel-select').value);
      await api.post('/api/surveys', { ...data, channel_id: channelId });
      toast('问卷已发布', 'success');
      navigate(`/channel/${channelId}`);
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = '发布问卷';
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
