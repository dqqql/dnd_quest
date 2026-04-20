import { api, clearUser, closeModal, downloadJsonFile, navigate, showModal, toast } from '../app.js';

export async function renderHome(app, user, routeChannelId) {
  app.innerHTML = `
    ${navHtml(user)}
    <div class="page">
      <div class="container">
        <div class="channel-layout" style="display:grid;grid-template-columns:280px minmax(0,1fr);gap:1.25rem;align-items:start">
          <aside id="channel-sidebar"></aside>
          <main id="channel-main">
            <div class="empty-state"><span class="splash-rune">✦</span></div>
          </main>
        </div>
      </div>
    </div>`;

  const channelListData = await api.get('/api/channels');
  const channels = channelListData.channels || [];
  const publicChannel = channels.find((channel) => channel.is_public);
  const ownedPrivateChannels = channels.filter((channel) => !channel.is_public && channel.is_owner);
  const manageableChannels = [publicChannel, ...ownedPrivateChannels].filter(Boolean);
  const selectedChannelId = Number(routeChannelId) || publicChannel?.id || channels[0]?.id;
  const selectedSummary =
    channels.find((channel) => Number(channel.id) === Number(selectedChannelId)) || publicChannel || channels[0];

  renderSidebar(app, channels, selectedSummary?.id);
  bindGlobalActions(app, user, publicChannel, ownedPrivateChannels, selectedSummary);

  if (!selectedSummary) {
    app.querySelector('#channel-main').innerHTML = emptyState('还没有可用频道', '先创建一个私密频道，或者稍后再来看看。');
    return;
  }

  try {
    const detail = await api.get(`/api/channels/${selectedSummary.id}`);
    let members = [];
    if (detail.channel.is_owner && !detail.channel.is_public) {
      const memberData = await api.get(`/api/channels/${selectedSummary.id}/members`);
      members = memberData.members || [];
    }
    renderChannelDetail(app, detail.channel, detail.surveys || [], members, manageableChannels);
  } catch (err) {
    if (err.code === 'CHANNEL_INVITE_REQUIRED') {
      renderInviteGate(app, selectedSummary);
      bindInviteJoin(app, selectedSummary.id);
      return;
    }
    app.querySelector('#channel-main').innerHTML = emptyState('加载失败', err.message || '暂时无法读取频道内容。');
  }
}

function renderSidebar(app, channels, selectedChannelId) {
  const sidebar = app.querySelector('#channel-sidebar');
  sidebar.innerHTML = `
    <div class="card">
      <div class="section-header" style="margin-bottom:1rem">
        <h2 class="section-title" style="font-size:1.05rem">频道</h2>
      </div>
      <div class="channel-list">
        ${channels.map((channel) => sidebarChannelHtml(channel, selectedChannelId)).join('')}
      </div>
    </div>`;

  sidebar.querySelectorAll('[data-channel-nav]').forEach((button) => {
    button.addEventListener('click', () => navigate(`/channel/${button.dataset.channelNav}`));
  });
}

function renderChannelDetail(app, channel, surveys, members, manageableChannels) {
  const main = app.querySelector('#channel-main');
  main.innerHTML = `
    ${channelHeroHtml(channel)}
    ${channelAdminHtml(channel, members)}
    <div class="section-header" style="margin-top:1.5rem">
      <h2 class="section-title">问卷列表</h2>
      <div style="color:var(--text-d);font-size:.88rem">${surveys.length} 份问卷</div>
    </div>
    ${surveys.length
      ? `<div class="survey-grid">${surveys.map((survey, index) => surveyCard(survey, channel, index, manageableChannels)).join('')}</div>`
      : emptyState('这里还没有问卷', '可以先发布一份，或者导入现成 JSON 模板。')}`;

  if (channel.is_owner && !channel.is_public) bindAdminActions(app, channel.id);
  bindSurveyActions(app, channel, manageableChannels);
}

