import { requireUser } from '../../_lib/auth.js';
import { ensurePublicChannel, getChannelForUser } from '../../_lib/channels.js';
import { error, json, methodNotAllowed } from '../../_lib/http.js';

export async function onRequest(context) {
  if (context.request.method !== 'POST') return methodNotAllowed();

  try {
    await ensurePublicChannel(context.env);
    const user = await requireUser(context.request, context.env);
    const channelId = Number(context.params.id);
    const channel = await getChannelForUser(context.env, channelId, user.id);
    if (!channel) return error('频道不存在', 404);
    if (channel.is_public) return error('公共频道无需邀请码', 400);
    if (channel.is_member || channel.is_owner) return json({ success: true });

    const { invite_code } = await context.request.json();
    const inviteCode = String(invite_code || '').trim().toUpperCase();
    if (!inviteCode) return error('请输入邀请码', 400);
    if (inviteCode !== String(channel.invite_code || '').toUpperCase()) return error('邀请码错误', 403);

    await context.env.DB.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)')
      .bind(channelId, user.id)
      .run();

    return json({ success: true });
  } catch (err) {
    return err instanceof Response ? err : error(err.message || '加入频道失败', 500);
  }
}
