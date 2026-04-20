import { createSession, validatePassword, validateUsername, verifyPassword } from '../_lib/auth.js';
import { ensurePublicChannel } from '../_lib/channels.js';
import { error, json, methodNotAllowed } from '../_lib/http.js';

export async function onRequest(context) {
  if (context.request.method !== 'POST') return methodNotAllowed();

  try {
    await ensurePublicChannel(context.env);
    const { username, password } = await context.request.json();
    const usernameError = validateUsername(username);
    if (usernameError) return error(usernameError, 400);
    const passwordError = validatePassword(password);
    if (passwordError) return error(passwordError, 400);

    const normalizedUsername = String(username).trim();
    const user = await context.env.DB.prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
      .bind(normalizedUsername)
      .first();
    if (!user) return error('用户名或密码错误', 401);

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return error('用户名或密码错误', 401);

    const session = await createSession(context.env, context.request, user.id);
    return json(
      {
        user: {
          id: user.id,
          username: user.username,
        },
      },
      {
        headers: {
          'Set-Cookie': session.cookie,
        },
      }
    );
  } catch (err) {
    return err instanceof Response ? err : error(err.message || '登录失败', 500);
  }
}
