import { error } from './http.js';

const encoder = new TextEncoder();
const SESSION_COOKIE = 'wj_session';
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 310000;
const HASH_ALGO = 'SHA-256';

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(input) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function parseCookies(request) {
  const raw = request.headers.get('Cookie') || '';
  return Object.fromEntries(
    raw
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf('=');
        return [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
      })
  );
}

async function sha256(input) {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  const digest = await crypto.subtle.digest(HASH_ALGO, bytes);
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: HASH_ALGO, salt, iterations: PBKDF2_ITERATIONS },
    key,
    256
  );
  return ['pbkdf2', PBKDF2_ITERATIONS, bytesToBase64Url(salt), bytesToBase64Url(new Uint8Array(bits))].join('$');
}

export async function verifyPassword(password, storedHash) {
  const [scheme, iterationsRaw, saltRaw, expectedRaw] = String(storedHash || '').split('$');
  if (scheme !== 'pbkdf2' || !iterationsRaw || !saltRaw || !expectedRaw) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const salt = base64UrlToBytes(saltRaw);
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: HASH_ALGO, salt, iterations }, key, 256);
  const actual = bytesToBase64Url(new Uint8Array(bits));
  return crypto.subtle.timingSafeEqual
    ? crypto.subtle.timingSafeEqual(encoder.encode(actual), encoder.encode(expectedRaw))
    : actual === expectedRaw;
}

function sessionCookie(token, request, maxAgeSeconds) {
  const secure = new URL(request.url).protocol === 'https:';
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(request) {
  return sessionCookie('', request, 0);
}

export async function createSession(env, request, userId) {
  const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await env.DB.prepare('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
    .bind(userId, tokenHash, expiresAt.toISOString())
    .run();
  return {
    token,
    cookie: sessionCookie(token, request, SESSION_DAYS * 24 * 60 * 60),
  };
}

export async function deleteSession(env, request) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (!token) return clearSessionCookie(request);
  const tokenHash = await sha256(token);
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  return clearSessionCookie(request);
}

export async function getUserFromSession(request, env) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT u.id, u.username, u.created_at, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).bind(tokenHash).first();
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  return {
    id: row.id,
    username: row.username,
    created_at: row.created_at,
  };
}

export async function requireUser(request, env) {
  const user = await getUserFromSession(request, env);
  if (!user) throw error('请先登录', 401);
  return user;
}

export function validateUsername(username) {
  const value = String(username || '').trim();
  if (!value) return '用户名不能为空';
  if (value.length < 3 || value.length > 20) return '用户名长度需为 3 到 20 位';
  if (!/^[a-zA-Z0-9_\-\u4e00-\u9fa5]+$/.test(value)) return '用户名只能包含中文、字母、数字、下划线或短横线';
  return null;
}

export function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 8) return '密码至少需要 8 位';
  if (value.length > 72) return '密码不能超过 72 位';
  return null;
}
