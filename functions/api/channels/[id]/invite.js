import { requireUser } from '../../_lib/auth.js';
import { ensurePublicChannel, generateInviteCode, requireChannelAdmin } from '../../_lib/channels.js';
import { error, json, methodNotAllowed } from '../../_lib/http.js';

export async function onRequest(context) {
  if (context.request.method !== 'POST') return methodNotAllowed();

  try {
    await ensurePublicChannel(context.env);
    const user = await requireUser(context.request, context.env);
    const channelId = Number(context.params.id);
    const channel = await requireChannelAdmin(context.env, channelId, user.id);
    if (channel.is_public) return error('公共频道没有邀请码', 400);

    const inviteCode = generateInviteCode();
    await context.env.DB.prepare('UPDATE channels SET invite_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(inviteCode, channelId)
      .run();

    return json({ invite_code: inviteCode });
  } catch (err) {
    return err instanceof Response ? err : error(err.message || '刷新邀请码失败', 500);
  }
}
