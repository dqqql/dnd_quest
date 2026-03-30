// js/views/surveyEditor.js — 问卷编辑器（创建/编辑共用）
import { toast } from '../app.js';

let qCounter = 0;

// ── Build the editor HTML and attach events ──────────────
export function buildSurveyEditor(wrap, survey = null) {
  qCounter = 0;
  wrap.innerHTML = `
    <div class="card" style="margin-bottom:1.25rem">
      <div class="form-group">
        <label class="form-label" for="s-title">问卷标题 *</label>
        <input id="s-title" class="form-input" type="text" placeholder="为本次问卷起个名字…" maxlength="80"
          value="${escHtml(survey?.title || '')}">
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label" for="s-desc">说明（可选）</label>
        <textarea id="s-desc" class="form-textarea" placeholder="背景说明、填写须知…" rows="2">${escHtml(survey?.description || '')}</textarea>
      </div>
    </div>
    <div class="builder-questions" id="builder-questions"></div>
    <div class="add-q-btn" id="add-q-btn">＋ 添加题目</div>`;

  const bq = wrap.querySelector('#builder-questions');
  wrap.querySelector('#add-q-btn').addEventListener('click', () => addQuestion(bq));

  // Pre-fill existing questions
  if (survey?.questions?.length) {
    survey.questions.forEach(q => addQuestion(bq, q));
  } else {
    addQuestion(bq); // start with one blank
  }
}

// ── Collect & validate data ───────────────────────────────
export function collectSurveyData(wrap) {
  const title = wrap.querySelector('#s-title').value.trim();
  if (!title) { toast('请填写问卷标题', 'error'); wrap.querySelector('#s-title').focus(); return null; }

  const description = wrap.querySelector('#s-desc').value.trim();
  const items = wrap.querySelectorAll('.qb-item');
  if (!items.length) { toast('请至少添加一道题目', 'error'); return null; }

  const questions = [];
  for (const item of items) {
    const type = item.dataset.type;
    const content = item.querySelector('.qb-content').value.trim();
    if (!content) { toast('有题目内容为空，请填写', 'error'); item.querySelector('.qb-content').focus(); return null; }

    let options = null;
    let has_other = false;
    if (type === 'single' || type === 'multiple') {
      const inputs = [...item.querySelectorAll('.opt-input')].map(i => i.value.trim()).filter(Boolean);
      if (inputs.length < 2) { toast('单选/多选题至少需要两个选项', 'error'); return null; }
      options = inputs;
      has_other = item.querySelector('.has-other-toggle')?.classList.contains('on') || false;
    }
    questions.push({ type, content, options, has_other });
  }
  return { title, description, questions };
}

// ── Add a question card ───────────────────────────────────
function addQuestion(container, preset = null) {
  qCounter++;
  const id = `q-${qCounter}`;
  const type = preset?.type || 'single';

  const div = document.createElement('div');
  div.className = 'qb-item';
  div.dataset.type = type;
  div.dataset.qid = id;
  div.innerHTML = `
    <div class="qb-header">
      <span class="qb-num"># ${container.children.length + 1}</span>
      <div class="type-btns">
        <button class="type-btn${type==='single'?' active':''}"   data-t="single">单选</button>
        <button class="type-btn${type==='multiple'?' active':''}" data-t="multiple">多选</button>
        <button class="type-btn${type==='text'?' active':''}"     data-t="text">主观</button>
      </div>
      <button class="qb-remove" title="删除此题">✕</button>
    </div>
    <div class="form-group" style="margin-bottom:.75rem">
      <input class="form-input qb-content" type="text"
        placeholder="题目内容…" value="${escHtml(preset?.content || '')}">
    </div>
    <div class="qb-options-wrap"></div>`;

  container.appendChild(div);

  // Type buttons
  div.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      div.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      div.dataset.type = btn.dataset.t;
      renderOptions(div, btn.dataset.t);
    });
  });

  // Remove
  div.querySelector('.qb-remove').addEventListener('click', () => {
    div.remove();
    renumberQuestions(container);
  });

  renderOptions(div, type, preset?.options, preset?.has_other);
}

// ── Render option inputs based on type ───────────────────
function renderOptions(div, type, presetOpts = null, presetHasOther = false) {
  const wrap = div.querySelector('.qb-options-wrap');
  if (type === 'text') { wrap.innerHTML = ''; return; }

  const opts = presetOpts?.length ? presetOpts : ['', ''];
  wrap.innerHTML = `
    <div class="options-builder" id="ob-${div.dataset.qid}">
      ${opts.map(o => optRowHtml(o)).join('')}
    </div>
    <div style="display:flex;align-items:center;gap:1rem;margin-top:.5rem;flex-wrap:wrap">
      <button class="add-option-btn">＋ 添加选项</button>
      ${type === 'multiple' ? `
        <div class="has-other-toggle${presetHasOther?' on':''}" title="添加"其他"自由填写项">
          <div class="toggle-box"></div>
          <span>包含"其他"选项</span>
        </div>` : ''}
    </div>`;

  const ob = wrap.querySelector(`#ob-${div.dataset.qid}`);

  wrap.querySelector('.add-option-btn').addEventListener('click', () => {
    ob.insertAdjacentHTML('beforeend', optRowHtml(''));
    bindOptDel(ob);
    ob.lastElementChild.querySelector('.opt-input').focus();
  });

  if (type === 'multiple') {
    const toggle = wrap.querySelector('.has-other-toggle');
    toggle?.addEventListener('click', () => toggle.classList.toggle('on'));
  }

  bindOptDel(ob);
}

function optRowHtml(value = '') {
  return `<div class="opt-row">
    <input class="form-input opt-input" type="text" placeholder="选项内容…" value="${escHtml(value)}">
    <button class="opt-del" title="删除">✕</button>
  </div>`;
}

function bindOptDel(ob) {
  ob.querySelectorAll('.opt-del').forEach(btn => {
    btn.onclick = () => {
      if (ob.querySelectorAll('.opt-row').length > 2) btn.closest('.opt-row').remove();
      else toast('至少保留两个选项', 'info');
    };
  });
}

function renumberQuestions(container) {
  container.querySelectorAll('.qb-num').forEach((el, i) => { el.textContent = `# ${i + 1}`; });
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
