import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { parseMlsCsv } from '../../../lib/mls';
import { geocodeAddress } from '../../../lib/sheets';

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

// This Supabase project enforces a hard 1000-row cap per request regardless of
// .limit() — confirmed directly against production data. buildQuery must return
// a FRESH query (with filters/order already applied, no .range()) each call,
// since a query builder can't be reused across requests.
async function fetchAllPaginated(buildQuery, cap = 20000) {
  const pageSize = 1000;
  let all = [];
  let from = 0;
  while (all.length < cap) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { data: all, error: null };
}

// POST — admin uploads a CSV export.
export async function POST(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();

    // Geocode a small batch of not-yet-mapped addresses (bounded per call so it
    // never risks a serverless timeout — the UI loops this until none remain).
    if (body.action === 'geocode_batch') {
      const limit = Math.min(Number(body.limit) || 25, 50);
      const { data: candidates, error: candErr } = await supabaseAdmin
        .from('mls_listings')
        .select('address, postal_code')
        .is('lat', null)
        .not('address', 'is', null)
        .order('id', { ascending: true })
        .limit(2000);
      if (candErr) {
        console.error('market-data geocode candidates error:', candErr);
        return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 });
      }

      const seen = new Map();
      for (const c of candidates || []) {
        const key = (c.address || '').trim().toLowerCase();
        if (!seen.has(key)) seen.set(key, { address: c.address, postal_code: c.postal_code });
        if (seen.size >= limit) break;
      }

      let geocoded = 0, failed = 0;
      for (const { address, postal_code } of seen.values()) {
        const geo = await geocodeAddress(address, postal_code);
        if (geo && geo.lat != null) {
          geocoded++;
          await supabaseAdmin.from('mls_listings').update({ lat: geo.lat, lng: geo.lng }).eq('address', address);
        } else {
          failed++;
          // 0,0 is a sentinel for "tried, couldn't geocode" so it isn't retried every
          // batch forever — the map already treats falsy lat/lng as "not plottable".
          await supabaseAdmin.from('mls_listings').update({ lat: 0, lng: 0 }).eq('address', address);
        }
      }

      const { count: remaining } = await supabaseAdmin
        .from('mls_listings').select('*', { count: 'exact', head: true }).is('lat', null).not('address', 'is', null);

      return NextResponse.json({ ok: true, geocoded, failed, processed: seen.size, remaining: remaining || 0 });
    }

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
    // A single .in() filter breaks once the list gets into the ~1500-1800 range
    // (the request itself fails), so chunk it for large uploads.
    const mlsNumbers = rows.map((r) => r.mls_number);
    const CHUNK = 500;
    const existingByMls = new Map();
    for (let i = 0; i < mlsNumbers.length; i += CHUNK) {
      const chunk = mlsNumbers.slice(i, i + CHUNK);
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from('mls_listings')
        .select(['mls_number', ...DIFF_FIELDS].join(','))
        .in('mls_number', chunk);
      if (fetchErr) {
        console.error('market-data fetch-existing error:', fetchErr);
        return NextResponse.json({ ok: false, error: 'Could not read existing rows.' }, { status: 500 });
      }
      for (const r of existing || []) existingByMls.set(r.mls_number, r);
    }

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
  'group_key', 'apn_normalized', 'flagged', 'last_id', 'last_mls_number', 'starred', 'tag', 'address', 'subdivision',
  'neighborhood', 'mls_area', 'property_sub_type', 'beds_total', 'baths_total', 'living_area',
  'lot_size_sqft', 'year_built', 'last_status', 'last_list_price', 'last_current_price',
  'original_list_price', 'last_off_market_date', 'days_since_off_market',
  'total_listings', 'times_listed_without_selling', 'lat', 'lng',
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
        .order('listing_contract_date', { ascending: false, nullsFirst: false });
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
    const sqftMin = url.searchParams.get('sqft_min') || '';
    const sqftMax = url.searchParams.get('sqft_max') || '';
    const beds = url.searchParams.get('beds') || '';
    const subType = (url.searchParams.get('sub_type') || '').trim();
    // Strip characters that are special in PostgREST's .or() mini-syntax so a
    // comma/paren in a search box can't break or smuggle extra filter clauses.
    const escLike = (s) => s.replace(/[,()]/g, '');

    if (prospectsOnly) {
      // lat/lng were added in a later migration — if it hasn't been run yet on this
      // database, selecting them by name 400s the whole query (PostgREST error
      // 42703). Fall back to the same search without them rather than show nothing.
      const buildProspectsQuery = (fields) => () => {
        let q = supabaseAdmin.from('mls_prospects').select(fields.join(','));
        if (community) q = q.or(`subdivision.ilike.%${escLike(community)}%,neighborhood.ilike.%${escLike(community)}%,mls_area.ilike.%${escLike(community)}%`);
        if (address) q = q.ilike('address', `%${escLike(address)}%`);
        if (status !== 'all') q = q.eq('last_status', status);
        if (offFrom) q = q.gte('last_off_market_date', offFrom);
        if (offTo) q = q.lte('last_off_market_date', offTo);
        if (priceMin) q = q.gte('last_list_price', Number(priceMin));
        if (priceMax) q = q.lte('last_list_price', Number(priceMax));
        if (sqftMin) q = q.gte('living_area', Number(sqftMin));
        if (sqftMax) q = q.lte('living_area', Number(sqftMax));
        if (beds) q = q.gte('beds_total', Number(beds));
        if (subType) q = q.ilike('property_sub_type', `%${escLike(subType)}%`);
        return q.order('last_off_market_date', { ascending: false });
      };

      let { data, error } = await fetchAllPaginated(buildProspectsQuery(SEARCH_FIELDS_PROSPECTS));
      if (error && error.code === '42703') {
        ({ data, error } = await fetchAllPaginated(buildProspectsQuery(SEARCH_FIELDS_PROSPECTS.filter((f) => f !== 'lat' && f !== 'lng'))));
      }
      if (error) { console.error(error); return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 }); }
      return NextResponse.json({ ok: true, rows: data || [], mode: 'prospects' });
    }

    // All history — every listing episode, not deduped by APN.
    const buildAllHistoryQuery = () => {
      let q = supabaseAdmin.from('mls_listings').select('*');
      if (community) q = q.or(`subdivision.ilike.%${escLike(community)}%,neighborhood.ilike.%${escLike(community)}%,mls_area.ilike.%${escLike(community)}%`);
      if (address) q = q.ilike('address', `%${escLike(address)}%`);
      if (status !== 'all') q = q.eq('status_normalized', status);
      if (offFrom) q = q.gte('off_market_date', offFrom);
      if (offTo) q = q.lte('off_market_date', offTo);
      if (priceMin) q = q.gte('orig_list_price', Number(priceMin));
      if (priceMax) q = q.lte('orig_list_price', Number(priceMax));
      if (sqftMin) q = q.gte('living_area', Number(sqftMin));
      if (sqftMax) q = q.lte('living_area', Number(sqftMax));
      if (beds) q = q.gte('beds_total', Number(beds));
      if (subType) q = q.ilike('property_sub_type', `%${escLike(subType)}%`);
      return q.order('uploaded_at', { ascending: false });
    };
    const { data, error } = await fetchAllPaginated(buildAllHistoryQuery);
    if (error) { console.error(error); return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 }); }

    // Mark rows that are currently the live prospect for their group, so "All
    // history" can visually flag them even though every row there isn't one.
    const { data: prospectMls } = await fetchAllPaginated(() => supabaseAdmin.from('mls_prospects').select('last_mls_number'));
    const prospectSet = new Set((prospectMls || []).map((p) => p.last_mls_number));
    const rows = (data || []).map((r) => ({ ...r, is_current_prospect: prospectSet.has(r.mls_number) }));

    return NextResponse.json({ ok: true, rows, mode: 'all' });
  } catch (e) {
    console.error('market-data GET error:', e);
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}

// PUT — admin toggles star / sets a tag on one listing episode.
export async function PUT(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();
    const mlsNumber = (body.mls_number || '').toString();
    if (!mlsNumber) return NextResponse.json({ ok: false, error: 'mls_number required.' }, { status: 400 });

    const update = {};
    if (body.starred != null) update.starred = body.starred === true || body.starred === 'true';
    if (body.tag != null) update.tag = body.tag.toString().slice(0, 80);
    if (Object.keys(update).length === 0) return NextResponse.json({ ok: false, error: 'Nothing to update.' }, { status: 400 });
    update.updated_at = new Date().toISOString();

    const { error } = await supabaseAdmin.from('mls_listings').update(update).eq('mls_number', mlsNumber);
    if (error) { console.error(error); return NextResponse.json({ ok: false, error: 'Could not save.' }, { status: 500 }); }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('market-data PUT error:', e);
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
