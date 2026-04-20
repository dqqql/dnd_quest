import { requireUser } from '../../_lib/auth.js';
import { ensurePublicChannel } from '../../_lib/channels.js';
import { error, json, methodNotAllowed } from '../../_lib/http.js';
import { getSurveyQuestions, getSurveyWithChannel } from '../../_lib/surveys.js';

export async function onRequest(context) {
  if (context.request.method !== 'GET') return methodNotAllowed();

  try {
    await ensurePublicChannel(context.env);
    const user = await requireUser(context.request, context.env);
    const surveyId = Number(context.params.id);
    const survey = await getSurveyWithChannel(context.env, surveyId, user.id);
    if (!survey) return error('问卷不存在', 404);
    if (!survey.can_view_results) return error('仅问卷创建者可查看结果', 403);

    const { results: responses } = await context.env.DB.prepare(`
      SELECT r.id, r.submitted_at, u.username AS user_name, u.id AS user_id
      FROM responses r
      JOIN users u ON u.id = r.user_id
      WHERE r.survey_id = ?
      ORDER BY r.submitted_at DESC
    `).bind(surveyId).all();

    const { results: answers } = await context.env.DB.prepare(`
      SELECT a.response_id, a.question_id, a.value, a.other_text,
             q.content AS question_content, q.type, q.options, q.order_num, q.has_other
      FROM answers a
      LEFT JOIN questions q ON q.id = a.question_id
      WHERE a.response_id IN (SELECT id FROM responses WHERE survey_id = ?)
      ORDER BY a.response_id, q.order_num
    `).bind(surveyId).all();

    const questions = await getSurveyQuestions(context.env, surveyId);
    return json({
      survey: {
        id: survey.id,
        title: survey.title,
        description: survey.description,
        channel_id: survey.channel_id,
        creator_id: survey.creator_id,
        creator_name: survey.creator_name,
      },
      questions,
      responses,
      answers: answers.map((answer) => ({
        ...answer,
        options: answer.options ? JSON.parse(answer.options) : [],
        has_other: Boolean(answer.has_other),
      })),
    });
  } catch (err) {
    return err instanceof Response ? err : error(err.message || '获取问卷结果失败', 500);
  }
}
