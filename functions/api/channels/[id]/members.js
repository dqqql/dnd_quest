import { requireUser } from '../../_lib/auth.js';
import { ensurePublicChannel, requireChannelAdmin } from '../../_lib/channels.js';
import { error, json, methodNotAllowed } from '../../_lib/http.js';

export async function onRequest(context) {
  if (context.request.method === 'GET') return handleGet(context);
  if (context.request.method === 'DELETE') return handleDelete(context);
  return methodNotAllowed();
}

async function handleGet(context) {
  try {
    await ensurePublicChannel(context.env);
    const user = await requireUser(context.request, context.env);
    const channelId = Number(context.params.id);
    const channel = await requireChannelAdmin(context.env, channelId, user.id);
    if (channel.is_public) return error('公共频道没有成员管理', 400);

    const { results } = await context.env.DB.prepare(`
      SELECT u.id, u.username, cm.joined_at
      FROM channel_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.channel_id = ?
      ORDER BY CASE WHEN u.id = ? THEN 0 ELSE 1 END, cm.joined_at ASC
    `).bind(channelId, user.id).all();

    return json({
      members: results.map((member) => ({
        ...member,
        is_owner: String(member.id) === String(user.id),
      })),
    });
  } catch (err) {
    return err instanceof Response ? err : error(err.message || '获取成员列表失败', 500);
  }
}

async function handleDelete(context) {
  try {
    await ensurePublicChannel(context.env);
    const user = await requireUser(context.request, context.env);
    const channelId = Number(context.params.id);
    const channel = await requireChannelAdmin(context.env, channelId, user.id);
    if (channel.is_public) return error('公共频道没有成员管理', 400);

    const { user_id } = await context.request.json();
    const targetId = Number(user_id);
    if (!targetId) return error('缺少成员信息', 400);
    if (String(targetId) === String(user.id)) return error('不能踢出频道创建者', 400);

    await context.env.DB.prepare('DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?')
      .bind(channelId, targetId)
      .run();

    return json({
      success: true,
      remind_refresh_invite: true,
    });
  } catch (err) {
    return err instanceof Response ? err : error(err.message || '移除成员失败', 500);
  }
}
