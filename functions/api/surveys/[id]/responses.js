const h = { 'Access-Control-Allow-Origin': '*' };

export async function onRequestPost({ request, env, params }) {
  try {
    const surveyId = params.id;
    const { user_id, answers } = await request.json();
    const survey = await env.DB.prepare('SELECT is_closed FROM surveys WHERE id = ? AND is_deleted = 0').bind(surveyId).first();
    if (!survey) return Response.json({ error: '问卷不存在' }, { status: 404, headers: h });
    if (survey.is_closed) return Response.json({ error: '问卷已关闭，无法提交' }, { status: 403, headers: h });
    const r = await env.DB.prepare('INSERT INTO responses (survey_id, user_id) VALUES (?, ?)').bind(surveyId, user_id).run();
    const responseId = r.meta.last_row_id;
    if (answers && answers.length > 0) {
      const stmts = answers.map(a =>
        env.DB.prepare('INSERT INTO answers (response_id, question_id, value, other_text) VALUES (?,?,?,?)')
          .bind(responseId, a.question_id, a.value || '', a.other_text || null)
      );
      await env.DB.batch(stmts);
    }
    return Response.json({ id: responseId }, { status: 201, headers: h });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500, headers: h });
  }
}
