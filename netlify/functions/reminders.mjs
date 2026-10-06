import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';

const STORE = 'notes-reminders';
const ALLOWED_ORIGIN = process.env.SITE_URL || '';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(ALLOWED_ORIGIN ? { 'access-control-allow-origin': ALLOWED_ORIGIN } : {}),
    },
  });
}

function normalizeInitData(raw) {
  if (!raw) return null;
  try {
    const params = new URLSearchParams(raw);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const pairs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) throw new Error('BOT_TOKEN is not configured on Netlify');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) return null;
    const authDate = Number(params.get('auth_date') || 0);
    if (!authDate || Math.abs(Date.now() / 1000 - authDate) > 86400) return null;
    const user = JSON.parse(params.get('user') || '{}');
    if (!user.id) return null;
    return user;
  } catch (e) {
    console.error('initData validation failed:', e.message);
    return null;
  }
}

function botSyncAuthorized(req) {
  const token = req.headers.get('x-bot-sync') || '';
  const botToken = process.env.BOT_TOKEN || '';
  const expected = crypto.createHash('sha256').update(`${botToken}|notes-mini-sync`).digest('hex');
  return Boolean(botToken && token && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected)));
}

async function readAll() {
  const store = getStore(STORE);
  const { blobs } = await store.list();
  const result = [];
  for (const entry of blobs) {
    const item = await store.get(entry.key, { type: 'json' });
    if (item && item.id && item.user_id) result.push(item);
  }
  return result;
}

function validate(payload) {
  const text = String(payload?.text || '').trim();
  const time = String(payload?.time || '');
  const mode = payload?.mode;
  if (!text || text.length > 500) throw new Error('Текст должен содержать от 1 до 500 символов.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Некорректное время.');
  if (!['once', 'weekly', 'interval'].includes(mode)) throw new Error('Некорректный режим повторения.');
  if (mode === 'once' && !/^\d{4}-\d{2}-\d{2}$/.test(String(payload.date || ''))) throw new Error('Укажите дату.');
  if (mode === 'weekly' && (!Array.isArray(payload.weekdays) || !payload.weekdays.length)) throw new Error('Выберите дни недели.');
  if (mode === 'interval' && (!Number.isInteger(Number(payload.interval_days)) || Number(payload.interval_days) < 1 || Number(payload.interval_days) > 365 || !/^\d{4}-\d{2}-\d{2}$/.test(String(payload.start_date || '')))) throw new Error('Проверьте интервал и дату начала.');
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 204 });

  try {
    if (req.method === 'GET') {
      if (!botSyncAuthorized(req)) return json({ ok: false, error: 'forbidden' }, 403);
      return json({ ok: true, reminders: await readAll() });
    }

    if (req.method !== 'POST' && req.method !== 'DELETE') return json({ ok: false, error: 'method_not_allowed' }, 405);

    const user = normalizeInitData(req.headers.get('x-telegram-init-data'));
    if (!user) return json({ ok: false, error: 'invalid_init_data' }, 401);

    const store = getStore(STORE);
    const body = req.method === 'DELETE' ? await req.json() : await req.json();
    const id = body?.id;

    if (req.method === 'DELETE') {
      if (!id) return json({ ok: false, error: 'missing_id' }, 400);
      const existing = await store.get(`r/${id}`, { type: 'json' });
      if (!existing || Number(existing.user_id) !== Number(user.id)) return json({ ok: false, error: 'not_found' }, 404);
      await store.delete(`r/${id}`);
      return json({ ok: true, deleted: id });
    }

    validate(body);
    const item = {
      ...body,
      id: id || `r_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`,
      user_id: Number(user.id),
      enabled: true,
      source: 'miniapp_api',
      updated_at: new Date().toISOString(),
    };

    if (id) {
      const existing = await store.get(`r/${id}`, { type: 'json' });
      if (existing && Number(existing.user_id) !== Number(user.id)) return json({ ok: false, error: 'forbidden' }, 403);
    }

    await store.setJSON(`r/${item.id}`, item);
    return json({ ok: true, item });
  } catch (e) {
    console.error('reminders function error:', e);
    return json({ ok: false, error: e.message || 'server_error' }, 500);
  }
};
