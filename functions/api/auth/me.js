import { getUserFromSession } from '../_lib/auth.js';
import { ensurePublicChannel } from '../_lib/channels.js';
import { error, json, methodNotAllowed } from '../_lib/http.js';

export async function onRequest(context) {
  if (context.request.method !== 'GET') return methodNotAllowed();

  try {
    await ensurePublicChannel(context.env);
    const user = await getUserFromSession(context.request, context.env);
    return json({ user });
  } catch (err) {
    return error(err.message || '获取登录状态失败', 500);
  }
}
