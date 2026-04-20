import { createSession, hashPassword, validatePassword, validateUsername } from '../_lib/auth.js';
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
    const existing = await context.env.DB.prepare('SELECT id FROM users WHERE username = ?')
      .bind(normalizedUsername)
      .first();
    if (existing) return error('用户名已存在', 409);

    const passwordHash = await hashPassword(password);
    const result = await context.env.DB.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
      .bind(normalizedUsername, passwordHash)
      .run();

    const session = await createSession(context.env, context.request, result.meta.last_row_id);
    return json(
      {
        user: {
          id: result.meta.last_row_id,
          username: normalizedUsername,
        },
      },
      {
        status: 201,
        headers: {
          'Set-Cookie': session.cookie,
        },
      }
    );
  } catch (err) {
    return err instanceof Response ? err : error(err.message || '注册失败', 500);
  }
}
