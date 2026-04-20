import { requireUser } from '../../_lib/auth.js';
import { ensurePublicChannel } from '../../_lib/channels.js';
import { error, json, methodNotAllowed } from '../../_lib/http.js';
import { getSurveyWithChannel } from '../../_lib/surveys.js';

export async function onRequest(context) {
  if (context.request.method !== 'POST') return methodNotAllowed();

  try {
    await ensurePublicChannel(context.env);
    const user = await requireUser(context.request, context.env);
    const surveyId = Number(context.params.id);
    const survey = await getSurveyWithChannel(context.env, surveyId, user.id);
    if (!survey) return error('问卷不存在', 404);
    if (!survey.can_fill) return error('无权填写该问卷', 403);

    const { answers } = await context.request.json();
    if (!Array.isArray(answers) || !answers.length) return error('缺少作答内容', 400);

    const result = await context.env.DB.prepare('INSERT INTO responses (survey_id, user_id) VALUES (?, ?)')
      .bind(surveyId, user.id)
      .run();

    const statements = answers.map((answer) =>
      context.env.DB.prepare(`
        INSERT INTO answers (response_id, question_id, value, other_text)
        VALUES (?, ?, ?, ?)
      `).bind(result.meta.last_row_id, answer.question_id, answer.value || '', answer.other_text || null)
    );

    if (statements.length) await context.env.DB.batch(statements);
    return json({ id: result.meta.last_row_id }, { status: 201 });
  } catch (err) {
    return err instanceof Response ? err : error(err.message || '提交问卷失败', 500);
  }
}
