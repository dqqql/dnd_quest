import { error, methodNotAllowed } from './_lib/http.js';

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return methodNotAllowed();
  return error('该接口已停用，请使用 /api/auth/register 和 /api/auth/login', 410);
}
