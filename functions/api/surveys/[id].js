import { requireUser } from '../_lib/auth.js';
import { ensurePublicChannel, getChannelForUser } from '../_lib/channels.js';
import { error, json, methodNotAllowed } from '../_lib/http.js';
import { exportSurveyStructure, getSurveyQuestions, getSurveyWithChannel } from '../_lib/surveys.js';

export async function onRequest(context) {
  if (context.request.method === 'GET') return handleGet(context);
  if (context.request.method === 'PUT') return handlePut(context);
  if (context.request.method === 'DELETE') return handleDelete(context);
  if (context.request.method === 'PATCH') return handlePatch(context);
  return methodNotAllowed();
}

async function handleGet(context) {
  try {
    await ensurePublicChannel(context.env);
    const user = await requireUser(context.request, context.env);
    const surveyId = Number(context.params.id);
    const survey = await getSurveyWithChannel(context.env, surveyId, user.id);
    if (!survey) return error('问卷不存在', 404);
    if (!survey.can_view) return error('无权查看该问卷', 403);

    const questions = await getSurveyQuestions(context.env, surveyId);
    const url = new URL(context.request.url);
    if (url.searchParams.get('format') === 'export') {
      return json(exportSurveyStructure(survey, questions));
    }

    return json({
      id: survey.id,
      channel_id: survey.channel_id,
      title: survey.title,
      description: survey.description,
      creator_id: survey.creator_id,
      creator_name: survey.creator_name,
      is_closed: survey.is_closed,
      created_at: survey.created_at,
      updated_at: survey.updated_at,
      channel: survey.channel
        ? {
            id: survey.channel.id,
            name: survey.channel.name,
            owner_id: survey.channel.owner_id,
            owner_name: survey.channel.owner_name,
            is_public: survey.channel.is_public,
            access_mode: survey.channel.access_mode,
            is_owner: survey.channel.is_owner,
            is_member: survey.channel.is_member,
            can_view: survey.channel.can_view,
            can_fill: survey.channel.can_fill,
          }
        : null,
      can_fill: survey.can_fill,
      can_edit: survey.can_edit,
      can_view_results: survey.can_view_results,
      questions,
    });
  } catch (err) {
    return err instanceof Response ? err : error(err.message || '获取问卷失败', 500);
  }
}

async function handlePut(context) {
  try {
    await ensurePublicChannel(context.env);
    const user = await requireUser(context.request, context.env);
    const surveyId = Number(context.params.id);
    const survey = await getSurveyWithChannel(context.env, surveyId, user.id);
    if (!survey) return error('问卷不存在', 404);
    if (!survey.can_edit) return error('无权编辑该问卷', 403);

    const { title, description, questions } = await context.request.json();
    const surveyTitle = String(title || '').trim();
    if (!surveyTitle) return error('问卷标题不能为空', 400);

    await context.env.DB.prepare(`
      UPDATE surveys
      SET title = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(surveyTitle, String(description || '').trim(), surveyId).run();

    const { results: existing } = await context.env.DB.prepare(`
      SELECT id, order_num
      FROM questions
      WHERE survey_id = ?
      ORDER BY order_num
    `).bind(surveyId).all();

    const nextQuestions = Array.isArray(questions) ? questions : [];
    const statements = [];
    nextQuestions.forEach((question, index) => {
      const orderNum = index + 1;
      const current = existing.find((item) => Number(item.order_num) === orderNum);
      if (current) {
        statements.push(
          context.env.DB.prepare(`
            UPDATE questions
            SET type = ?, content = ?, options = ?, has_other = ?
            WHERE id = ?
          `).bind(
            question.type,
            question.content,
            question.options ? JSON.stringify(question.options) : null,
            question.has_other ? 1 : 0,
            current.id
          )
        );
      } else {
        statements.push(
          context.env.DB.prepare(`
            INSERT INTO questions (survey_id, order_num, type, content, options, has_other)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            surveyId,
            orderNum,
            question.type,
            question.content,
            question.options ? JSON.stringify(question.options) : null,
            question.has_other ? 1 : 0
          )
        );
      }
    });

    const keepOrderNums = new Set(nextQuestions.map((_, index) => index + 1));
    existing
      .filter((item) => !keepOrderNums.has(Number(item.order_num)))
      .forEach((item) => {
        statements.push(context.env.DB.prepare('DELETE FROM questions WHERE id = ?').bind(item.id));
      });

    if (statements.length) await context.env.DB.batch(statements);
    return json({ success: true });
  } catch (err) {
    return err instanceof Response ? err : error(err.message || '保存问卷失败', 500);
  }
}

async function handleDelete(context) {
  try {
    await ensurePublicChannel(context.env);
    const user = await requireUser(context.request, context.env);
    const surveyId = Number(context.params.id);
    const survey = await getSurveyWithChannel(context.env, surveyId, user.id);
    if (!survey) return error('问卷不存在', 404);
    if (!survey.can_edit) return error('无权删除该问卷', 403);

    await context.env.DB.prepare(`
      UPDATE surveys
      SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(surveyId).run();

    return json({ success: true });
  } catch (err) {
    return err instanceof Response ? err : error(err.message || '删除问卷失败', 500);
  }
}

async function handlePatch(context) {
  try {
    await ensurePublicChannel(context.env);
    const user = await requireUser(context.request, context.env);
    const surveyId = Number(context.params.id);
    const survey = await getSurveyWithChannel(context.env, surveyId, user.id);
    if (!survey) return error('问卷不存在', 404);
    if (!survey.can_edit) return error('无权操作该问卷', 403);

    const { action, channel_id } = await context.request.json();
    if (action === 'close' || action === 'reopen') {
      const nextValue = action === 'close' ? 1 : 0;
      await context.env.DB.prepare(`
        UPDATE surveys
        SET is_closed = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(nextValue, surveyId).run();
      return json({ success: true, is_closed: Boolean(nextValue) });
    }

    if (action === 'move') {
      const targetChannelId = Number(channel_id);
      if (!targetChannelId) return error('缺少目标频道', 400);
      const targetChannel = await getChannelForUser(context.env, targetChannelId, user.id);
      if (!targetChannel) return error('目标频道不存在', 404);
      if (!targetChannel.is_public && !targetChannel.is_owner) return error('只能移动到公共频道或你管理的私密频道', 403);
      await context.env.DB.prepare(`
        UPDATE surveys
        SET channel_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(targetChannelId, surveyId).run();
      return json({ success: true });
    }

    return error('不支持的操作', 400);
  } catch (err) {
    return err instanceof Response ? err : error(err.message || '更新问卷失败', 500);
  }
}
