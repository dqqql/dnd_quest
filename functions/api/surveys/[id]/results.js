const h = { 'Access-Control-Allow-Origin': '*' };

export async function onRequest({ request, env, params }) {
  try {
    const surveyId = params.id;
    const url = new URL(request.url);
    const requesterId = url.searchParams.get('user_id');

    const survey = await env.DB.prepare(`
      SELECT s.*, u.name as creator_name
      FROM surveys s JOIN users u ON s.creator_id = u.id
      WHERE s.id = ? AND s.is_deleted = 0
    `).bind(surveyId).first();
    if (!survey) return Response.json({ error: '问卷不存在' }, { status: 404, headers: h });
    if (String(survey.creator_id) !== String(requesterId))
      return Response.json({ error: '仅创建者可查看结果' }, { status: 403, headers: h });

    const { results: responses } = await env.DB.prepare(`
      SELECT r.id, r.submitted_at, u.name as user_name, u.id as user_id
      FROM responses r JOIN users u ON r.user_id = u.id
      WHERE r.survey_id = ? ORDER BY r.submitted_at DESC
    `).bind(surveyId).all();

    const { results: answers } = await env.DB.prepare(`
      SELECT a.response_id, a.question_id, a.value, a.other_text,
             q.content as question_content, q.type, q.options, q.order_num, q.has_other
      FROM answers a
      LEFT JOIN questions q ON a.question_id = q.id
      WHERE a.response_id IN (SELECT id FROM responses WHERE survey_id = ?)
      ORDER BY a.response_id, q.order_num
    `).bind(surveyId).all();

    const { results: questions } = await env.DB.prepare(
      'SELECT * FROM questions WHERE survey_id = ? ORDER BY order_num'
    ).bind(surveyId).all();

    return Response.json({
      survey,
      questions: questions.map(q => ({ ...q, options: q.options ? JSON.parse(q.options) : [], has_other: !!q.has_other })),
      responses,
      answers: answers.map(a => ({ ...a, options: a.options ? JSON.parse(a.options) : [] }))
    }, { headers: h });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500, headers: h });
  }
}
