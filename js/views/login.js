import { api, navigate, setUser, toast } from '../app.js';

export function renderLogin(app) {
  app.innerHTML = `
    <div class="login-view">
      <div class="login-card anim-up" style="max-width: 520px;">
        <span class="login-rune">✦</span>
        <h1 class="login-title brand">团卷</h1>
        <p class="login-tagline">公共问卷与私密频道协作空间</p>
        <div class="results-tabs" style="margin-top:1.5rem">
          <button class="tab-btn active" data-auth-tab="register">首次注册</button>
          <button class="tab-btn" data-auth-tab="login">已有账号</button>
        </div>
        <div class="tab-panel active" id="auth-register">
          ${authFormHtml('register')}
        </div>
        <div class="tab-panel" id="auth-login">
          ${authFormHtml('login')}
        </div>
      </div>
    </div>`;

  app.querySelectorAll('[data-auth-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      app.querySelectorAll('[data-auth-tab]').forEach((node) => node.classList.remove('active'));
      app.querySelectorAll('.tab-panel').forEach((node) => node.classList.remove('active'));
      btn.classList.add('active');
      app.querySelector(`#auth-${btn.dataset.authTab}`).classList.add('active');
    });
  });

  bindForm(app, 'register', '/api/auth/register');
  bindForm(app, 'login', '/api/auth/login');
}

function authFormHtml(mode) {
  const isRegister = mode === 'register';
  return `
    <form class="auth-form" data-mode="${mode}" style="margin-top:1rem">
      <div class="form-group">
        <label class="form-label" for="${mode}-username">用户名</label>
        <input id="${mode}-username" name="username" class="form-input" type="text"
          placeholder="3-20 位，可用中文/字母/数字/下划线" maxlength="20" autocomplete="username">
      </div>
      <div class="form-group">
        <label class="form-label" for="${mode}-password">密码</label>
        <input id="${mode}-password" name="password" class="form-input" type="password"
          placeholder="至少 8 位" maxlength="72" autocomplete="${isRegister ? 'new-password' : 'current-password'}">
      </div>
      ${isRegister ? `
      <div class="form-group">
        <label class="form-label" for="${mode}-password-confirm">确认密码</label>
        <input id="${mode}-password-confirm" name="password_confirm" class="form-input" type="password"
          placeholder="再次输入密码" maxlength="72" autocomplete="new-password">
      </div>` : ''}
      <button type="submit" class="btn btn-primary btn-block btn-lg">${isRegister ? '注册并进入' : '登录'}</button>
      <p class="login-tip">${isRegister ? '首次进入需要创建账号，注册后会自动保持登录。' : '登录成功后会自动保持登录状态。'}</p>
    </form>`;
}

function bindForm(app, mode, endpoint) {
  const form = app.querySelector(`form[data-mode="${mode}"]`);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const username = String(formData.get('username') || '').trim();
    const password = String(formData.get('password') || '');
    const passwordConfirm = String(formData.get('password_confirm') || '');

    if (!username) {
      toast('请输入用户名', 'error');
      form.querySelector('[name="username"]').focus();
      return;
    }
    if (!password) {
      toast('请输入密码', 'error');
      form.querySelector('[name="password"]').focus();
      return;
    }
    if (mode === 'register' && password !== passwordConfirm) {
      toast('两次密码输入不一致', 'error');
      form.querySelector('[name="password_confirm"]').focus();
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const data = await api.post(endpoint, { username, password });
      setUser(data.user);
      toast(mode === 'register' ? '注册成功，欢迎进入团卷' : '登录成功', 'success');
      navigate('/home');
    } catch (err) {
      toast(err.message || '提交失败', 'error');
      submit.disabled = false;
    }
  });
}
