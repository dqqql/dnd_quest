import { requireUser } from '../_lib/auth.js';
import { CHANNEL_ACCESS, ensurePublicChannel, getChannelForUser, requireChannelAdmin } from '../_lib/channels.js';
import { error, json, methodNotAllowed } from '../_lib/http.js';

export async function onRequest(context) {
  if (context.request.method === 'GET') return handleGet(context);
  if (context.request.method === 'PATCH') return handlePatch(context);
  return methodNotAllowed();
}

async function handleGet(context) {
  try {
    await ensurePublicChannel(context.env);
    const user = await requireUser(context.request, context.env);
    const channelId = Number(context.params.id);
    const channel = await getChannelForUser(context.env, channelId, user.id);
    if (!channel) return error('频道不存在', 404);
    if (!channel.can_view) return error('请输入邀请码后查看该频道', 403, { code: 'CHANNEL_INVITE_REQUIRED' });

    const { results } = await context.env.DB.prepare(`
      SELECT
        s.id,
        s.channel_id,
        s.title,
        s.description,
        s.creator_id,
        s.is_closed,
        s.created_at,
        s.updated_at,
        u.username AS creator_name,
        (
          SELECT COUNT(*)
          FROM responses r
          WHERE r.survey_id = s.id
        ) AS response_count
      FROM surveys s
      JOIN users u ON u.id = s.creator_id
      WHERE s.channel_id = ? AND s.is_deleted = 0
      ORDER BY s.created_at DESC
    `).bind(channelId).all();

    return json({
      channel: {
        id: channel.id,
        name: channel.name,
        slug: channel.slug,
        owner_id: channel.owner_id,
        owner_name: channel.owner_name,
        is_public: channel.is_public,
        access_mode: channel.access_mode,
        is_owner: channel.is_owner,
        is_member: channel.is_member,
        can_view: channel.can_view,
        can_fill: channel.can_fill,
        created_at: channel.created_at,
        updated_at: channel.updated_at,
        invite_code: channel.is_owner && !channel.is_public ? channel.invite_code : null,
      },
      surveys: results.map((survey) => ({
        ...survey,
        is_closed: Boolean(survey.is_closed),
        response_count: Number(survey.response_count || 0),
        can_fill: !survey.is_closed && channel.can_fill,
        can_edit: String(survey.creator_id) === String(user.id),
        can_view_results: String(survey.creator_id) === String(user.id),
      })),
    });
  } catch (err) {
    return err instanceof Response ? err : error(err.message || '获取频道详情失败', 500);
  }
}

async function handlePatch(context) {
  try {
    await ensurePublicChannel(context.env);
    const user = await requireUser(context.request, context.env);
    const channelId = Number(context.params.id);
    const channel = await requireChannelAdmin(context.env, channelId, user.id);
    if (channel.is_public) return error('公共频道不能修改', 400);

    const { name, access_mode } = await context.request.json();
    const nextName = String(name || '').trim();
    if (!nextName) return error('频道名称不能为空', 400);
    if (![CHANNEL_ACCESS.VISIBLE, CHANNEL_ACCESS.MEMBERS_ONLY].includes(access_mode)) {
      return error('频道权限模式无效', 400);
    }

    await context.env.DB.prepare(`
      UPDATE channels
      SET name = ?, access_mode = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(nextName, access_mode, channelId).run();

    return json({ success: true });
  } catch (err) {
    return err instanceof Response ? err : error(err.message || '更新频道失败', 500);
  }
}
