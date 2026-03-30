export async function onRequestPost({ request, env }) {
  try {
    const { name } = await request.json();
    if (!name || !name.trim()) {
      return Response.json({ error: '名字不能为空' }, { status: 400 });
    }
    const n = name.trim();
    await env.DB.prepare('INSERT OR IGNORE INTO users (name) VALUES (?)').bind(n).run();
    const user = await env.DB.prepare('SELECT id, name, created_at FROM users WHERE name = ?').bind(n).first();
    return Response.json(user);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
