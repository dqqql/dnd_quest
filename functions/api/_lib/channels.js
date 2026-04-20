import { error } from './http.js';

export const CHANNEL_ACCESS = {
  VISIBLE: 'visible',
  MEMBERS_ONLY: 'members_only',
};

export async function ensurePublicChannel(env) {
  let channel = await env.DB.prepare('SELECT * FROM channels WHERE slug = ?').bind('public').first();
  if (!channel) {
    await env.DB.prepare(`
      INSERT INTO channels (name, slug, owner_id, is_public, access_mode, invite_code)
      VALUES ('公共频道', 'public', NULL, 1, ?, NULL)
    `).bind(CHANNEL_ACCESS.VISIBLE).run();
    channel = await env.DB.prepare('SELECT * FROM channels WHERE slug = ?').bind('public').first();
  }
  return channel;
}

export function generateInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}

export function canViewChannel(channel) {
  if (!channel) return false;
  if (channel.is_public) return true;
  if (channel.is_owner || channel.is_member) return true;
  return channel.access_mode === CHANNEL_ACCESS.VISIBLE;
}

export function canFillChannel(channel) {
  if (!channel) return false;
  if (channel.is_public) return true;
  return Boolean(channel.is_owner || channel.is_member);
}

export async function getOwnedPrivateChannelCount(env, userId) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM channels WHERE owner_id = ? AND is_public = 0')
    .bind(userId)
    .first();
  return Number(row?.count || 0);
}

export async function getChannelForUser(env, channelId, userId) {
  const row = await env.DB.prepare(`
    SELECT
      c.id,
      c.name,
      c.slug,
      c.owner_id,
      c.is_public,
      c.access_mode,
      c.invite_code,
      c.created_at,
      c.updated_at,
      u.username AS owner_name,
      CASE WHEN c.owner_id = ? THEN 1 ELSE 0 END AS is_owner,
      CASE WHEN cm.user_id IS NULL THEN 0 ELSE 1 END AS is_member
    FROM channels c
    LEFT JOIN users u ON u.id = c.owner_id
    LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
    WHERE c.id = ?
  `).bind(userId, userId, channelId).first();
  if (!row) return null;
  return {
    ...row,
    is_public: Boolean(row.is_public),
    is_owner: Boolean(row.is_owner),
    is_member: Boolean(row.is_member),
    can_view: canViewChannel(row),
    can_fill: canFillChannel(row),
  };
}

export async function requireChannelAdmin(env, channelId, userId) {
  const channel = await getChannelForUser(env, channelId, userId);
  if (!channel) throw error('频道不存在', 404);
  if (!channel.is_owner) throw error('无权操作该频道', 403);
  return channel;
}

export async function getVisibleChannels(env, userId) {
  const { results } = await env.DB.prepare(`
    SELECT
      c.id,
      c.name,
      c.slug,
      c.owner_id,
      c.is_public,
      c.access_mode,
      c.created_at,
      c.updated_at,
      u.username AS owner_name,
      CASE WHEN c.owner_id = ? THEN 1 ELSE 0 END AS is_owner,
      CASE WHEN cm.user_id IS NULL THEN 0 ELSE 1 END AS is_member,
      (
        SELECT COUNT(*)
        FROM surveys s
        WHERE s.channel_id = c.id AND s.is_deleted = 0
      ) AS survey_count,
      (
        SELECT COUNT(*)
        FROM channel_members cm2
        WHERE cm2.channel_id = c.id
      ) AS member_count
    FROM channels c
    LEFT JOIN users u ON u.id = c.owner_id
    LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
    ORDER BY c.is_public DESC, is_owner DESC, c.created_at ASC
  `).bind(userId, userId).all();

  return results.map((row) => ({
    ...row,
    is_public: Boolean(row.is_public),
    is_owner: Boolean(row.is_owner),
    is_member: Boolean(row.is_member),
    survey_count: Number(row.survey_count || 0),
    member_count: Number(row.member_count || 0),
    can_view: canViewChannel(row),
    can_fill: canFillChannel(row),
  }));
}
