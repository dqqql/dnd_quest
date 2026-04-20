export function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    ...extra,
  };
}

export function json(data, init = {}) {
  const headers = corsHeaders(init.headers || {});
  return Response.json(data, { ...init, headers });
}

export function error(message, status = 400, extra = {}) {
  return json({ error: message, ...extra }, { status });
}

export function methodNotAllowed() {
  return error('Method not allowed', 405);
}
