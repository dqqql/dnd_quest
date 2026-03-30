// js/views/results.js — 查看问卷结果（仅创建者）
import { api, navigate, toast } from '../app.js';

export async function renderResults(app, user, surveyId) {
  app.innerHTML = navHtml(user) + `<div class="page"><div class="container"><div class="empty-state"><span class="splash-rune">⚜</span></div></div></div>`;

  let data;
  try {
    data = await api.get(`/api/surveys/${surveyId}/results?user_id=${user.id}`);
  } catch (e) {
    toast(e.message, 'error'); navigate('/home'); return;
  }

  const { survey, questions, responses, answers } = data;

  app.querySelector('.page .container').innerHTML = `
    <div class="section-header">
      <div>
        <h1 class="section-title">${escHtml(survey.title)}</h1>
        <p style="color:var(--text-m);font-style:italic;margin-top:.25rem">
          共 <strong style="color:var(--gold);font-style:normal">${responses.length}</strong> 份回答
        </p>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="history.back()">← 返回</button>
    </div>

    <div class="results-tabs">
      <button class="tab-btn active" data-tab="stats">📊 统计汇总</button>
      <button class="tab-btn" data-tab="detail">📋 明细记录</button>
    </div>

    <div class="tab-panel active" id="tab-stats">
      ${questions.length ? statsHtml(questions, answers, responses.length) : '<div class="empty-state"><span class="empty-rune">📭</span><div class="empty-title">暂无数据</div></div>'}
    </div>

    <div class="tab-panel" id="tab-detail">
      ${responses.length ? detailHtml(responses, answers, questions) : '<div class="empty-state"><span class="empty-rune">📭</span><div class="empty-title">还没有人填写</div></div>'}
    </div>`;

  // Tab switching
  app.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      app.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      app.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      app.querySelector(`#tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  // Collapsible response items
  app.querySelectorAll('.response-header').forEach(h => {
    h.addEventListener('click', () => {
      const body = h.nextElementSibling;
      body.classList.toggle('open');
      h.querySelector('.toggle-arrow').textContent = body.classList.contains('open') ? '▲' : '▼';
    });
  });
}

// ── Stats tab ─────────────────────────────────────────────
function statsHtml(questions, answers, totalResponses) {
  return questions.map(q => {
    const qAnswers = answers.filter(a => a.question_id === q.id);
    if (q.type === 'text') {
      const texts = qAnswers.map(a => a.value).filter(Boolean);
      return `<div class="stat-block">
        <div class="stat-q">${escHtml(q.content)} <span style="font-size:.7rem;color:var(--text-d);font-family:'Cinzel',serif;text-transform:uppercase;letter-spacing:.08em">· 主观题</span></div>
        ${texts.length ? `<div class="text-answers">${texts.map(t => `<div class="text-ans-item">${escHtml(t)}</div>`).join('')}</div>`
          : '<div style="color:var(--text-d);font-style:italic;font-size:.9rem">暂无回答</div>'}
      </div>`;
    }

    // Count votes per option
    const counts = {};
    q.options.forEach(o => { counts[o] = 0; });
    let otherCounts = {};
    qAnswers.forEach(a => {
      let vals = [];
      try { vals = JSON.parse(a.value); if (!Array.isArray(vals)) vals = [a.value]; }
      catch { vals = [a.value]; }
      vals.forEach(v => {
        if (q.options.includes(v)) counts[v] = (counts[v] || 0) + 1;
        else if (v) otherCounts[v] = (otherCounts[v] || 0) + 1;
      });
    });
    const maxCount = Math.max(...Object.values(counts), ...Object.values(otherCounts), 1);
    const typeLabel = q.type === 'single' ? '单选' : '多选';

    const barRows = Object.entries(counts).map(([label, cnt]) => barRow(label, cnt, maxCount)).join('');
    const otherRows = Object.entries(otherCounts).map(([label, cnt]) =>
      barRow(`其他: ${label}`, cnt, maxCount, true)).join('');

    return `<div class="stat-block">
      <div class="stat-q">${escHtml(q.content)} <span style="font-size:.7rem;color:var(--text-d);font-family:'Cinzel',serif;text-transform:uppercase;letter-spacing:.08em">· ${typeLabel}</span></div>
      <div class="stat-bars">${barRows}${otherRows}</div>
    </div>`;
  }).join('');
}

function barRow(label, cnt, max, isOther = false) {
  const pct = max > 0 ? Math.round((cnt / max) * 100) : 0;
  return `<div class="stat-row">
    <div class="stat-label" style="${isOther?'font-style:italic;color:var(--text-d)':''}">${escHtml(label)}</div>
    <div class="stat-bar-wrap">
      <div class="stat-bar" style="width:${pct}%"></div>
      <span class="stat-bar-text">${pct}%</span>
    </div>
    <div class="stat-count">${cnt}</div>
  </div>`;
}

// ── Detail tab ────────────────────────────────────────────
function detailHtml(responses, answers, questions) {
  return `<div class="response-list">${responses.map((r, i) => {
    const rAnswers = answers.filter(a => a.response_id === r.id);
    return `
      <div class="response-item">
        <div class="response-header">
          <div>
            <span class="response-who">${escHtml(r.user_name)}</span>
            <span style="color:var(--text-d);font-size:.78rem;margin-left:.75rem">${fmtDt(r.submitted_at)}</span>
          </div>
          <span class="toggle-arrow" style="color:var(--text-d);font-size:.8rem">▼</span>
        </div>
        <div class="response-body">
          ${questions.map(q => {
            const ans = rAnswers.find(a => a.question_id === q.id);
            let displayVal = '（未作答）';
            if (ans) {
              if (q.type === 'text') displayVal = escHtml(ans.value);
              else {
                let vals = [];
                try { vals = JSON.parse(ans.value); if (!Array.isArray(vals)) vals = [ans.value]; }
                catch { vals = [ans.value]; }
                const parts = [];
                const knownVals = Array.isArray(vals) ? vals : [ans.value];
                parts.push(...knownVals.filter(v => q.options.includes(v)).map(escHtml));
                if (ans.other_text) parts.push(`<em style="color:var(--text-d)">其他: ${escHtml(ans.other_text)}</em>`);
                displayVal = parts.join(' / ') || escHtml(ans.value);
              }
            }
            return `<div class="resp-answer">
              <div class="resp-q">${escHtml(q.content)}</div>
              <div class="resp-a">${displayVal}</div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('')}</div>`;
}

function fmtDt(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pad(n) { return String(n).padStart(2,'0'); }
function navHtml(user) {
  return `<nav class="nav"><div class="container nav-inner">
    <a class="nav-logo" href="#/home"><span class="nav-logo-rune">⚜</span> 团卷</a>
    <div class="nav-right"><span class="nav-user">冒险者 <strong>${escHtml(user.name)}</strong></span></div>
  </div></nav>`;
}
function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
