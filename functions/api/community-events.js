const fields = 'id, name, date, venue, description';
const headers = { 'Cache-Control': 'no-store' };

function json(data, status = 200) {
  return Response.json(data, { status, headers });
}

async function authorized(request, secret) {
  const token = request.headers.get('Authorization')?.slice(7);
  if (!token || !secret || !request.headers.get('Authorization').startsWith('Bearer ')) return false;
  const encoder = new TextEncoder();
  const [supplied, expected] = await Promise.all(
    [token, secret].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value)))
  );
  const a = new Uint8Array(supplied);
  const b = new Uint8Array(expected);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

export async function onRequest({ request, env }) {
  const db = env.EVENTS_DB;
  if (!db || !env.EVENTS_ADMIN_TOKEN) return json({ error: 'Community event posting is being set up.' }, 503);

  try {
    const admin = new URL(request.url).searchParams.get('view') === 'admin';
    if (admin && !await authorized(request, env.EVENTS_ADMIN_TOKEN)) {
      return json({ error: 'Enter your event review access key.' }, 401);
    }

    if (request.method === 'GET') {
      const query = admin
        ? `SELECT ${fields} FROM community_events WHERE status = 'pending' ORDER BY submitted_at LIMIT 100`
        : `SELECT ${fields} FROM community_events WHERE status = 'approved' AND date >= date('now', '-1 day') ORDER BY date, name LIMIT 100`;
      const { results } = await db.prepare(query).all();
      return json({ events: results });
    }

    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    if (request.headers.get('origin') !== new URL(request.url).origin ||
        request.headers.get('content-type') !== 'application/json') {
      return json({ error: 'Submit the form from the Bring Back Better website.' }, 403);
    }
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Form data is required.' }, 400);
    const decoder = new TextDecoder();
    let raw = '';
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        return json({ error: 'The form is too long.' }, 413);
      }
      raw += decoder.decode(value, { stream: true });
    }

    let data;
    try {
      data = JSON.parse(raw + decoder.decode());
    } catch {
      return json({ error: 'Invalid form data.' }, 400);
    }
    if (!data || typeof data !== 'object') return json({ error: 'Invalid form data.' }, 400);

    if (admin) {
      if (!['approved', 'rejected'].includes(data.status) || typeof data.id !== 'string') {
        return json({ error: 'Choose a valid review action.' }, 400);
      }
      const result = await db.prepare("UPDATE community_events SET status = ? WHERE id = ? AND status = 'pending'")
        .bind(data.status, data.id).run();
      return result.meta.changes ? json({ saved: true }) : json({ error: 'This event has already been reviewed.' }, 409);
    }

    const limits = { name: 100, date: 10, venue: 150, description: 800 };
    const values = Object.keys(limits).map(key => typeof data[key] === 'string' ? data[key].trim() : '');
    if (values.some((value, index) => !value || value.length > Object.values(limits)[index])) {
      return json({ error: 'Fill in each field and stay within its character limit.' }, 400);
    }
    const date = values[1];
    const parsed = new Date(date + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(+parsed) ||
        parsed.toISOString().slice(0, 10) !== date ||
        date < new Date(Date.now() - 86400000).toISOString().slice(0, 10)) {
      return json({ error: 'Choose a valid upcoming date.' }, 400);
    }
    await db.prepare('INSERT INTO community_events (id, name, date, venue, description) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), ...values).run();
    return json({ saved: true }, 201);
  } catch (error) {
    console.error('Community events request failed', error);
    return json({ error: 'Community events are temporarily unavailable. Please try again.' }, 503);
  }
}
