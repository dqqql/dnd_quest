const h = { 'Access-Control-Allow-Origin': '*' };

export async function onRequest({ request, env, params }) {
  const id = params.id;
  if (request.method === 'GET') return handleGet(env, id);
  if (request.method === 'PUT') return handlePut(request, env, id);
  if (request.method === 'DELETE') return handleDelete(request, env, id);
  if (request.method === 'PATCH') return handlePatch(request, env, id);
  return Response.json({ error: 'Method not allowed' }, { status: 405, headers: h });
}

async function handleGet(env, id) {
  try {
    const survey = await env.DB.prepare(`
      SELECT s.*, u.name as creator_name,
        (SELECT COUNT(*) FROM responses r WHERE r.survey_id = s.id) as response_count
      FROM surveys s JOIN users u ON s.creator_id = u.id
      WHERE s.id = ? AND s.is_deleted = 0
    `).bind(id).first();
    if (!survey) return Response.json({ error: '问卷不存在' }, { status: 404, headers: h });
    const { results } = await env.DB.prepare('SELECT * FROM questions WHERE survey_id = ? ORDER BY order_num').bind(id).all();
    const questions = results.map(q => ({ ...q, options: q.options ? JSON.parse(q.options) : [], has_other: !!q.has_other }));
    return Response.json({ ...survey, questions }, { headers: h });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500, headers: h });
  }
}

async function handlePut(request, env, id) {
  try {
    const { title, description, creator_id, questions } = await request.json();
    const survey = await env.DB.prepare('SELECT creator_id FROM surveys WHERE id = ? AND is_deleted = 0').bind(id).first();
    if (!survey) return Response.json({ error: '问卷不存在' }, { status: 404, headers: h });
    if (String(survey.creator_id) !== String(creator_id)) return Response.json({ error: '无权限' }, { status: 403, headers: h });

    await env.DB.prepare('UPDATE surveys SET title=?, description=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(title, description || '', id).run();

    // 取出现有题目（按 order_num 排序），尽量复用其 ID 以保护历史答案
    const { results: existing } = await env.DB.prepare(
      'SELECT id, order_num FROM questions WHERE survey_id = ? ORDER BY order_num'
    ).bind(id).all();

    const newQs = questions || [];
    const stmts = [];

    newQs.forEach((q, i) => {
      const orderNum = i + 1;
      const old = existing.find(e => e.order_num === orderNum);
      if (old) {
        // 复用旧 ID，原地更新内容
        stmts.push(
          env.DB.prepare('UPDATE questions SET type=?, content=?, options=?, has_other=? WHERE id=?')
            .bind(q.type, q.content, q.options ? JSON.stringify(q.options) : null, q.has_other ? 1 : 0, old.id)
        );
      } else {
        // 新增的题目
        stmts.push(
          env.DB.prepare('INSERT INTO questions (survey_id, order_num, type, content, options, has_other) VALUES (?,?,?,?,?,?)')
            .bind(id, orderNum, q.type, q.content, q.options ? JSON.stringify(q.options) : null, q.has_other ? 1 : 0)
        );
      }
    });

    // 删除多余的旧题目（题目数量减少时）
    const keepOrderNums = newQs.map((_, i) => i + 1);
    const toDelete = existing.filter(e => !keepOrderNums.includes(e.order_num));
    toDelete.forEach(e => {
      stmts.push(env.DB.prepare('DELETE FROM questions WHERE id = ?').bind(e.id));
    });

    if (stmts.length > 0) await env.DB.batch(stmts);

    return Response.json({ success: true }, { headers: h });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500, headers: h });
  }
}

async function handleDelete(request, env, id) {
  try {
    const { creator_id } = await request.json();
    const survey = await env.DB.prepare('SELECT creator_id FROM surveys WHERE id = ? AND is_deleted = 0').bind(id).first();
    if (!survey) return Response.json({ error: '问卷不存在' }, { status: 404, headers: h });
    if (String(survey.creator_id) !== String(creator_id)) return Response.json({ error: '无权限' }, { status: 403, headers: h });
    await env.DB.prepare('UPDATE surveys SET is_deleted=1, updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(id).run();
    return Response.json({ success: true }, { headers: h });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500, headers: h });
  }
}

async function handlePatch(request, env, id) {
  try {
    const { creator_id, action } = await request.json();
    const survey = await env.DB.prepare('SELECT creator_id FROM surveys WHERE id = ? AND is_deleted = 0').bind(id).first();
    if (!survey) return Response.json({ error: '问卷不存在' }, { status: 404, headers: h });
    if (String(survey.creator_id) !== String(creator_id)) return Response.json({ error: '无权限' }, { status: 403, headers: h });
    const closed = action === 'close' ? 1 : 0;
    await env.DB.prepare('UPDATE surveys SET is_closed=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(closed, id).run();
    return Response.json({ success: true, is_closed: closed }, { headers: h });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500, headers: h });
  }
}
