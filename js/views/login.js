// js/views/login.js
import { api, setUser, navigate, toast } from '../app.js';

export function renderLogin(app) {
  app.innerHTML = `
    <div class="login-view">
      <div class="login-card anim-up">
        <span class="login-rune">⚜</span>
        <h1 class="login-title brand">团 卷</h1>
        <p class="login-tagline">记录每一次冒险的足迹</p>
        <div class="login-divider"></div>
        <div class="form-group">
          <label class="form-label" for="login-name">冒险者名号</label>
          <input id="login-name" class="form-input" type="text"
            placeholder="输入你的名字…" maxlength="20" autocomplete="off" spellcheck="false">
        </div>
        <button id="login-btn" class="btn btn-primary btn-block btn-lg">踏入冒险 ⚔</button>
        <p class="login-tip">名字是你唯一的身份标识，请与下次保持一致</p>
      </div>
    </div>`;

  const input = app.querySelector('#login-name');
  const btn   = app.querySelector('#login-btn');

  input.focus();

  async function doLogin() {
    const name = input.value.trim();
    if (!name) { toast('请输入名字', 'error'); input.focus(); return; }
    btn.disabled = true; btn.textContent = '…';
    try {
      const user = await api.post('/api/users', { name });
      setUser(user);
      navigate('/home');
    } catch (e) {
      toast(e.message || '登录失败', 'error');
      btn.disabled = false; btn.textContent = '踏入冒险 ⚔';
    }
  }

  btn.addEventListener('click', doLogin);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}
