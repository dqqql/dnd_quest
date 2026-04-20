import { toast } from '../app.js';

let qCounter = 0;

export function buildSurveyEditor(wrap, survey = null) {
  qCounter = 0;
  wrap.innerHTML = `
    <div class="card" style="margin-bottom:1.25rem">
      <div class="form-group">
        <label class="form-label" for="s-title">问卷标题 *</label>
        <input id="s-title" class="form-input" type="text" placeholder="给这份问卷起个名字" maxlength="80"
          value="${escHtml(survey?.title || '')}">
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label" for="s-desc">说明（可选）</label>
        <textarea id="s-desc" class="form-textarea" placeholder="补充填写说明、使用背景或提醒" rows="2">${escHtml(survey?.description || '')}</textarea>
      </div>
    </div>
    <div class="builder-questions" id="builder-questions"></div>
    <div class="add-q-btn" id="add-q-btn">+ 添加题目</div>`;

  const questionWrap = wrap.querySelector('#builder-questions');
  wrap.querySelector('#add-q-btn').addEventListener('click', () => addQuestion(questionWrap));

  if (survey?.questions?.length) survey.questions.forEach((question) => addQuestion(questionWrap, question));
  else addQuestion(questionWrap);
}

export function collectSurveyData(wrap) {
  const title = wrap.querySelector('#s-title').value.trim();
  if (!title) {
    toast('请填写问卷标题', 'error');
    wrap.querySelector('#s-title').focus();
    return null;
  }

  const description = wrap.querySelector('#s-desc').value.trim();
  const items = wrap.querySelectorAll('.qb-item');
  if (!items.length) {
    toast('至少添加一道题目', 'error');
    return null;
  }

  const questions = [];
  for (const item of items) {
    const type = item.dataset.type;
    const content = item.querySelector('.qb-content').value.trim();
    if (!content) {
      toast('有题目内容为空，请补充完整', 'error');
      item.querySelector('.qb-content').focus();
      return null;
    }

    let options = null;
    let has_other = false;
    if (type === 'single' || type === 'multiple') {
      const inputs = [...item.querySelectorAll('.opt-input')].map((input) => input.value.trim()).filter(Boolean);
      if (inputs.length < 2) {
        toast('单选题和多选题至少需要两个选项', 'error');
        return null;
      }
      options = inputs;
      has_other = item.querySelector('.has-other-toggle')?.classList.contains('on') || false;
    }

    questions.push({ type, content, options, has_other });
  }

  return { title, description, questions };
}

function addQuestion(container, preset = null) {
  qCounter += 1;
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
        <button class="type-btn${type === 'single' ? ' active' : ''}" data-t="single">单选</button>
        <button class="type-btn${type === 'multiple' ? ' active' : ''}" data-t="multiple">多选</button>
        <button class="type-btn${type === 'text' ? ' active' : ''}" data-t="text">文本</button>
      </div>
      <button class="qb-remove" title="删除这道题">✕</button>
    </div>
    <div class="form-group" style="margin-bottom:.75rem">
      <input class="form-input qb-content" type="text" placeholder="题目内容" value="${escHtml(preset?.content || '')}">
    </div>
    <div class="qb-options-wrap"></div>`;

  container.appendChild(div);

  div.querySelectorAll('.type-btn').forEach((button) => {
    button.addEventListener('click', () => {
      div.querySelectorAll('.type-btn').forEach((node) => node.classList.remove('active'));
      button.classList.add('active');
      div.dataset.type = button.dataset.t;
      renderOptions(div, button.dataset.t);
    });
  });

  div.querySelector('.qb-remove').addEventListener('click', () => {
    div.remove();
    renumberQuestions(container);
  });

  renderOptions(div, type, preset?.options, preset?.has_other);
}

function renderOptions(div, type, presetOptions = null, presetHasOther = false) {
  const wrap = div.querySelector('.qb-options-wrap');
  if (type === 'text') {
    wrap.innerHTML = '';
    return;
  }

  const options = presetOptions?.length ? presetOptions : ['', ''];
  wrap.innerHTML = `
    <div class="options-builder" id="ob-${div.dataset.qid}">
      ${options.map((option) => optionRowHtml(option)).join('')}
    </div>
    <div style="display:flex;align-items:center;gap:1rem;margin-top:.5rem;flex-wrap:wrap">
      <button class="add-option-btn">+ 添加选项</button>
      ${type === 'multiple' ? `
        <div class="has-other-toggle${presetHasOther ? ' on' : ''}" title="允许填写其他补充内容">
          <div class="toggle-box"></div>
          <span>包含“其他”选项</span>
        </div>` : ''}
    </div>`;

  const optionsBuilder = wrap.querySelector(`#ob-${div.dataset.qid}`);
  wrap.querySelector('.add-option-btn').addEventListener('click', () => {
    optionsBuilder.insertAdjacentHTML('beforeend', optionRowHtml(''));
    bindOptionDelete(optionsBuilder);
    optionsBuilder.lastElementChild.querySelector('.opt-input').focus();
  });

  if (type === 'multiple') {
    wrap.querySelector('.has-other-toggle')?.addEventListener('click', () => {
      wrap.querySelector('.has-other-toggle').classList.toggle('on');
    });
  }

  bindOptionDelete(optionsBuilder);
}

function optionRowHtml(value = '') {
  return `
    <div class="opt-row">
      <input class="form-input opt-input" type="text" placeholder="选项内容" value="${escHtml(value)}">
      <button class="opt-del" title="删除选项">✕</button>
    </div>`;
}

function bindOptionDelete(optionsBuilder) {
  optionsBuilder.querySelectorAll('.opt-del').forEach((button) => {
    button.onclick = () => {
      if (optionsBuilder.querySelectorAll('.opt-row').length <= 2) {
        toast('至少保留两个选项', 'info');
        return;
      }
      button.closest('.opt-row').remove();
    };
  });
}

function renumberQuestions(container) {
  container.querySelectorAll('.qb-num').forEach((el, index) => {
    el.textContent = `# ${index + 1}`;
  });
}

function escHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
