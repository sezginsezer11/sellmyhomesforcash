import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { geocodeAddress } from '../../../lib/sheets';

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

// One page of RealScout contacts -> realscout_contacts, so the admin list can
// be searched by address/city/ZIP (RealScout's own API can't filter on those).
// Bounded to a single page per call: paging all of them in one request would
// outrun the serverless function timeout, so the UI loops on next_cursor.
export async function POST(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();

    // Geocodes a bounded batch of synced contacts that have an address but no
    // coordinates yet, so the map view has something to plot. Same shape as
    // the listings geocode backfill: small batches, a few at a time, UI loops.
    if (body.action === 'geocode_batch') {
      const limit = Math.min(Number(body.limit) || 25, 50);
      const { data: candidates, error: candErr } = await supabaseAdmin
        .from('realscout_contacts')
        .select('id, street, city, zipcode')
        .is('lat', null)
        .not('street', 'is', null)
        .neq('street', '')
        .limit(limit);
      if (candErr) {
        if (candErr.code === '42P01' || candErr.code === 'PGRST205') return NextResponse.json({ ok: false, error: 'table_missing' });
        console.error(candErr);
        return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 });
      }

      let geocoded = 0, failed = 0;
      const CONCURRENCY = 5;
      const items = candidates || [];
      for (let i = 0; i < items.length; i += CONCURRENCY) {
        await Promise.all(items.slice(i, i + CONCURRENCY).map(async (c) => {
          const geo = await geocodeAddress([c.street, c.city].filter(Boolean).join(', '), c.zipcode);
          if (geo && geo.lat != null) {
            geocoded++;
            await supabaseAdmin.from('realscout_contacts').update({ lat: geo.lat, lng: geo.lng }).eq('id', c.id);
          } else {
            failed++;
            // 0,0 marks "tried, couldn't geocode" so it isn't retried forever.
            await supabaseAdmin.from('realscout_contacts').update({ lat: 0, lng: 0 }).eq('id', c.id);
          }
        }));
      }

      const { count: remaining } = await supabaseAdmin
        .from('realscout_contacts').select('*', { count: 'exact', head: true })
        .is('lat', null).not('street', 'is', null).neq('street', '');

      return NextResponse.json({ ok: true, geocoded, failed, processed: items.length, remaining: remaining || 0 });
    }

    if (body.action !== 'sync_contacts') return NextResponse.json({ ok: false, error: 'Unknown action.' }, { status: 400 });

    const params = new URLSearchParams({ limit: '100', sort: 'created_at', order: 'DESC' });
    if (body.cursor) params.set('cursor', body.cursor);

    const r = await realscoutFetch('/contacts', params);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error, status: r.status, retryAfter: r.retryAfter });

    // Carry already-geocoded coordinates forward, but only while the address
    // they were derived from is unchanged — otherwise leave them null so the
    // backfill re-geocodes. Written explicitly rather than relying on the
    // upsert to leave absent columns alone.
    const incoming = r.body.data || [];
    const { data: existing } = await supabaseAdmin
      .from('realscout_contacts')
      .select('id, street, zipcode, lat, lng')
      .in('id', incoming.map((c) => c.id).filter(Boolean));
    const priorById = new Map((existing || []).map((e) => [e.id, e]));

    const rows = incoming.map((c) => ({
      id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      email: c.email,
      primary_mobile_phone: c.primary_mobile_phone,
      street: c.street,
      city: c.city,
      state: c.state,
      zipcode: c.zipcode,
      contact_type: c.contact_type,
      status: c.status?.value || null,
      lead_source: c.lead_source,
      tags: c.tags || [],
      scout_score: c.scout_score,
      last_active_at: c.last_active_at,
      rs_created_at: c.created_at,
      rs_updated_at: c.updated_at,
      archived_at: c.archived_at,
      realscout_url: c.realscout_url,
      ...(() => {
        const prior = priorById.get(c.id);
        const sameAddress = prior && prior.street === c.street && prior.zipcode === c.zipcode;
        return sameAddress ? { lat: prior.lat, lng: prior.lng } : { lat: null, lng: null };
      })(),
      synced_at: new Date().toISOString(),
    }));

    if (rows.length) {
      const { error } = await supabaseAdmin.from('realscout_contacts').upsert(rows, { onConflict: 'id' });
      if (error) {
        console.error('realscout sync upsert error:', error);
        if (error.code === '42P01' || error.code === 'PGRST205') {
          return NextResponse.json({ ok: false, error: 'table_missing' });
        }
        return NextResponse.json({ ok: false, error: 'Could not save contacts.' }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, synced: rows.length, nextCursor: r.body.next_cursor || null, hasMore: !!r.body.has_more });
  } catch (e) {
    console.error('realscout POST error:', e);
    return NextResponse.json({ ok: false, error: 'Server error.' }, { status: 500 });
  }
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

    // The synced copy in Supabase — unlike RealScout's own endpoint this can
    // be filtered by street/city/ZIP, which is the whole point of syncing.
    if (action === 'synced') {
      const name = (url.searchParams.get('name') || '').trim();
      const address = (url.searchParams.get('address') || '').trim();
      const zips = (url.searchParams.get('zip') || '').trim().split(/[,\s]+/).filter(Boolean);
      const contactType = (url.searchParams.get('contact_type') || '').trim();
      const sort = url.searchParams.get('sort') || 'last_active_at';
      const escLike = (s) => s.replace(/[,()]/g, '');

      let q = supabaseAdmin.from('realscout_contacts').select('*');
      if (name) q = q.or(`first_name.ilike.%${escLike(name)}%,last_name.ilike.%${escLike(name)}%,email.ilike.%${escLike(name)}%`);
      if (address) q = q.or(`street.ilike.%${escLike(address)}%,city.ilike.%${escLike(address)}%`);
      if (zips.length) q = q.in('zipcode', zips);
      if (contactType) q = q.eq('contact_type', contactType);

      const { data, error } = await q.order(sort, { ascending: false, nullsFirst: false }).limit(500);
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') return NextResponse.json({ ok: false, error: 'table_missing' });
        console.error(error);
        return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 });
      }

      const { count } = await supabaseAdmin.from('realscout_contacts').select('*', { count: 'exact', head: true });
      const newest = (data || []).reduce((acc, r) => (r.synced_at > acc ? r.synced_at : acc), '');
      return NextResponse.json({ ok: true, contacts: data || [], total: count || 0, lastSyncedAt: newest || null });
    }

    return NextResponse.json({ ok: false, error: 'Unknown action.' }, { status: 400 });
  } catch (e) {
    console.error('realscout GET error:', e);
    return NextResponse.json({ ok: false, error: 'Server error.' }, { status: 500 });
  }
}
