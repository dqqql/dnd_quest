import { api, navigate, toast } from '../app.js';

export async function renderResults(app, user, surveyId) {
  app.innerHTML = `${navHtml(user)}<div class="page"><div class="container"><div class="empty-state"><span class="splash-rune">✦</span></div></div></div>`;

  let data;
  try {
    data = await api.get(`/api/surveys/${surveyId}/results`);
  } catch (err) {
    toast(err.message, 'error');
    navigate('/home');
    return;
  }

  const { survey, questions, responses, answers } = data;
  app.querySelector('.page .container').innerHTML = `
    <div class="section-header">
      <div>
        <h1 class="section-title">${escHtml(survey.title)}</h1>
        <p style="color:var(--text-m);font-style:italic;margin-top:.25rem">共 <strong style="color:var(--gold);font-style:normal">${responses.length}</strong> 份回答</p>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="history.back()">返回</button>
    </div>
    <div class="results-tabs">
      <button class="tab-btn active" data-tab="stats">统计汇总</button>
      <button class="tab-btn" data-tab="detail">详细记录</button>
    </div>
    <div class="tab-panel active" id="tab-stats">
      ${questions.length ? statsHtml(questions, answers) : emptyState('暂无数据', '这份问卷还没有题目或回答。')}
    </div>
    <div class="tab-panel" id="tab-detail">
      ${responses.length ? detailHtml(responses, answers, questions) : emptyState('还没有人填写', '等第一份回答出现后，这里会显示完整记录。')}
    </div>`;

  app.querySelectorAll('.tab-btn').forEach((button) => {
    button.addEventListener('click', () => {
      app.querySelectorAll('.tab-btn').forEach((node) => node.classList.remove('active'));
      app.querySelectorAll('.tab-panel').forEach((node) => node.classList.remove('active'));
      button.classList.add('active');
      app.querySelector(`#tab-${button.dataset.tab}`).classList.add('active');
    });
  });

  app.querySelectorAll('.response-header').forEach((header) => {
    header.addEventListener('click', () => {
      const body = header.nextElementSibling;
      body.classList.toggle('open');
      header.querySelector('.toggle-arrow').textContent = body.classList.contains('open') ? '▼' : '▶';
    });
  });
}

function statsHtml(questions, answers) {
  return questions.map((question) => {
    const qAnswers = answers.filter((answer) => Number(answer.question_id) === Number(question.id));
    if (question.type === 'text') {
      const texts = qAnswers.map((answer) => answer.value).filter(Boolean);
      return `
        <div class="stat-block">
          <div class="stat-q">${escHtml(question.content)} <span style="font-size:.7rem;color:var(--text-d)">· 文本题</span></div>
          ${texts.length ? `<div class="text-answers">${texts.map((text) => `<div class="text-ans-item">${escHtml(text)}</div>`).join('')}</div>` : '<div style="color:var(--text-d);font-style:italic;font-size:.9rem">暂无回答</div>'}
        </div>`;
    }

    const counts = {};
    question.options.forEach((option) => { counts[option] = 0; });
    const otherCounts = {};
    qAnswers.forEach((answer) => {
      let values = [];
      try {
        values = JSON.parse(answer.value);
        if (!Array.isArray(values)) values = [answer.value];
      } catch {
        values = [answer.value];
      }
      values.forEach((value) => {
        if (question.options.includes(value)) counts[value] = (counts[value] || 0) + 1;
        else if (value) otherCounts[value] = (otherCounts[value] || 0) + 1;
      });
    });

    const maxCount = Math.max(...Object.values(counts), ...Object.values(otherCounts), 1);
    const rows = [
      ...Object.entries(counts).map(([label, count]) => barRow(label, count, maxCount)),
      ...Object.entries(otherCounts).map(([label, count]) => barRow(`其他：${label}`, count, maxCount, true)),
    ].join('');

    return `
      <div class="stat-block">
        <div class="stat-q">${escHtml(question.content)} <span style="font-size:.7rem;color:var(--text-d)">· ${question.type === 'single' ? '单选' : '多选'}</span></div>
        <div class="stat-bars">${rows}</div>
      </div>`;
  }).join('');
}

function barRow(label, count, maxCount, isOther = false) {
  const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
  return `
    <div class="stat-row">
      <div class="stat-label" style="${isOther ? 'font-style:italic;color:var(--text-d)' : ''}">${escHtml(label)}</div>
      <div class="stat-bar-wrap">
        <div class="stat-bar" style="width:${pct}%"></div>
        <span class="stat-bar-text">${pct}%</span>
      </div>
      <div class="stat-count">${count}</div>
    </div>`;
}

function detailHtml(responses, answers, questions) {
  return `
    <div class="response-list">
      ${responses.map((response) => {
        const rAnswers = answers.filter((answer) => Number(answer.response_id) === Number(response.id));
        return `
          <div class="response-item">
            <div class="response-header">
              <div>
                <span class="response-who">${escHtml(response.user_name)}</span>
                <span style="color:var(--text-d);font-size:.78rem;margin-left:.75rem">${fmtDateTime(response.submitted_at)}</span>
              </div>
              <span class="toggle-arrow" style="color:var(--text-d);font-size:.8rem">▶</span>
            </div>
            <div class="response-body">
              ${questions.map((question) => renderAnswer(question, rAnswers)).join('')}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function renderAnswer(question, answers) {
  const answer = answers.find((item) => Number(item.question_id) === Number(question.id));
  let display = '（未作答）';
  if (answer) {
    if (question.type === 'text') display = escHtml(answer.value);
    else {
      let values = [];
      try {
        values = JSON.parse(answer.value);
        if (!Array.isArray(values)) values = [answer.value];
      } catch {
        values = [answer.value];
      }
      const parts = values.map((value) => escHtml(value));
      if (answer.other_text && !parts.includes(escHtml(answer.other_text))) parts.push(`<em style="color:var(--text-d)">其他：${escHtml(answer.other_text)}</em>`);
      display = parts.join(' / ') || escHtml(answer.value);
    }
  }
  return `
    <div class="resp-answer">
      <div class="resp-q">${escHtml(question.content)}</div>
      <div class="resp-a">${display}</div>
    </div>`;
}

function navHtml(user) {
  return `<nav class="nav"><div class="container nav-inner">
    <a class="nav-logo" href="#/home"><span class="nav-logo-rune">✦</span> 团卷</a>
    <div class="nav-right"><span class="nav-user">冒险者 <strong>${escHtml(user.username)}</strong></span></div>
  </div></nav>`;
}

function emptyState(title, desc) {
  return `
    <div class="empty-state">
      <span class="empty-rune">✦</span>
      <div class="empty-title">${escHtml(title)}</div>
      <p class="empty-desc">${escHtml(desc)}</p>
    </div>`;
}

function fmtDateTime(dt) {
  if (!dt) return '';
  const date = new Date(dt);
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(num) {
  return String(num).padStart(2, '0');
}

function escHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
