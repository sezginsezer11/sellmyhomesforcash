import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';

// Server-side proxy to the RealScout Agent API — the token lives only in
// this process's env (REALSCOUT_API_TOKEN), never sent to the browser.
// https://bump.sh/realscout/doc/realscout-api

const REALSCOUT_BASE = 'https://www.realscout.com/api/agent/v1';

function isAdminEmail(email) {
  const list = (process.env.ADMIN_EMAILS || 'sez@carmelvalley.com')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}
async function requireAdmin(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user || !isAdminEmail(data.user.email)) return null;
  return data.user;
}

async function realscoutFetch(path, searchParams) {
  const token = process.env.REALSCOUT_API_TOKEN;
  if (!token) return { ok: false, status: 0, error: 'not_configured' };

  const url = new URL(REALSCOUT_BASE + path);
  if (searchParams) for (const [k, v] of searchParams.entries()) if (v) url.searchParams.set(k, v);

  let res;
  try {
    res = await fetch(url.toString(), { headers: { Authorization: 'Bearer ' + token } });
  } catch (e) {
    return { ok: false, status: 0, error: 'network_error' };
  }
  const retryAfter = res.headers.get('Retry-After');
  let body;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    return { ok: false, status: res.status, error: body?.error || { message: res.statusText }, retryAfter };
  }
  return { ok: true, status: res.status, body };
}

export async function GET(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });

    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'me';

    if (action === 'me') {
      const r = await realscoutFetch('/me');
      if (!r.ok) return NextResponse.json({ ok: false, error: r.error, status: r.status });
      return NextResponse.json({ ok: true, account: r.body });
    }

    if (action === 'contacts') {
      const params = new URLSearchParams();
      for (const key of ['name', 'email', 'tag', 'status', 'sort', 'order', 'cursor', 'limit', 'window_days']) {
        const v = url.searchParams.get(key);
        if (v) params.set(key, v);
      }
      if (!params.get('limit')) params.set('limit', '50');
      params.set('include', 'activity');
      const r = await realscoutFetch('/contacts', params);
      if (!r.ok) return NextResponse.json({ ok: false, error: r.error, status: r.status, retryAfter: r.retryAfter });
      return NextResponse.json({ ok: true, contacts: r.body.data || [], hasMore: !!r.body.has_more, nextCursor: r.body.next_cursor || null });
    }

    return NextResponse.json({ ok: false, error: 'Unknown action.' }, { status: 400 });
  } catch (e) {
    console.error('realscout GET error:', e);
    return NextResponse.json({ ok: false, error: 'Server error.' }, { status: 500 });
  }
}
