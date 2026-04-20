import { requireUser } from './_lib/auth.js';
import { ensurePublicChannel, getChannelForUser } from './_lib/channels.js';
import { error, json, methodNotAllowed } from './_lib/http.js';

export async function onRequest(context) {
  if (context.request.method === 'GET') return handleGet(context);
  if (context.request.method === 'POST') return handlePost(context);
  return methodNotAllowed();
}

async function handleGet(context) {
  try {
    await ensurePublicChannel(context.env);
    const user = await requireUser(context.request, context.env);
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
        c.name AS channel_name,
        c.slug AS channel_slug,
        c.is_public,
        c.access_mode,
        c.owner_id,
        CASE WHEN c.owner_id = ? THEN 1 ELSE 0 END AS is_owner,
        CASE WHEN cm.user_id IS NULL THEN 0 ELSE 1 END AS is_member,
        (
          SELECT COUNT(*)
          FROM responses r
          WHERE r.survey_id = s.id
        ) AS response_count
      FROM surveys s
      JOIN users u ON u.id = s.creator_id
      JOIN channels c ON c.id = s.channel_id
      LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
      WHERE s.is_deleted = 0
      ORDER BY s.created_at DESC
    `).bind(user.id, user.id).all();

    const surveys = results
      .map((survey) => {
        const channel = {
          id: survey.channel_id,
          name: survey.channel_name,
          slug: survey.channel_slug,
          owner_id: survey.owner_id,
          is_public: Boolean(survey.is_public),
          access_mode: survey.access_mode,
          is_owner: Boolean(survey.is_owner),
          is_member: Boolean(survey.is_member),
        };
        const canView = channel.is_public || channel.is_owner || channel.is_member || channel.access_mode === 'visible';
        if (!canView) return null;
        return {
          id: survey.id,
          channel_id: survey.channel_id,
          title: survey.title,
          description: survey.description,
          creator_id: survey.creator_id,
          creator_name: survey.creator_name,
          is_closed: Boolean(survey.is_closed),
          created_at: survey.created_at,
          updated_at: survey.updated_at,
          channel_name: survey.channel_name,
          response_count: Number(survey.response_count || 0),
        };
      })
      .filter(Boolean);

    return json({ surveys });
  } catch (err) {
    return err instanceof Response ? err : error(err.message || '获取问卷列表失败', 500);
  }
}

async function handlePost(context) {
  try {
    const user = await requireUser(context.request, context.env);
    const publicChannel = await ensurePublicChannel(context.env);
    const { title, description, channel_id, questions } = await context.request.json();
    const surveyTitle = String(title || '').trim();
    if (!surveyTitle) return error('问卷标题不能为空', 400);

    const targetChannelId = channel_id ? Number(channel_id) : publicChannel.id;
    const channel = await getChannelForUser(context.env, targetChannelId, user.id);
    if (!channel) return error('目标频道不存在', 404);
    if (!channel.is_public && !channel.is_owner) return error('只能直接发布到公共频道或你拥有的私密频道', 403);

    const result = await context.env.DB.prepare(`
      INSERT INTO surveys (channel_id, title, description, creator_id)
      VALUES (?, ?, ?, ?)
    `).bind(targetChannelId, surveyTitle, String(description || '').trim(), user.id).run();

    if (Array.isArray(questions) && questions.length > 0) {
      const statements = questions.map((question, index) =>
        context.env.DB.prepare(`
          INSERT INTO questions (survey_id, order_num, type, content, options, has_other)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          result.meta.last_row_id,
          index + 1,
          question.type,
          question.content,
          question.options ? JSON.stringify(question.options) : null,
          question.has_other ? 1 : 0
        )
      );
      await context.env.DB.batch(statements);
    }

    return json({ id: result.meta.last_row_id }, { status: 201 });
  } catch (err) {
    return err instanceof Response ? err : error(err.message || '创建问卷失败', 500);
  }
}
