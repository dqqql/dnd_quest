// js/views/fill.js
import { api, navigate, toast } from '../app.js';

export async function renderFill(app, user, surveyId) {
  app.innerHTML = navHtml(user) + `<div class="page"><div class="container"><div class="empty-state"><span class="splash-rune">⚜</span></div></div></div>`;

  let survey;
  try {
    survey = await api.get(`/api/surveys/${surveyId}`);
  } catch (e) {
    toast(e.message, 'error'); navigate('/home'); return;
  }

  if (survey.is_closed) {
    app.querySelector('.page .container').innerHTML = `
      <div class="empty-state">
        <span class="empty-rune">🔒</span>
        <div class="empty-title">问卷已关闭</div>
        <p class="empty-desc">此问卷暂停接受填写</p>
        <br><button class="btn btn-ghost" onclick="navigate('#/home')">返回首页</button>
      </div>`;
    return;
  }

  const answers = {}; // question_id → { value, other_text }

  app.querySelector('.page .container').innerHTML = `
    <div class="section-header">
      <div>
        <h1 class="section-title">${escHtml(survey.title)}</h1>
        ${survey.description ? `<p style="color:var(--text-m);margin-top:.3rem;font-style:italic">${escHtml(survey.description)}</p>` : ''}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="history.back()">← 返回</button>
    </div>
    <div class="questions-wrap" id="questions-wrap">
      ${survey.questions.map((q, i) => questionHtml(q, i)).join('')}
    </div>
    <div class="submit-area">
      <button id="submit-btn" class="btn btn-primary btn-lg">提交问卷 ✦</button>
    </div>`;

  const wrap = app.querySelector('#questions-wrap');

  // Single choice
  wrap.querySelectorAll('.option-item[data-qid][data-radio]').forEach(item => {
    item.addEventListener('click', () => {
      const qid = item.dataset.qid;
      wrap.querySelectorAll(`.option-item[data-qid="${qid}"][data-radio]`).forEach(x => x.classList.remove('sel'));
      item.classList.add('sel');
      answers[qid] = { value: item.dataset.val };
      getQBlock(wrap, qid).classList.remove('error');
    });
  });

  // Multiple choice
  wrap.querySelectorAll('.option-item[data-qid][data-check]').forEach(item => {
    item.addEventListener('click', () => {
      item.classList.toggle('sel');
      const chk = item.querySelector('.opt-check');
      if (chk) chk.textContent = item.classList.contains('sel') ? '✓' : '';
      syncMultiple(wrap, answers, item.dataset.qid);
      getQBlock(wrap, item.dataset.qid).classList.remove('error');
    });
  });

  // Other text inputs
  wrap.querySelectorAll('.other-input').forEach(inp => {
    inp.addEventListener('input', () => syncMultiple(wrap, answers, inp.dataset.qid));
  });

  // Text answers
  wrap.querySelectorAll('.text-answer').forEach(ta => {
    ta.addEventListener('input', () => {
      answers[ta.dataset.qid] = { value: ta.value.trim() };
    });
  });

  app.querySelector('#submit-btn').addEventListener('click', async () => {
    let valid = true;
    survey.questions.forEach(q => {
      const block = getQBlock(wrap, q.id);
      const ans = answers[q.id];
      if (q.type === 'text') {
        const ta = wrap.querySelector(`.text-answer[data-qid="${q.id}"]`);
        answers[q.id] = { value: ta ? ta.value.trim() : '' };
      }
      if (!answers[q.id] || answers[q.id].value === '' || answers[q.id].value === '[]') {
        block.classList.add('error'); valid = false;
      }
    });
    if (!valid) { toast('请完成所有题目', 'error'); wrap.querySelector('.error').scrollIntoView({ behavior:'smooth', block:'center' }); return; }

    const submitBtn = app.querySelector('#submit-btn');
    submitBtn.disabled = true; submitBtn.textContent = '提交中…';
    try {
      const payload = survey.questions.map(q => ({
        question_id: q.id,
        value: answers[q.id]?.value || '',
        other_text: answers[q.id]?.other_text || null
      }));
      await api.post(`/api/surveys/${surveyId}/responses`, { user_id: user.id, answers: payload });
      app.querySelector('.page .container').innerHTML = `
        <div class="empty-state" style="padding:6rem 1rem">
          <span class="empty-rune" style="font-size:3.5rem;opacity:0.9">✦</span>
          <div class="empty-title" style="font-size:1.3rem;color:var(--gold)">感谢参与！</div>
          <p class="empty-desc" style="margin-top:.5rem">你的回答已记录在案</p>
          <br><button class="btn btn-secondary" id="back-home">返回首页</button>
        </div>`;
      app.querySelector('#back-home').onclick = () => navigate('/home');
    } catch (e) {
      toast(e.message, 'error');
      submitBtn.disabled = false; submitBtn.textContent = '提交问卷 ✦';
    }
  });
}

