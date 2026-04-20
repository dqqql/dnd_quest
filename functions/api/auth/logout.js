import { deleteSession } from '../_lib/auth.js';
import { error, json, methodNotAllowed } from '../_lib/http.js';

export async function onRequest(context) {
  if (context.request.method !== 'POST') return methodNotAllowed();

  try {
    const cookie = await deleteSession(context.env, context.request);
    return json(
      { success: true },
      {
        headers: {
          'Set-Cookie': cookie,
        },
      }
    );
  } catch (err) {
    return error(err.message || '退出失败', 500);
  }
}