function renderInviteGate(app, channel) {
  app.querySelector('#channel-main').innerHTML = `
    ${channelHeroHtml(channel)}
    <div class="card" style="padding:1.25rem">
      <div class="section-header">
        <h2 class="section-title">需要邀请码</h2>
      </div>
      <p style="color:var(--text-m);margin-bottom:1rem">这个频道开启了成员可见模式。输入邀请码后，后续会自动记住你的加入状态。</p>
      <div class="form-group">
        <label class="form-label" for="invite-code">邀请码</label>
        <input id="invite-code" class="form-input" type="text" placeholder="例如 ABCD-1234" maxlength="16">
      </div>
      <button class="btn btn-primary" id="btn-join-channel">加入频道</button>
    </div>`;
}

function bindInviteJoin(app, channelId) {
  app.querySelector('#btn-join-channel')?.addEventListener('click', async () => {
    const input = app.querySelector('#invite-code');
    const inviteCode = input.value.trim().toUpperCase();
    if (!inviteCode) {
      toast('请输入邀请码', 'error');
      input.focus();
      return;
    }
    try {
      await api.post(`/api/channels/${channelId}/join`, { invite_code: inviteCode });
      toast('加入成功，之后无需重复输入邀请码', 'success');
      navigate(`/channel/${channelId}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function bindGlobalActions(app, user, publicChannel, ownedPrivateChannels, selectedChannel) {
  app.querySelector('#btn-create-survey').onclick = () => {
    const preferredChannelId =
      selectedChannel && (selectedChannel.is_public || selectedChannel.is_owner) ? selectedChannel.id : publicChannel?.id;
    navigate(`/create/${preferredChannelId || ''}`);
  };

  app.querySelector('#btn-create-channel').onclick = () => {
    if (ownedPrivateChannels.length >= 3) {
      toast('你已经创建了 3 个私密频道', 'info');
      return;
    }
    showCreateChannelModal();
  };

  app.querySelector('#btn-import').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file || !publicChannel) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      validateSurveyJson(data);
      const created = await api.post('/api/surveys', { ...data, channel_id: publicChannel.id });
      toast('问卷已先创建到公共频道', 'success');
      if (ownedPrivateChannels.length) showMoveAfterImportModal(created.id, data.title, ownedPrivateChannels);
      else navigate(`/channel/${publicChannel.id}`);
    } catch (err) {
      toast(err.message || '导入失败', 'error');
    } finally {
      event.target.value = '';
    }
  });

  app.querySelector('#btn-sample').onclick = async () => {
    try {
      const response = await fetch(encodeURI('/团后复盘问卷.json'));
      const data = await response.json();
      downloadJsonFile('团后复盘问卷.json', data);
    } catch {
      toast('模板读取失败', 'error');
    }
  };

  app.querySelector('#btn-logout').onclick = () => {
    showModal({
      title: '退出登录',
      body: '确认退出当前账号吗？',
      confirmText: '退出',
      danger: true,
      onConfirm: async () => {
        await api.post('/api/auth/logout', {});
        clearUser();
        navigate('/login');
      },
    });
  };

  function showCreateChannelModal() {
    showModal({
      title: '创建私密频道',
      allowHtml: true,
      body: `
        <div class="form-group">
          <label class="form-label" for="channel-name">频道名称</label>
          <input id="channel-name" class="form-input" type="text" maxlength="40" placeholder="例如：不冻港长团">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" for="channel-mode">频道权限</label>
          <select id="channel-mode" class="form-input">
            <option value="visible">所有登录用户可看，成员可填写</option>
            <option value="members_only">只有成员才能进入频道内容</option>
          </select>
        </div>`,
      confirmText: '创建频道',
      onConfirm: async (modal) => {
        const data = await api.post('/api/channels', {
          name: modal.querySelector('#channel-name').value.trim(),
          access_mode: modal.querySelector('#channel-mode').value,
        });
        toast('私密频道已创建', 'success');
        closeModal();
        navigate(`/channel/${data.channel.id}`);
      },
    });
  }

  function showMoveAfterImportModal(surveyId, title, channels) {
    showModal({
      title: '导入完成',
      allowHtml: true,
      body: `
        <p style="margin-bottom:1rem;color:var(--text-m)">问卷 <strong>${escHtml(title)}</strong> 已创建在公共频道。要不要顺手移动到你的私密频道？</p>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" for="move-channel-select">目标频道</label>
          <select id="move-channel-select" class="form-input">
            ${channels.map((channel) => `<option value="${channel.id}">${escHtml(channel.name)}</option>`).join('')}
          </select>
        </div>`,
      confirmText: '移动过去',
      cancelText: '留在公共频道',
      onConfirm: async (modal) => {
        const channelId = Number(modal.querySelector('#move-channel-select').value);
        await api.patch(`/api/surveys/${surveyId}`, { action: 'move', channel_id: channelId });
        toast('问卷已移动', 'success');
        navigate(`/channel/${channelId}`);
      },
    });
  }
}

function bindAdminActions(app, channelId) {
  app.querySelector('#btn-regenerate-invite')?.addEventListener('click', () => {
    showModal({
      title: '刷新邀请码',
      body: '刷新后旧邀请码会立刻失效，确定继续吗？',
      confirmText: '刷新',
      danger: true,
      onConfirm: async () => {
        const data = await api.post(`/api/channels/${channelId}/invite`, {});
        toast(`邀请码已刷新：${data.invite_code}`, 'success');
        navigate(`/channel/${channelId}`);
      },
    });
  });

  app.querySelector('#btn-edit-channel')?.addEventListener('click', () => {
    const card = app.querySelector('[data-channel-admin]');
    showModal({
      title: '编辑频道',
      allowHtml: true,
      body: `
        <div class="form-group">
          <label class="form-label" for="edit-channel-name">频道名称</label>
          <input id="edit-channel-name" class="form-input" type="text" value="${escHtml(card.dataset.channelName)}" maxlength="40">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" for="edit-channel-mode">频道权限</label>
          <select id="edit-channel-mode" class="form-input">
            <option value="visible" ${card.dataset.channelMode === 'visible' ? 'selected' : ''}>所有登录用户可看，成员可填写</option>
            <option value="members_only" ${card.dataset.channelMode === 'members_only' ? 'selected' : ''}>只有成员才能进入频道内容</option>
          </select>
        </div>`,
      confirmText: '保存',
      onConfirm: async (modal) => {
        await api.patch(`/api/channels/${channelId}`, {
          name: modal.querySelector('#edit-channel-name').value.trim(),
          access_mode: modal.querySelector('#edit-channel-mode').value,
        });
        toast('频道设置已更新', 'success');
        navigate(`/channel/${channelId}`);
      },
    });
  });

  app.querySelectorAll('[data-kick-user]').forEach((button) => {
    button.addEventListener('click', () => {
      showModal({
        title: '移出成员',
        body: `确认将 ${button.dataset.username} 移出频道吗？建议移出后同步刷新邀请码，避免旧邀请码继续流转。`,
        confirmText: '移出',
        danger: true,
        onConfirm: async () => {
          await api.delete(`/api/channels/${channelId}/members`, { user_id: Number(button.dataset.kickUser) });
          toast('成员已移出，建议现在刷新邀请码', 'success');
          navigate(`/channel/${channelId}`);
        },
      });
    });
  });
}

function bindSurveyActions(app, channel, manageableChannels) {
  const grid = app.querySelector('.survey-grid');
  if (!grid) return;

  grid.addEventListener('click', async (event) => {
    const toggle = event.target.closest('[data-more-toggle]');
    if (toggle) {
      const menu = toggle.closest('.dropdown')?.querySelector('.dropdown-menu');
      const willOpen = !menu?.classList.contains('open');
      closeOpenMenus(grid);
      if (willOpen && menu) menu.classList.add('open');
      event.stopPropagation();
      return;
    }

    const button = event.target.closest('[data-action]');
    if (!button) {
      if (!event.target.closest('.dropdown')) closeOpenMenus(grid);
      return;
    }

    closeOpenMenus(grid);

    const action = button.dataset.action;
    const surveyId = Number(button.dataset.id);

    if (action === 'fill') return navigate(`/fill/${surveyId}`);
    if (action === 'results') return navigate(`/results/${surveyId}`);
    if (action === 'edit') return navigate(`/edit/${surveyId}`);
    if (action === 'export') return exportSurvey(surveyId);

    if (action === 'toggle') {
      const nextAction = button.dataset.closed === '1' ? 'reopen' : 'close';
      const label = nextAction === 'close' ? '关闭' : '重新开放';
      showModal({
        title: `${label}问卷`,
        body: `确认要${label}这份问卷吗？`,
        confirmText: label,
        danger: nextAction === 'close',
        onConfirm: async () => {
          await api.patch(`/api/surveys/${surveyId}`, { action: nextAction });
          toast(`已${label}`, 'success');
          navigate(`/channel/${channel.id}`);
        },
      });
      return;
    }

    if (action === 'delete') {
      showModal({
        title: '删除问卷',
        body: '删除后这份问卷会从列表隐藏，确定继续吗？',
        confirmText: '删除',
        danger: true,
        onConfirm: async () => {
          await api.delete(`/api/surveys/${surveyId}`, {});
          toast('问卷已删除', 'success');
          navigate(`/channel/${channel.id}`);
        },
      });
      return;
    }

    if (action === 'move') {
      const targets = manageableChannels.filter((item) => Number(item.id) !== Number(button.dataset.channelId));
      if (!targets.length) {
        toast('没有可移动的其他频道', 'info');
        return;
      }
      showModal({
        title: '移动问卷',
        allowHtml: true,
        body: `
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" for="survey-move-channel">目标频道</label>
            <select id="survey-move-channel" class="form-input">
              ${targets.map((item) => `<option value="${item.id}">${escHtml(item.name)}</option>`).join('')}
            </select>
          </div>`,
        confirmText: '移动',
        onConfirm: async (modal) => {
          const targetChannelId = Number(modal.querySelector('#survey-move-channel').value);
          await api.patch(`/api/surveys/${surveyId}`, {
            action: 'move',
            channel_id: targetChannelId,
          });
          toast('问卷已移动', 'success');
          navigate(`/channel/${targetChannelId}`);
        },
      });
    }
  });

  document.addEventListener('click', handleOutsideClick);

  function handleOutsideClick(event) {
    if (!grid.isConnected) {
      document.removeEventListener('click', handleOutsideClick);
      return;
    }
    if (!event.target.closest('.dropdown')) closeOpenMenus(grid);
  }
}

async function exportSurvey(surveyId) {
  try {
    const data = await api.get(`/api/surveys/${surveyId}?format=export`);
    downloadJsonFile(`${sanitizeFileName(data.title || '问卷')}.json`, data);
    toast('问卷 JSON 已导出', 'success');
  } catch (err) {
    toast(err.message || '导出失败', 'error');
  }
}

function navHtml(user) {
  return `
    <nav class="nav">
      <div class="container nav-inner">
        <a class="nav-logo" href="#/home"><span class="nav-logo-rune">✦</span> 团卷</a>
        <div class="nav-right" style="flex-wrap:wrap;gap:.5rem">
          <span class="nav-user">冒险者 <strong>${escHtml(user.username)}</strong></span>
          <button class="btn btn-ghost btn-sm" id="btn-sample">下载团后复盘模板</button>
          <label class="btn btn-ghost btn-sm" style="cursor:pointer">
            导入 JSON
            <input type="file" id="btn-import" accept=".json" style="display:none">
          </label>
          <button class="btn btn-secondary btn-sm" id="btn-create-survey">发布问卷</button>
          <button class="btn btn-ghost btn-sm" id="btn-create-channel">创建私密频道</button>
          <button class="btn btn-ghost btn-sm" id="btn-logout">退出</button>
        </div>
      </div>
    </nav>`;
}

function sidebarChannelHtml(channel, selectedId) {
  const selected = Number(channel.id) === Number(selectedId);
  const meta = channel.is_public
    ? '公共频道'
    : channel.access_mode === 'members_only'
      ? '仅成员可进'
      : '公开可见 / 成员可填';

  return `
    <button class="card ${selected ? 'survey-card' : ''}" data-channel-nav="${channel.id}"
      style="display:block;width:100%;text-align:left;padding:1rem;margin-bottom:.75rem;${selected ? 'border-color:var(--gold);' : ''}">
      <div style="display:flex;justify-content:space-between;gap:.5rem;align-items:center">
        <strong>${escHtml(channel.name)}</strong>
        <span class="badge ${channel.is_public ? 'badge-open' : 'badge-count'}">${channel.is_public ? '公共' : '私密'}</span>
      </div>
      <div style="font-size:.82rem;color:var(--text-d);margin-top:.45rem">${escHtml(meta)}</div>
      <div style="font-size:.82rem;color:var(--text-d);margin-top:.35rem">${channel.survey_count} 份问卷 · ${channel.member_count || 0} 位成员</div>
    </button>`;
}

function channelHeroHtml(channel) {
  const accessText = channel.is_public
    ? '所有登录用户都可查看和填写'
    : channel.access_mode === 'members_only'
      ? '只有成员可以进入频道内容'
      : '所有登录用户可看，只有成员可以填写';

  return `
    <div class="card">
      <div class="section-header">
        <div>
          <h1 class="section-title">${escHtml(channel.name)}</h1>
          <p style="margin-top:.35rem;color:var(--text-m)">${escHtml(accessText)}</p>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;justify-content:flex-end">
          <span class="badge ${channel.is_public ? 'badge-open' : 'badge-count'}">${channel.is_public ? '公共频道' : '私密频道'}</span>
          ${channel.is_owner ? '<span class="badge badge-open">你是管理员</span>' : ''}
          ${channel.is_member && !channel.is_owner ? '<span class="badge badge-count">已加入</span>' : ''}
          ${!channel.can_fill ? '<span class="badge badge-closed">当前不可填写</span>' : ''}
        </div>
      </div>
      ${channel.owner_name ? `<div style="color:var(--text-d);font-size:.88rem">创建者：${escHtml(channel.owner_name)}</div>` : ''}
    </div>`;
}

function channelAdminHtml(channel, members) {
  if (!channel.is_owner || channel.is_public) return '';

  return `
    <div class="card" data-channel-admin data-channel-name="${escHtml(channel.name)}" data-channel-mode="${channel.access_mode}" style="margin-top:1rem">
      <div class="section-header">
        <h2 class="section-title">频道管理</h2>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" id="btn-edit-channel">编辑频道</button>
          <button class="btn btn-secondary btn-sm" id="btn-regenerate-invite">刷新邀请码</button>
        </div>
      </div>
      <div style="color:var(--text-m);margin-bottom:.9rem">当前邀请码：<strong style="color:var(--gold)">${escHtml(channel.invite_code || '未生成')}</strong></div>
      <div class="section-header" style="margin-bottom:.75rem">
        <h3 class="section-title" style="font-size:1rem">成员</h3>
      </div>
      ${members.length
        ? `
          <div class="response-list">
            ${members.map((member) => `
              <div class="response-item" style="margin-bottom:.6rem">
                <div class="response-header" style="cursor:default">
                  <div>
                    <span class="response-who">${escHtml(member.username)}</span>
                    <span style="color:var(--text-d);font-size:.78rem;margin-left:.75rem">${member.is_owner ? '频道创建者' : '已加入成员'}</span>
                  </div>
                  ${member.is_owner ? '' : `<button class="btn btn-danger btn-sm" data-kick-user="${member.id}" data-username="${escHtml(member.username)}">移出</button>`}
                </div>
              </div>`).join('')}
          </div>`
        : '<div style="color:var(--text-d)">还没有其他成员。</div>'}
    </div>`;
}

function surveyCard(survey, channel, index, manageableChannels) {
  const canMove = survey.can_edit && manageableChannels.length > 1;
  const moreActions = [
    `<button class="dropdown-item" data-action="export" data-id="${survey.id}">导出 JSON</button>`,
    survey.can_edit ? `<button class="dropdown-item" data-action="edit" data-id="${survey.id}">编辑</button>` : '',
    survey.can_edit && canMove ? `<button class="dropdown-item" data-action="move" data-id="${survey.id}" data-channel-id="${channel.id}">移动频道</button>` : '',
    survey.can_edit ? `<button class="dropdown-item" data-action="toggle" data-id="${survey.id}" data-closed="${survey.is_closed ? 1 : 0}">${survey.is_closed ? '重新开放' : '关闭问卷'}</button>` : '',
    survey.can_edit ? `<button class="dropdown-item dropdown-item-danger" data-action="delete" data-id="${survey.id}">删除问卷</button>` : '',
  ].filter(Boolean).join('');

  return `
    <div class="survey-card" style="animation-delay:${index * 0.05}s">
      <h3 class="survey-card-title">${escHtml(survey.title)}</h3>
      ${survey.description ? `<p class="survey-card-desc">${escHtml(survey.description)}</p>` : ''}
      <div class="survey-card-meta">
        <span>${escHtml(survey.creator_name)}</span><span class="dot"></span>
        <span>${fmtDate(survey.created_at)}</span><span class="dot"></span>
        <span class="badge ${survey.is_closed ? 'badge-closed' : 'badge-open'}">${survey.is_closed ? '已关闭' : '开放中'}</span>
        <span class="badge badge-count">${survey.response_count} 份</span>
      </div>
      <div class="survey-card-footer">
        <div class="card-btn-row ${survey.can_view_results || survey.can_fill ? '' : 'card-btn-center'}">
          ${survey.can_fill ? `<button class="btn btn-primary btn-sm" data-action="fill" data-id="${survey.id}">填写问卷</button>` : `<button class="btn btn-ghost btn-sm" disabled>不可填写</button>`}
          ${survey.can_view_results ? `<button class="btn btn-secondary btn-sm" data-action="results" data-id="${survey.id}">查看结果</button>` : ''}
          <div class="dropdown survey-more">
            <button class="btn btn-ghost btn-sm" type="button" data-more-toggle="${survey.id}">更多</button>
            <div class="dropdown-menu">
              ${moreActions}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function closeOpenMenus(root) {
  root.querySelectorAll('.dropdown-menu.open').forEach((menu) => menu.classList.remove('open'));
}

function validateSurveyJson(data) {
  if (!data || typeof data !== 'object') throw new Error('JSON 内容无效');
  if (!String(data.title || '').trim()) throw new Error('缺少问卷标题');
  if (!Array.isArray(data.questions) || !data.questions.length) throw new Error('至少需要一题');
  data.questions.forEach((question) => {
    if (!['single', 'multiple', 'text'].includes(question.type)) throw new Error(`不支持的题型：${question.type}`);
    if (!String(question.content || '').trim()) throw new Error('题目内容不能为空');
  });
}

function sanitizeFileName(input) {
  return String(input || 'survey').replace(/[\\/:*?"<>|]/g, '-');
}

function emptyState(title, desc) {
  return `
    <div class="empty-state">
      <span class="empty-rune">✦</span>
      <div class="empty-title">${escHtml(title)}</div>
      <p class="empty-desc">${escHtml(desc)}</p>
    </div>`;
}

function fmtDate(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function escHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
