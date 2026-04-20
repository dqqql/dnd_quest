import { api, navigate, toast } from '../app.js';

export async function renderFill(app, user, surveyId) {
  app.innerHTML = `${navHtml(user)}<div class="page"><div class="container"><div class="empty-state"><span class="splash-rune">✦</span></div></div></div>`;

  let survey;
  try {
    survey = await api.get(`/api/surveys/${surveyId}`);
  } catch (err) {
    toast(err.message, 'error');
    navigate('/home');
    return;
  }

  if (!survey.can_fill) {
    app.querySelector('.page .container').innerHTML = emptyState(
      survey.is_closed ? '问卷已关闭' : '当前无填写权限',
      survey.is_closed ? '这份问卷暂时不再接收新回答。' : '这份问卷所在频道需要成员资格后才能填写。'
    );
    return;
  }

  const answers = {};
  app.querySelector('.page .container').innerHTML = `
    <div class="section-header">
      <div>
        <h1 class="section-title">${escHtml(survey.title)}</h1>
        ${survey.description ? `<p style="color:var(--text-m);margin-top:.3rem;font-style:italic">${escHtml(survey.description)}</p>` : ''}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="history.back()">返回</button>
    </div>
    <div class="questions-wrap" id="questions-wrap">
      ${survey.questions.map((question, index) => questionHtml(question, index)).join('')}
    </div>
    <div class="submit-area">
      <button id="submit-btn" class="btn btn-primary btn-lg">提交问卷</button>
    </div>`;

  const wrap = app.querySelector('#questions-wrap');

  wrap.querySelectorAll('.option-item[data-qid][data-radio]').forEach((item) => {
    item.addEventListener('click', () => {
      const qid = item.dataset.qid;
      wrap.querySelectorAll(`.option-item[data-qid="${qid}"][data-radio]`).forEach((node) => node.classList.remove('sel'));
      item.classList.add('sel');
      answers[qid] = { value: item.dataset.val };
      getQBlock(wrap, qid).classList.remove('error');
    });
  });

  wrap.querySelectorAll('.option-item[data-qid][data-check]').forEach((item) => {
    item.addEventListener('click', () => {
      item.classList.toggle('sel');
      const check = item.querySelector('.opt-check');
      if (check) check.textContent = item.classList.contains('sel') ? '✓' : '';
      syncMultiple(wrap, answers, item.dataset.qid);
      getQBlock(wrap, item.dataset.qid).classList.remove('error');
    });
  });

  wrap.querySelectorAll('.other-input').forEach((input) => {
    input.addEventListener('input', () => syncMultiple(wrap, answers, input.dataset.qid));
  });

  wrap.querySelectorAll('.text-answer').forEach((textarea) => {
    textarea.addEventListener('input', () => {
      answers[textarea.dataset.qid] = { value: textarea.value.trim() };
    });
  });

  app.querySelector('#submit-btn').addEventListener('click', async () => {
    let valid = true;
    survey.questions.forEach((question) => {
      const block = getQBlock(wrap, question.id);
      if (question.type === 'text') {
        const textarea = wrap.querySelector(`.text-answer[data-qid="${question.id}"]`);
        answers[question.id] = { value: textarea ? textarea.value.trim() : '' };
      }
      if (!answers[question.id] || answers[question.id].value === '' || answers[question.id].value === '[]') {
        block.classList.add('error');
        valid = false;
      }
    });
    if (!valid) {
      toast('请完成所有题目', 'error');
      wrap.querySelector('.error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const submitBtn = app.querySelector('#submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '提交中...';
    try {
      const payload = survey.questions.map((question) => ({
        question_id: question.id,
        value: answers[question.id]?.value || '',
        other_text: answers[question.id]?.other_text || null,
      }));
      await api.post(`/api/surveys/${surveyId}/responses`, { answers: payload });
      app.querySelector('.page .container').innerHTML = emptyState('感谢参与', '你的回答已经记录完成。');
      app.querySelector('.empty-state').insertAdjacentHTML('beforeend', '<br><button class="btn btn-secondary" id="back-home">返回频道</button>');
      app.querySelector('#back-home').onclick = () => navigate(`/channel/${survey.channel_id}`);
    } catch (err) {
      toast(err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = '提交问卷';
    }
  });
}

function questionHtml(question, index) {
  let body = '';
  if (question.type === 'single') {
    body = `<div class="option-list">${question.options.map((opt) => `
      <div class="option-item" data-qid="${question.id}" data-radio data-val="${escHtml(opt)}">
        <span class="opt-indicator"></span>
        <span class="opt-label">${escHtml(opt)}</span>
      </div>`).join('')}</div>`;
  } else if (question.type === 'multiple') {
    body = `<div class="option-list">${question.options.map((opt) => `
      <div class="option-item" data-qid="${question.id}" data-check data-val="${escHtml(opt)}">
        <span class="opt-check"></span>
        <span class="opt-label">${escHtml(opt)}</span>
      </div>`).join('')}
      ${question.has_other ? `
        <div class="option-item" data-qid="${question.id}" data-check data-val="__other__">
          <span class="opt-check"></span>
          <span class="opt-label" style="color:var(--text-m);font-style:italic">其他</span>
        </div>
        <div class="other-wrap" id="other-wrap-${question.id}" style="display:none">
          <input class="form-input other-input" data-qid="${question.id}" type="text" placeholder="请输入补充内容">
        </div>` : ''}
    </div>`;
  } else {
    body = `<textarea class="form-textarea text-answer" data-qid="${question.id}" placeholder="请输入你的回答" rows="3"></textarea>`;
  }

  const typeLabel = { single: '单选', multiple: '多选', text: '文本' }[question.type];
  return `
    <div class="q-block" data-block-qid="${question.id}" style="animation-delay:${index * 0.07}s">
      <div class="q-header">
        <div class="q-num">第 ${index + 1} 题</div>
        <div class="q-content">${escHtml(question.content)}<span class="q-type-tag">${typeLabel}</span></div>
      </div>
      ${body}
    </div>`;
}

function syncMultiple(wrap, answers, qid) {
  const selected = [...wrap.querySelectorAll(`.option-item.sel[data-qid="${qid}"][data-check]`)].map((node) => node.dataset.val);
  const otherSelected = selected.includes('__other__');
  const otherWrap = wrap.querySelector(`#other-wrap-${qid}`);
  if (otherWrap) otherWrap.style.display = otherSelected ? 'block' : 'none';
  const otherText = otherSelected ? (wrap.querySelector(`.other-input[data-qid="${qid}"]`)?.value.trim() || '') : null;
  const values = selected.filter((value) => value !== '__other__');
  if (otherSelected && otherText) values.push(otherText);
  answers[qid] = { value: JSON.stringify(values), other_text: otherText };
}

function getQBlock(wrap, qid) {
  return wrap.querySelector(`[data-block-qid="${qid}"]`);
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

function escHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