function questionHtml(q, i) {
  let body = '';
  if (q.type === 'single') {
    body = `<div class="option-list">${q.options.map(opt => `
      <div class="option-item" data-qid="${q.id}" data-radio data-val="${escHtml(opt)}">
        <span class="opt-indicator"></span>
        <span class="opt-label">${escHtml(opt)}</span>
      </div>`).join('')}</div>`;
  } else if (q.type === 'multiple') {
    body = `<div class="option-list">${q.options.map(opt => `
      <div class="option-item" data-qid="${q.id}" data-check data-val="${escHtml(opt)}">
        <span class="opt-check"></span>
        <span class="opt-label">${escHtml(opt)}</span>
      </div>`).join('')}
      ${q.has_other ? `
      <div class="option-item" data-qid="${q.id}" data-check data-val="__other__">
        <span class="opt-check"></span>
        <span class="opt-label" style="color:var(--text-m);font-style:italic">其他…</span>
      </div>
      <div class="other-wrap" id="other-wrap-${q.id}" style="display:none">
        <input class="form-input other-input" data-qid="${q.id}" type="text" placeholder="请填写你的想法…">
      </div>` : ''}
    </div>`;
  } else {
    body = `<textarea class="form-textarea text-answer" data-qid="${q.id}" placeholder="请输入你的回答…" rows="3"></textarea>`;
  }

  const typeLabel = { single: '单选', multiple: '多选', text: '主观' }[q.type];
  return `
    <div class="q-block" data-block-qid="${q.id}" style="animation-delay:${i * 0.07}s">
      <div class="q-header">
        <div class="q-num">第 ${i + 1} 题</div>
        <div class="q-content">${escHtml(q.content)}<span class="q-type-tag">${typeLabel}</span></div>
      </div>
      ${body}
    </div>`;
}

function syncMultiple(wrap, answers, qid) {
  const selected = [...wrap.querySelectorAll(`.option-item.sel[data-qid="${qid}"][data-check]`)]
    .map(x => x.dataset.val);
  const otherSelected = selected.includes('__other__');
  const otherWrap = wrap.querySelector(`#other-wrap-${qid}`);
  if (otherWrap) otherWrap.style.display = otherSelected ? 'block' : 'none';
  const otherText = otherSelected ? (wrap.querySelector(`.other-input[data-qid="${qid}"]`)?.value.trim() || '') : null;
  const vals = selected.filter(v => v !== '__other__');
  if (otherSelected && otherText) vals.push(otherText);
  answers[qid] = { value: JSON.stringify(vals), other_text: otherText };
}

function getQBlock(wrap, qid) {
  return wrap.querySelector(`[data-block-qid="${qid}"]`);
}

function navHtml(user) {
  return `<nav class="nav"><div class="container nav-inner">
    <a class="nav-logo" href="#/home"><span class="nav-logo-rune">⚜</span> 团卷</a>
    <div class="nav-right"><span class="nav-user">冒险者 <strong>${escHtml(user.name)}</strong></span></div>
  </div></nav>`;
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
