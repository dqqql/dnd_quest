export async function onRequest({ request, env }) {
  const headers = { 'Access-Control-Allow-Origin': '*' };
  if (request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare(`
        SELECT s.id, s.title, s.description, s.is_closed, s.created_at, s.updated_at,
               u.name as creator_name, s.creator_id,
               (SELECT COUNT(*) FROM responses r WHERE r.survey_id = s.id) as response_count
        FROM surveys s
        JOIN users u ON s.creator_id = u.id
        WHERE s.is_deleted = 0
        ORDER BY s.created_at DESC
      `).all();
      return Response.json(results, { headers });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500, headers });
    }
  }
  if (request.method === 'POST') {
    try {
      const { title, description, creator_id, questions } = await request.json();
      if (!title || !creator_id) return Response.json({ error: '缺少必要字段' }, { status: 400, headers });
      const r = await env.DB.prepare(
        'INSERT INTO surveys (title, description, creator_id) VALUES (?, ?, ?)'
      ).bind(title, description || '', creator_id).run();
      const surveyId = r.meta.last_row_id;
      if (questions && questions.length > 0) {
        const stmts = questions.map((q, i) =>
          env.DB.prepare('INSERT INTO questions (survey_id, order_num, type, content, options, has_other) VALUES (?,?,?,?,?,?)')
            .bind(surveyId, i + 1, q.type, q.content, q.options ? JSON.stringify(q.options) : null, q.has_other ? 1 : 0)
        );
        await env.DB.batch(stmts);
      }
      return Response.json({ id: surveyId }, { status: 201, headers });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500, headers });
    }
  }
  return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
}
