import { requireUser } from './_lib/auth.js';
import {
  CHANNEL_ACCESS,
  ensurePublicChannel,
  generateInviteCode,
  getOwnedPrivateChannelCount,
  getVisibleChannels,
} from './_lib/channels.js';
import { error, json, methodNotAllowed } from './_lib/http.js';

function channelPayload(channel) {
  return {
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
    survey_count: channel.survey_count,
    member_count: channel.member_count,
    created_at: channel.created_at,
    updated_at: channel.updated_at,
  };
}

export async function onRequest(context) {
  if (context.request.method === 'GET') return handleGet(context);
  if (context.request.method === 'POST') return handlePost(context);
  return methodNotAllowed();
}

async function handleGet(context) {
  try {
    await ensurePublicChannel(context.env);
    const user = await requireUser(context.request, context.env);
    const channels = await getVisibleChannels(context.env, user.id);
    return json({ channels: channels.map(channelPayload) });
  } catch (err) {
    return err instanceof Response ? err : error(err.message || '获取频道列表失败', 500);
  }
}

async function handlePost(context) {
  try {
    await ensurePublicChannel(context.env);
    const user = await requireUser(context.request, context.env);
    const count = await getOwnedPrivateChannelCount(context.env, user.id);
    if (count >= 3) return error('最多只能创建 3 个私密频道', 400);

    const { name, access_mode } = await context.request.json();
    const channelName = String(name || '').trim();
    if (!channelName) return error('频道名称不能为空', 400);
    if (channelName.length > 40) return error('频道名称不能超过 40 个字符', 400);
    if (![CHANNEL_ACCESS.VISIBLE, CHANNEL_ACCESS.MEMBERS_ONLY].includes(access_mode)) {
      return error('频道权限模式无效', 400);
    }

    const inviteCode = generateInviteCode();
    const result = await context.env.DB.prepare(`
      INSERT INTO channels (name, owner_id, is_public, access_mode, invite_code, updated_at)
      VALUES (?, ?, 0, ?, ?, CURRENT_TIMESTAMP)
    `).bind(channelName, user.id, access_mode, inviteCode).run();

    await context.env.DB.prepare('INSERT INTO channel_members (channel_id, user_id) VALUES (?, ?)')
      .bind(result.meta.last_row_id, user.id)
      .run();

    const channel = await context.env.DB.prepare(`
      SELECT id, name, slug, owner_id, is_public, access_mode, invite_code, created_at, updated_at
      FROM channels
      WHERE id = ?
    `).bind(result.meta.last_row_id).first();

    return json({
      channel: {
        ...channel,
        is_public: false,
        owner_name: user.username,
        is_owner: true,
        is_member: true,
        can_view: true,
        can_fill: true,
        survey_count: 0,
        member_count: 1,
      },
    }, { status: 201 });
  } catch (err) {
    return err instanceof Response ? err : error(err.message || '创建频道失败', 500);
  }
}
