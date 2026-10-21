import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { parseMlsCsv } from '../../../lib/mls';

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

// Fields compared to decide "updated" vs "skipped (no change)" in the upload summary.
const DIFF_FIELDS = [
  'status_normalized', 'current_price', 'close_price', 'orig_list_price',
  'off_market_date', 'close_date', 'listing_contract_date', 'days_on_market',
];

// POST — admin uploads a CSV export.
export async function POST(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();
    if (body.action !== 'upload_csv') {
      return NextResponse.json({ ok: false, error: 'Unknown action.' }, { status: 400 });
    }
    const csvText = (body.csv_text || '').toString();
    const filename = (body.filename || 'upload.csv').toString().slice(0, 200);
    if (!csvText.trim()) {
      return NextResponse.json({ ok: false, error: 'Empty file.' }, { status: 400 });
    }

    const { rows, totalDataRows, skippedNoMlsNumber } = parseMlsCsv(csvText, filename);
    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        summary: { read: totalDataRows, inserted: 0, updated: 0, skipped: skippedNoMlsNumber, flagged: 0 },
      });
    }

    // Look up existing rows for this batch's MLS #s so we can report insert vs
    // update vs no-change — the actual write below is one batched upsert either way.
    const mlsNumbers = rows.map((r) => r.mls_number);
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('mls_listings')
      .select(['mls_number', ...DIFF_FIELDS].join(','))
      .in('mls_number', mlsNumbers);
    if (fetchErr) {
      console.error('market-data fetch-existing error:', fetchErr);
      return NextResponse.json({ ok: false, error: 'Could not read existing rows.' }, { status: 500 });
    }
    const existingByMls = new Map((existing || []).map((r) => [r.mls_number, r]));

    let inserted = 0, updated = 0, skipped = skippedNoMlsNumber, flagged = 0;
    for (const row of rows) {
      if (row.flagged) flagged++;
      const prior = existingByMls.get(row.mls_number);
      if (!prior) { inserted++; continue; }
      const changed = DIFF_FIELDS.some((f) => (prior[f] ?? null) !== (row[f] ?? null));
      if (changed) updated++; else skipped++;
    }

    const { error: upsertErr } = await supabaseAdmin
      .from('mls_listings')
      .upsert(rows, { onConflict: 'mls_number' });
    if (upsertErr) {
      console.error('market-data upsert error:', upsertErr);
      return NextResponse.json({ ok: false, error: 'Upsert failed: ' + (upsertErr.message || '') }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      summary: { read: totalDataRows, inserted, updated, skipped, flagged },
    });
  } catch (e) {
    console.error('market-data POST error:', e);
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}

const SEARCH_FIELDS_PROSPECTS = [
  'group_key', 'apn_normalized', 'flagged', 'last_mls_number', 'address', 'subdivision',
  'neighborhood', 'mls_area', 'property_sub_type', 'beds_total', 'baths_total', 'living_area',
  'lot_size_sqft', 'year_built', 'last_status', 'last_list_price', 'last_current_price',
  'original_list_price', 'last_off_market_date', 'days_since_off_market',
  'total_listings', 'times_listed_without_selling',
];

// GET — admin search (prospects or all history), or a single APN/address-group's timeline.
export async function GET(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });

    const url = new URL(request.url);

    // Timeline for one property group (all listing episodes, oldest to newest).
    const groupKey = url.searchParams.get('group_key');
    if (groupKey) {
      const { data, error } = await supabaseAdmin
        .from('mls_listings')
        .select('*')
        .eq('group_key', groupKey)
        .order('listing_contract_date', { ascending: true, nullsFirst: true });
      if (error) return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 });
      return NextResponse.json({ ok: true, listings: data || [] });
    }

    const prospectsOnly = url.searchParams.get('prospects_only') !== '0'; // default true
    const community = (url.searchParams.get('community') || '').trim();
    const address = (url.searchParams.get('address') || '').trim();
    const status = (url.searchParams.get('status') || 'all').trim();
    const offFrom = url.searchParams.get('off_from') || '';
    const offTo = url.searchParams.get('off_to') || '';
    const priceMin = url.searchParams.get('price_min') || '';
    const priceMax = url.searchParams.get('price_max') || '';
    const beds = url.searchParams.get('beds') || '';
    const subType = (url.searchParams.get('sub_type') || '').trim();
    // Strip characters that are special in PostgREST's .or() mini-syntax so a
    // comma/paren in a search box can't break or smuggle extra filter clauses.
    const escLike = (s) => s.replace(/[,()]/g, '');

    if (prospectsOnly) {
      let q = supabaseAdmin.from('mls_prospects').select(SEARCH_FIELDS_PROSPECTS.join(','));
      if (community) q = q.or(`subdivision.ilike.%${escLike(community)}%,neighborhood.ilike.%${escLike(community)}%,mls_area.ilike.%${escLike(community)}%`);
      if (address) q = q.ilike('address', `%${escLike(address)}%`);
      if (status !== 'all') q = q.eq('last_status', status);
      if (offFrom) q = q.gte('last_off_market_date', offFrom);
      if (offTo) q = q.lte('last_off_market_date', offTo);
      if (priceMin) q = q.gte('last_list_price', Number(priceMin));
      if (priceMax) q = q.lte('last_list_price', Number(priceMax));
      if (beds) q = q.gte('beds_total', Number(beds));
      if (subType) q = q.ilike('property_sub_type', `%${escLike(subType)}%`);
      const { data, error } = await q.order('last_off_market_date', { ascending: false }).limit(500);
      if (error) { console.error(error); return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 }); }
      return NextResponse.json({ ok: true, rows: data || [], mode: 'prospects' });
    }

    // All history — every listing episode, not deduped by APN.
    let q = supabaseAdmin.from('mls_listings').select('*');
    if (community) q = q.or(`subdivision.ilike.%${escLike(community)}%,neighborhood.ilike.%${escLike(community)}%,mls_area.ilike.%${escLike(community)}%`);
    if (address) q = q.ilike('address', `%${escLike(address)}%`);
    if (status !== 'all') q = q.eq('status_normalized', status);
    if (offFrom) q = q.gte('off_market_date', offFrom);
    if (offTo) q = q.lte('off_market_date', offTo);
    if (priceMin) q = q.gte('orig_list_price', Number(priceMin));
    if (priceMax) q = q.lte('orig_list_price', Number(priceMax));
    if (beds) q = q.gte('beds_total', Number(beds));
    if (subType) q = q.ilike('property_sub_type', `%${escLike(subType)}%`);
    const { data, error } = await q.order('uploaded_at', { ascending: false }).limit(500);
    if (error) { console.error(error); return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 }); }
    return NextResponse.json({ ok: true, rows: data || [], mode: 'all' });
  } catch (e) {
    console.error('market-data GET error:', e);
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
