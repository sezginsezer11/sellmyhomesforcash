import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { parseMlsCsv } from '../../../lib/mls';
import { geocodeAddress } from '../../../lib/sheets';
import { parseKml, matchCommunity } from '../../../lib/kml';

// Geocodes a batch concurrently (a few at a time) instead of one address at a
// time — each address is otherwise 2-4 sequential network round trips (cache
// lookup, Google API, cache write, DB write), which made a 25-address batch
// take 10-20s. 5 at once is a safe margin under Google's rate limits while
// cutting wall-clock time roughly 5x.
async function geocodeSeenAddresses(seen, concurrency = 5) {
  const entries = Array.from(seen.values());
  let geocoded = 0, failed = 0;
  for (let i = 0; i < entries.length; i += concurrency) {
    const slice = entries.slice(i, i + concurrency);
    await Promise.all(slice.map(async ({ address, postal_code }) => {
      const geo = await geocodeAddress(address, postal_code);
      if (geo && geo.lat != null) {
        geocoded++;
        await supabaseAdmin.from('mls_listings').update({ lat: geo.lat, lng: geo.lng }).eq('address', address);
      } else {
        failed++;
        // 0,0 is a sentinel for "tried, couldn't geocode" so it isn't retried
        // every batch forever — falsy lat/lng is already treated as "not plottable".
        await supabaseAdmin.from('mls_listings').update({ lat: 0, lng: 0 }).eq('address', address);
      }
    }));
  }
  return { geocoded, failed };
}

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

function slugify(s) {
  return (s || '').toString().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
function rand(n = 4) {
  return Math.random().toString(36).slice(2, 2 + n);
}

// The public share page never sees MLS status, price, days-on-market, MLS #,
// or APN — only what's safe to hand a client directly (per explicit MLS
// compliance decision: the admin tool's data stays admin-only otherwise).
const PUBLIC_LIST_FIELDS = [
  'group_key', 'address', 'postal_code', 'community_name', 'subdivision', 'neighborhood', 'mls_area',
  'property_sub_type', 'beds_total', 'baths_total', 'living_area', 'lot_size_sqft',
  'year_built', 'lat', 'lng', 'off_market_date',
];
function toPublicListRow(r) {
  const out = {};
  for (const f of PUBLIC_LIST_FIELDS) out[f] = r[f] ?? null;
  return out;
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

// Attaches list_names (array) to each row — a property can be on multiple
// lists at once (mls_list_items has no unique-per-property constraint, only
// unique-per-list-per-property), same as tags. Degrades silently to no
// list_names rather than breaking search if the lists tables aren't there.
async function attachListMemberships(rows) {
  try {
    const groupKeys = [...new Set(rows.map((r) => r.group_key).filter(Boolean))];
    if (!groupKeys.length) return rows;
    const CHUNK = 500;
    let items = [];
    for (let i = 0; i < groupKeys.length; i += CHUNK) {
      const chunk = groupKeys.slice(i, i + CHUNK);
      const { data, error } = await fetchAllPaginated(() => supabaseAdmin.from('mls_list_items').select('group_key, list_id').in('group_key', chunk));
      if (error) return rows;
      items = items.concat(data || []);
    }
    if (!items.length) return rows.map((r) => ({ ...r, list_names: [] }));
    const listIds = [...new Set(items.map((i) => i.list_id))];
    const { data: listsData, error: listsErr } = await fetchAllPaginated(() => supabaseAdmin.from('mls_lists').select('id, name').in('id', listIds));
    if (listsErr) return rows;
    const nameById = new Map((listsData || []).map((l) => [l.id, l.name]));
    const namesByGroup = new Map();
    for (const it of items) {
      if (!namesByGroup.has(it.group_key)) namesByGroup.set(it.group_key, []);
      namesByGroup.get(it.group_key).push(nameById.get(it.list_id) || '');
    }
    return rows.map((r) => ({ ...r, list_names: namesByGroup.get(r.group_key) || [] }));
  } catch (e) {
    console.error('attachListMemberships error:', e);
    return rows;
  }
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

      const { geocoded, failed } = await geocodeSeenAddresses(seen);

      const { count: remaining } = await supabaseAdmin
        .from('mls_listings').select('*', { count: 'exact', head: true }).is('lat', null).not('address', 'is', null);

      return NextResponse.json({ ok: true, geocoded, failed, processed: seen.size, remaining: remaining || 0 });
    }

    // Same bounded-batch shape as geocode_batch, but scoped to addresses that
    // belong to a CURRENT prospect (mls_prospects) — far cheaper than
    // geocoding the entire history table when only prospects need a pin.
    if (body.action === 'geocode_prospects_batch') {
      const limit = Math.min(Number(body.limit) || 25, 50);
      const { data: candidates, error: candErr } = await supabaseAdmin
        .from('mls_prospects')
        .select('address, postal_code')
        .is('lat', null)
        .not('address', 'is', null)
        .order('group_key', { ascending: true })
        .limit(2000);
      if (candErr) {
        console.error('market-data geocode-prospects candidates error:', candErr);
        return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 });
      }

      const seen = new Map();
      for (const c of candidates || []) {
        const key = (c.address || '').trim().toLowerCase();
        if (!seen.has(key)) seen.set(key, { address: c.address, postal_code: c.postal_code });
        if (seen.size >= limit) break;
      }

      const { geocoded, failed } = await geocodeSeenAddresses(seen);

      const { count: remaining } = await supabaseAdmin
        .from('mls_prospects').select('*', { count: 'exact', head: true }).is('lat', null).not('address', 'is', null);

      return NextResponse.json({ ok: true, geocoded, failed, processed: seen.size, remaining: remaining || 0 });
    }

    // Replaces the whole community_boundaries table with a freshly-uploaded
    // KML export (the admin re-exports and re-uploads the entire map each
    // time it's updated, rather than diffing individual shapes).
    if (body.action === 'import_community_kml') {
      const kmlText = (body.kml_text || '').toString();
      if (!kmlText.trim()) return NextResponse.json({ ok: false, error: 'Empty file.' }, { status: 400 });
      const parsed = parseKml(kmlText);
      if (!parsed.length) return NextResponse.json({ ok: false, error: 'No placemarks found in this KML.' }, { status: 400 });

      const { error: delErr } = await supabaseAdmin.from('community_boundaries').delete().not('id', 'is', null);
      if (delErr) { console.error(delErr); return NextResponse.json({ ok: false, error: 'Could not clear old boundaries.' }, { status: 500 }); }

      const rows = parsed.map((p) => ({ name: p.name, layer: p.layer, geometry_type: p.type, ring: p.ring }));
      const { error: insErr } = await supabaseAdmin.from('community_boundaries').insert(rows);
      if (insErr) { console.error(insErr); return NextResponse.json({ ok: false, error: 'Could not save boundaries.' }, { status: 500 }); }

      // The new shapes may not match the old ones (renamed/redrawn) — clear
      // existing matches so "Match communities" re-checks everything fresh.
      // Manually-assigned communities are a deliberate admin override, not a
      // polygon match, so a re-import must never wipe them out.
      await supabaseAdmin.from('mls_listings').update({ community_name: null })
        .not('community_name', 'is', null).eq('community_manual', false);

      return NextResponse.json({ ok: true, imported: rows.length, polygons: rows.filter((r) => r.geometry_type === 'polygon').length });
    }

    // Matches a bounded batch of not-yet-checked, geocoded listings against the
    // uploaded community polygons — same looped-bounded-batch shape as geocoding.
    if (body.action === 'match_communities') {
      const limit = Math.min(Number(body.limit) || 200, 500);
      const { data: polygons, error: polyErr } = await supabaseAdmin.from('community_boundaries').select('name, geometry_type, ring');
      if (polyErr) { console.error(polyErr); return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 }); }
      if (!polygons || !polygons.length) return NextResponse.json({ ok: false, error: 'No community boundaries uploaded yet.' }, { status: 400 });

      const { data: candidates, error: candErr } = await supabaseAdmin
        .from('mls_listings')
        .select('id, lat, lng')
        .is('community_name', null)
        .not('lat', 'is', null)
        .neq('lat', 0)
        .order('id', { ascending: true })
        .limit(limit);
      if (candErr) { console.error(candErr); return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 }); }

      // Point-in-polygon is computed locally (cheap); only the write is a
      // network round trip, so those run a few at a time concurrently —
      // same bounded-concurrency fix already applied to geocoding/schools.
      let matched = 0, unmatched = 0;
      const CONCURRENCY = 10;
      const communityItems = candidates || [];
      for (let i = 0; i < communityItems.length; i += CONCURRENCY) {
        const slice = communityItems.slice(i, i + CONCURRENCY);
        await Promise.all(slice.map(async (row) => {
          const name = matchCommunity(Number(row.lat), Number(row.lng), polygons);
          if (name) matched++; else unmatched++;
          // '' (not null) marks "checked, no polygon contains this point" so it isn't retried forever.
          await supabaseAdmin.from('mls_listings').update({ community_name: name || '' }).eq('id', row.id);
        }));
      }

      const { count: remaining } = await supabaseAdmin
        .from('mls_listings').select('*', { count: 'exact', head: true }).is('community_name', null).not('lat', 'is', null).neq('lat', 0);

      return NextResponse.json({ ok: true, matched, unmatched, processed: (candidates || []).length, remaining: remaining || 0 });
    }

    // Hand-assigns a community to every episode of a property group — for
    // addresses that fall outside every drawn polygon (edge-of-map lots,
    // not-yet-mapped pockets) but clearly belong to a known community.
    // Flagged community_manual so a future KML re-import never overwrites it.
    if (body.action === 'set_manual_community') {
      const groupKey = (body.group_key || '').toString();
      const communityName = (body.community_name || '').toString().trim().slice(0, 120);
      if (!groupKey || !communityName) return NextResponse.json({ ok: false, error: 'group_key and community_name required.' }, { status: 400 });
      const { error } = await supabaseAdmin
        .from('mls_listings')
        .update({ community_name: communityName, community_manual: true })
        .eq('group_key', groupKey);
      if (error) { console.error(error); return NextResponse.json({ ok: false, error: 'Could not save.' }, { status: 500 }); }
      return NextResponse.json({ ok: true, community_name: communityName });
    }

    // Reverts a manual assignment back to unmatched so it's picked up by the
    // normal polygon-matching run again (e.g. after a map update).
    if (body.action === 'clear_manual_community') {
      const groupKey = (body.group_key || '').toString();
      if (!groupKey) return NextResponse.json({ ok: false, error: 'group_key required.' }, { status: 400 });
      const { error } = await supabaseAdmin
        .from('mls_listings')
        .update({ community_name: null, community_manual: false })
        .eq('group_key', groupKey);
      if (error) { console.error(error); return NextResponse.json({ ok: false, error: 'Could not clear.' }, { status: 500 }); }
      return NextResponse.json({ ok: true });
    }

    // Replaces one district's school-boundary shapes with a freshly-uploaded
    // KML export. Level ('elementary'/'middle'/'high') is read off each
    // placemark's folder name — one file can carry multiple levels (e.g. a
    // high-school district's KML with separate "Middle School"/"High School"
    // folders) and each gets bucketed correctly. Scoped to `district` so
    // re-importing one district's map never touches another's shapes.
    if (body.action === 'import_school_kml') {
      const kmlText = (body.kml_text || '').toString();
      const district = (body.district || '').toString().trim().slice(0, 160);
      if (!kmlText.trim()) return NextResponse.json({ ok: false, error: 'Empty file.' }, { status: 400 });
      if (!district) return NextResponse.json({ ok: false, error: 'District name required.' }, { status: 400 });
      const parsed = parseKml(kmlText);
      if (!parsed.length) return NextResponse.json({ ok: false, error: 'No placemarks found in this KML.' }, { status: 400 });

      const LEVEL_KEYWORDS = [['elementary', 'elementary'], ['middle', 'middle'], ['high', 'high']];
      const rows = [];
      let skipped = 0;
      for (const p of parsed) {
        if (p.type !== 'polygon') { skipped++; continue; }
        const layerLower = (p.layer || '').toLowerCase();
        const level = (LEVEL_KEYWORDS.find(([kw]) => layerLower.includes(kw)) || [])[1];
        if (!level) { skipped++; continue; }
        rows.push({ name: p.name, level, district, geometry_type: p.type, ring: p.ring });
      }
      if (!rows.length) {
        return NextResponse.json({ ok: false, error: 'No polygons with a recognizable level (folder name must contain "elementary", "middle", or "high").' }, { status: 400 });
      }

      const { error: delErr } = await supabaseAdmin.from('school_boundaries').delete().eq('district', district);
      if (delErr) { console.error(delErr); return NextResponse.json({ ok: false, error: 'Could not clear old boundaries.' }, { status: 500 }); }

      const { error: insErr } = await supabaseAdmin.from('school_boundaries').insert(rows);
      if (insErr) { console.error(insErr); return NextResponse.json({ ok: false, error: 'Could not save boundaries.' }, { status: 500 }); }

      // Shapes may have changed — clear existing matches for the levels this
      // import touched so "Match schools" re-checks everything fresh.
      const levelsTouched = [...new Set(rows.map((r) => r.level))];
      const LEVEL_COLUMN = { elementary: 'elementary_school', middle: 'middle_school', high: 'high_school' };
      for (const level of levelsTouched) {
        const col = LEVEL_COLUMN[level];
        await supabaseAdmin.from('mls_listings').update({ [col]: null }).not(col, 'is', null);
      }

      return NextResponse.json({ ok: true, imported: rows.length, skipped, levels: levelsTouched });
    }

    // Matches a bounded batch of not-yet-checked, geocoded listings against the
    // uploaded school polygons for one level — same looped-bounded-batch shape
    // as match_communities.
    if (body.action === 'match_schools') {
      const level = (body.level || '').toString();
      const LEVEL_COLUMN = { elementary: 'elementary_school', middle: 'middle_school', high: 'high_school' };
      const col = LEVEL_COLUMN[level];
      if (!col) return NextResponse.json({ ok: false, error: 'level must be elementary, middle, or high.' }, { status: 400 });

      const limit = Math.min(Number(body.limit) || 200, 500);
      const { data: polygons, error: polyErr } = await supabaseAdmin.from('school_boundaries').select('name, geometry_type, ring').eq('level', level);
      if (polyErr) { console.error(polyErr); return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 }); }
      if (!polygons || !polygons.length) return NextResponse.json({ ok: false, error: `No ${level}-school boundaries uploaded yet.` }, { status: 400 });

      const { data: candidates, error: candErr } = await supabaseAdmin
        .from('mls_listings')
        .select('id, lat, lng')
        .is(col, null)
        .not('lat', 'is', null)
        .neq('lat', 0)
        .order('id', { ascending: true })
        .limit(limit);
      if (candErr) { console.error(candErr); return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 }); }

      // Point-in-polygon is computed locally (cheap); only the write is a
      // network round trip, so those run a few at a time concurrently —
      // same bounded-concurrency fix already applied to geocoding.
      let matched = 0, unmatched = 0;
      const CONCURRENCY = 10;
      const items = candidates || [];
      for (let i = 0; i < items.length; i += CONCURRENCY) {
        const slice = items.slice(i, i + CONCURRENCY);
        await Promise.all(slice.map(async (row) => {
          const name = matchCommunity(Number(row.lat), Number(row.lng), polygons);
          if (name) matched++; else unmatched++;
          // '' (not null) marks "checked, no polygon contains this point" so it isn't retried forever.
          await supabaseAdmin.from('mls_listings').update({ [col]: name || '' }).eq('id', row.id);
        }));
      }

      const { count: remaining } = await supabaseAdmin
        .from('mls_listings').select('*', { count: 'exact', head: true }).is(col, null).not('lat', 'is', null).neq('lat', 0);

      return NextResponse.json({ ok: true, matched, unmatched, processed: (candidates || []).length, remaining: remaining || 0 });
    }

    if (body.action === 'create_list') {
      const name = (body.name || '').toString().trim().slice(0, 120);
      if (!name) return NextResponse.json({ ok: false, error: 'List name required.' }, { status: 400 });
      const { data, error } = await supabaseAdmin.from('mls_lists').insert({ name }).select('*').single();
      if (error) { console.error(error); return NextResponse.json({ ok: false, error: 'Could not create list.' }, { status: 500 }); }
      return NextResponse.json({ ok: true, list: data });
    }

    if (body.action === 'rename_list') {
      const listId = (body.list_id || '').toString();
      const name = (body.name || '').toString().trim().slice(0, 120);
      if (!listId || !name) return NextResponse.json({ ok: false, error: 'list_id and name required.' }, { status: 400 });
      const { error } = await supabaseAdmin.from('mls_lists').update({ name, updated_at: new Date().toISOString() }).eq('id', listId);
      if (error) return NextResponse.json({ ok: false, error: 'Could not rename list.' }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'get_share_link') {
      const listId = (body.list_id || '').toString();
      if (!listId) return NextResponse.json({ ok: false, error: 'list_id required.' }, { status: 400 });
      const { data: list, error: getErr } = await supabaseAdmin.from('mls_lists').select('*').eq('id', listId).single();
      if (getErr || !list) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
      if (list.slug) return NextResponse.json({ ok: true, slug: list.slug });

      let base = slugify(list.name) || 'list';
      let slug = base + '-' + rand(4);
      for (let i = 0; i < 4; i++) {
        const { data: clash } = await supabaseAdmin.from('mls_lists').select('id').eq('slug', slug).single();
        if (!clash) break;
        slug = base + '-' + rand(5);
      }
      const { error: saveErr } = await supabaseAdmin.from('mls_lists').update({ slug }).eq('id', listId);
      if (saveErr) { console.error(saveErr); return NextResponse.json({ ok: false, error: 'Could not create share link.' }, { status: 500 }); }
      return NextResponse.json({ ok: true, slug });
    }

    if (body.action === 'revoke_share_link') {
      const listId = (body.list_id || '').toString();
      if (!listId) return NextResponse.json({ ok: false, error: 'list_id required.' }, { status: 400 });
      const { error } = await supabaseAdmin.from('mls_lists').update({ slug: null }).eq('id', listId);
      if (error) return NextResponse.json({ ok: false, error: 'Could not revoke share link.' }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // Records a sale that happened off-MLS (never shows up in any CSV export) —
    // inserted as a normal mls_listings row with a synthetic MLS #, so the
    // existing "latest episode per group_key" logic mls_prospects already uses
    // picks it up automatically: a sale date after the last real episode makes
    // status_normalized='sold' win, which drops the property out of Prospects
    // with no special-casing anywhere else. Re-uploading real MLS data later
    // never touches this row (different mls_number), so it can't be clobbered.
    if (body.action === 'add_manual_sale') {
      const groupKey = (body.group_key || '').toString();
      const saleDate = (body.sale_date || '').toString();
      const salePrice = body.sale_price != null && body.sale_price !== '' ? Number(body.sale_price) : null;
      const notes = (body.notes || '').toString().slice(0, 500);
      if (!groupKey || !saleDate) return NextResponse.json({ ok: false, error: 'group_key and sale_date required.' }, { status: 400 });

      const { data: ref, error: refErr } = await supabaseAdmin
        .from('mls_listings').select('*').eq('group_key', groupKey).order('id', { ascending: false }).limit(1).single();
      if (refErr || !ref) return NextResponse.json({ ok: false, error: 'Property not found.' }, { status: 404 });

      const insert = {
        mls_number: `MANUAL-${groupKey}-${Date.now()}`,
        apn_raw: ref.apn_raw, apn_normalized: ref.apn_normalized, address_key: ref.address_key,
        group_key: groupKey, flagged: ref.flagged,
        address: ref.address, postal_code: ref.postal_code,
        subdivision: ref.subdivision, neighborhood: ref.neighborhood, mls_area: ref.mls_area,
        property_sub_type: ref.property_sub_type, beds_total: ref.beds_total, baths_total: ref.baths_total,
        living_area: ref.living_area, lot_size_sqft: ref.lot_size_sqft, year_built: ref.year_built,
        orig_list_price: salePrice, current_price: salePrice, close_price: salePrice,
        listing_contract_date: saleDate, off_market_date: saleDate, close_date: saleDate,
        status_raw: 'Off-MLS sale (manual entry)', status_normalized: 'sold',
        raw: { manual: true, notes, added_at: new Date().toISOString() },
        source_filename: 'manual-entry',
      };
      // lat/lng/community_name were added in later migrations — keep this working
      // even if one hasn't been run on this database yet.
      if ('lat' in ref) insert.lat = ref.lat;
      if ('lng' in ref) insert.lng = ref.lng;
      if ('community_name' in ref) insert.community_name = ref.community_name;

      const { error } = await supabaseAdmin.from('mls_listings').insert(insert);
      if (error) { console.error(error); return NextResponse.json({ ok: false, error: 'Could not save.' }, { status: 500 }); }
      return NextResponse.json({ ok: true, mls_number: insert.mls_number });
    }

    if (body.action === 'remove_manual_sale') {
      const mlsNumber = (body.mls_number || '').toString();
      if (!mlsNumber.startsWith('MANUAL-')) return NextResponse.json({ ok: false, error: 'Invalid.' }, { status: 400 });
      const { error } = await supabaseAdmin.from('mls_listings').delete().eq('mls_number', mlsNumber);
      if (error) { console.error(error); return NextResponse.json({ ok: false, error: 'Could not remove.' }, { status: 500 }); }
      return NextResponse.json({ ok: true });
    }

    // Shares a selection directly, with no existing/named list required — still
    // backed by a real (auto-named) list under the hood, since that's what the
    // slug/revoke machinery is built on, but the admin never has to name one.
    if (body.action === 'quick_share') {
      const groupKeys = Array.isArray(body.group_keys) ? body.group_keys.filter(Boolean) : [];
      if (!groupKeys.length) return NextResponse.json({ ok: false, error: 'group_keys required.' }, { status: 400 });

      const name = `Shared selection — ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
      const { data: list, error: listErr } = await supabaseAdmin.from('mls_lists').insert({ name }).select('*').single();
      if (listErr) { console.error(listErr); return NextResponse.json({ ok: false, error: 'Could not create share.' }, { status: 500 }); }

      const itemRows = groupKeys.map((gk) => ({ list_id: list.id, group_key: gk.toString() }));
      const { error: itemsErr } = await supabaseAdmin.from('mls_list_items').upsert(itemRows, { onConflict: 'list_id,group_key', ignoreDuplicates: true });
      if (itemsErr) { console.error(itemsErr); return NextResponse.json({ ok: false, error: 'Could not add properties.' }, { status: 500 }); }

      let base = slugify(name) || 'shared';
      let slug = base + '-' + rand(4);
      for (let i = 0; i < 4; i++) {
        const { data: clash } = await supabaseAdmin.from('mls_lists').select('id').eq('slug', slug).single();
        if (!clash) break;
        slug = base + '-' + rand(5);
      }
      const { error: slugErr } = await supabaseAdmin.from('mls_lists').update({ slug }).eq('id', list.id);
      if (slugErr) { console.error(slugErr); return NextResponse.json({ ok: false, error: 'Could not create share link.' }, { status: 500 }); }
      return NextResponse.json({ ok: true, slug, list_id: list.id, list_name: name });
    }

    if (body.action === 'delete_list') {
      const listId = (body.list_id || '').toString();
      if (!listId) return NextResponse.json({ ok: false, error: 'list_id required.' }, { status: 400 });
      const { error } = await supabaseAdmin.from('mls_lists').delete().eq('id', listId);
      if (error) return NextResponse.json({ ok: false, error: 'Could not delete list.' }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'add_to_list') {
      const listId = (body.list_id || '').toString();
      const groupKeys = Array.isArray(body.group_keys) ? body.group_keys.filter(Boolean) : [];
      if (!listId || !groupKeys.length) return NextResponse.json({ ok: false, error: 'list_id and group_keys required.' }, { status: 400 });
      const rows = groupKeys.map((gk) => ({ list_id: listId, group_key: gk.toString() }));
      const { error } = await supabaseAdmin.from('mls_list_items').upsert(rows, { onConflict: 'list_id,group_key', ignoreDuplicates: true });
      if (error) { console.error(error); return NextResponse.json({ ok: false, error: 'Could not add to list.' }, { status: 500 }); }
      await supabaseAdmin.from('mls_lists').update({ updated_at: new Date().toISOString() }).eq('id', listId);
      return NextResponse.json({ ok: true, added: rows.length });
    }

    if (body.action === 'remove_from_list') {
      const listId = (body.list_id || '').toString();
      const groupKey = (body.group_key || '').toString();
      if (!listId || !groupKey) return NextResponse.json({ ok: false, error: 'list_id and group_key required.' }, { status: 400 });
      const { error } = await supabaseAdmin.from('mls_list_items').delete().eq('list_id', listId).eq('group_key', groupKey);
      if (error) return NextResponse.json({ ok: false, error: 'Could not remove item.' }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (body.action !== 'upload_csv') {
      return NextResponse.json({ ok: false, error: 'Unknown action.' }, { status: 400 });
    }
    const csvText = (body.csv_text || '').toString();
    const filename = (body.filename || 'upload.csv').toString().slice(0, 200);
    const uploadName = (body.name || '').toString().trim().slice(0, 120);
    if (!uploadName) {
      return NextResponse.json({ ok: false, error: 'Upload name required.' }, { status: 400 });
    }
    if (!csvText.trim()) {
      return NextResponse.json({ ok: false, error: 'Empty file.' }, { status: 400 });
    }

    // Degrades silently if mls_uploads isn't there yet — never breaks the
    // actual CSV upload, which is the part that matters.
    const recordUpload = async (summary) => {
      try {
        await supabaseAdmin.from('mls_uploads').insert({
          name: uploadName, filename,
          read_count: summary.read, inserted_count: summary.inserted,
          updated_count: summary.updated, skipped_count: summary.skipped, flagged_count: summary.flagged,
        });
      } catch (e) { console.error('mls_uploads insert error:', e); }
    };

    const { rows, totalDataRows, skippedNoMlsNumber } = parseMlsCsv(csvText, filename);
    if (rows.length === 0) {
      const summary = { read: totalDataRows, inserted: 0, updated: 0, skipped: skippedNoMlsNumber, flagged: 0 };
      await recordUpload(summary);
      return NextResponse.json({ ok: true, summary });
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

    const summary = { read: totalDataRows, inserted, updated, skipped, flagged };
    await recordUpload(summary);
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    console.error('market-data POST error:', e);
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}

const SEARCH_FIELDS_PROSPECTS = [
  'group_key', 'apn_normalized', 'flagged', 'last_id', 'last_mls_number', 'starred', 'tag', 'address', 'postal_code', 'community_name', 'subdivision',
  'neighborhood', 'mls_area', 'property_sub_type', 'beds_total', 'baths_total', 'living_area',
  'lot_size_sqft', 'year_built', 'last_status', 'last_list_price', 'last_current_price',
  'original_list_price', 'last_off_market_date', 'days_since_off_market',
  'total_listings', 'times_listed_without_selling', 'lat', 'lng',
  'elementary_school', 'middle_school', 'high_school',
];

// GET — admin search (prospects or all history), a single APN/address-group's
// timeline, or a public shared list by slug (no auth — see PUBLIC_LIST_FIELDS).
export async function GET(request) {
  try {
    const url = new URL(request.url);

    // Public, read-only list view (what a client sees via the share link).
    // Same "most recent episode wins" resolution as the admin list view, but
    // stripped to PUBLIC_LIST_FIELDS and with no auth required.
    const publicSlug = url.searchParams.get('public_slug');
    if (publicSlug) {
      const { data: list, error: listErr } = await supabaseAdmin.from('mls_lists').select('id, name, slug').eq('slug', publicSlug).single();
      if (listErr || !list) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

      const { data: items } = await fetchAllPaginated(() => supabaseAdmin.from('mls_list_items').select('group_key').eq('list_id', list.id));
      const groupKeys = (items || []).map((i) => i.group_key);
      if (!groupKeys.length) return NextResponse.json({ ok: true, list: { name: list.name }, rows: [] });

      const CHUNK = 500;
      let listings = [];
      for (let i = 0; i < groupKeys.length; i += CHUNK) {
        const chunk = groupKeys.slice(i, i + CHUNK);
        const { data, error } = await fetchAllPaginated(() => supabaseAdmin.from('mls_listings').select('*').in('group_key', chunk));
        if (error) { console.error(error); return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 }); }
        listings = listings.concat(data || []);
      }

      const eventDate = (r) => r.close_date || r.off_market_date || r.listing_contract_date || null;
      const byGroup = new Map();
      for (const r of listings) {
        if (!byGroup.has(r.group_key)) byGroup.set(r.group_key, []);
        byGroup.get(r.group_key).push(r);
      }
      const rank = (r) => (['sold', 'active', 'pending'].includes(r.status_normalized) ? 0 : 1);
      const rows = [];
      for (const [, group] of byGroup) {
        const latest = group.slice().sort((a, b) => {
          const da = eventDate(a), db = eventDate(b);
          if (da !== db) { if (da == null) return 1; if (db == null) return -1; return da < db ? 1 : -1; }
          if (rank(a) !== rank(b)) return rank(a) - rank(b);
          return (b.id > a.id ? 1 : -1);
        })[0];
        rows.push(toPublicListRow(latest));
      }
      rows.sort((a, b) => (a.address || '').localeCompare(b.address || ''));
      return NextResponse.json({ ok: true, list: { name: list.name }, rows });
    }

    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });

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

    // Distinct property sub types actually present in the data, so Search can
    // offer them as options instead of free text that has to match exactly.
    if (url.searchParams.get('sub_types') === '1') {
      const { data, error } = await fetchAllPaginated(() => supabaseAdmin.from('mls_listings').select('property_sub_type').not('property_sub_type', 'is', null));
      if (error) return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 });
      const seen = new Set();
      for (const r of data || []) { const v = (r.property_sub_type || '').trim(); if (v) seen.add(v); }
      return NextResponse.json({ ok: true, sub_types: Array.from(seen).sort() });
    }

    // Distinct mapped community names actually matched (from the imported KML
    // polygons) — distinct from the raw/messy MLS subdivision text search.
    if (url.searchParams.get('communities') === '1') {
      const { data, error } = await fetchAllPaginated(() => supabaseAdmin.from('mls_listings').select('community_name').not('community_name', 'is', null).neq('community_name', ''));
      if (error) {
        if (error.code === '42703') return NextResponse.json({ ok: true, communities: [] }); // not migrated yet
        return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 });
      }
      const seen = new Set();
      for (const r of data || []) { const v = (r.community_name || '').trim(); if (v) seen.add(v); }
      return NextResponse.json({ ok: true, communities: Array.from(seen).sort() });
    }

    // Distinct matched school names actually present, one list per level —
    // same purpose as `communities=1` above, for the school-boundary matching.
    if (url.searchParams.get('schools') === '1') {
      const LEVEL_COLUMN = { elementary: 'elementary_school', middle: 'middle_school', high: 'high_school' };
      const out = { elementary: [], middle: [], high: [] };
      for (const [level, col] of Object.entries(LEVEL_COLUMN)) {
        const { data, error } = await fetchAllPaginated(() => supabaseAdmin.from('mls_listings').select(col).not(col, 'is', null).neq(col, ''));
        if (error) {
          if (error.code === '42703') continue; // not migrated yet
          return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 });
        }
        const seen = new Set();
        for (const r of data || []) { const v = (r[col] || '').trim(); if (v) seen.add(v); }
        out[level] = Array.from(seen).sort();
      }
      return NextResponse.json({ ok: true, schools: out });
    }

    // Upload history, most recent first — so the admin can see which name/client
    // a past CSV drop was for.
    if (url.searchParams.get('uploads') === '1') {
      const { data, error } = await supabaseAdmin.from('mls_uploads').select('*').order('uploaded_at', { ascending: false }).limit(200);
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') return NextResponse.json({ ok: true, uploads: [] }); // table not migrated yet
        return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, uploads: data || [] });
    }

    // All saved lists, with item counts.
    if (url.searchParams.get('lists') === '1') {
      const { data: lists, error } = await supabaseAdmin.from('mls_lists').select('*').order('updated_at', { ascending: false });
      if (error) return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 });
      const { data: items } = await fetchAllPaginated(() => supabaseAdmin.from('mls_list_items').select('list_id'));
      const counts = {};
      for (const it of items || []) counts[it.list_id] = (counts[it.list_id] || 0) + 1;
      return NextResponse.json({ ok: true, lists: (lists || []).map((l) => ({ ...l, item_count: counts[l.id] || 0 })) });
    }

    // One list's contents, resolved to each property's current (latest-episode) data —
    // same "most recent event wins" rule as mls_prospects, but not restricted to
    // expired/canceled/withdrawn, since a list can include any status.
    const listId = url.searchParams.get('list_id');
    if (listId) {
      const { data: list, error: listErr } = await supabaseAdmin.from('mls_lists').select('*').eq('id', listId).single();
      if (listErr || !list) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

      const { data: items } = await fetchAllPaginated(() => supabaseAdmin.from('mls_list_items').select('group_key, added_at').eq('list_id', listId));
      const groupKeys = (items || []).map((i) => i.group_key);
      if (!groupKeys.length) return NextResponse.json({ ok: true, list, rows: [] });

      // .in() breaks past ~1500-1800 items (same issue as the upload lookup) — chunk it.
      const CHUNK = 500;
      let listings = [];
      for (let i = 0; i < groupKeys.length; i += CHUNK) {
        const chunk = groupKeys.slice(i, i + CHUNK);
        const { data, error } = await fetchAllPaginated(() => supabaseAdmin.from('mls_listings').select('*').in('group_key', chunk));
        if (error) { console.error(error); return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 }); }
        listings = listings.concat(data || []);
      }

      const eventDate = (r) => r.close_date || r.off_market_date || r.listing_contract_date || null;
      const byGroup = new Map();
      for (const r of listings) {
        if (!byGroup.has(r.group_key)) byGroup.set(r.group_key, []);
        byGroup.get(r.group_key).push(r);
      }
      const rank = (r) => (['sold', 'active', 'pending'].includes(r.status_normalized) ? 0 : 1);
      const rows = [];
      for (const [groupKey, group] of byGroup) {
        const latest = group.slice().sort((a, b) => {
          const da = eventDate(a), db = eventDate(b);
          if (da !== db) { if (da == null) return 1; if (db == null) return -1; return da < db ? 1 : -1; }
          if (rank(a) !== rank(b)) return rank(a) - rank(b);
          return (b.id > a.id ? 1 : -1);
        })[0];
        rows.push(latest);
      }
      rows.sort((a, b) => (a.address || '').localeCompare(b.address || ''));
      return NextResponse.json({ ok: true, list, rows });
    }

    const prospectsOnly = url.searchParams.get('prospects_only') !== '0'; // default true
    const community = (url.searchParams.get('community') || '').trim();
    const address = (url.searchParams.get('address') || '').trim();
    // Comma-separated — any of several statuses/types/lists at once. Empty means no filter.
    const splitCsv = (v) => (v || '').trim().split(',').map((s) => s.trim()).filter(Boolean);
    // Zips are typed free-form, so accept commas or whitespace between them.
    const zips = (url.searchParams.get('zip') || '').trim().split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    const mappedCommunities = splitCsv(url.searchParams.get('mapped_community'));
    const elementarySchools = splitCsv(url.searchParams.get('elementary_school'));
    const middleSchools = splitCsv(url.searchParams.get('middle_school'));
    const highSchools = splitCsv(url.searchParams.get('high_school'));
    const statuses = splitCsv(url.searchParams.get('status'));
    const offFrom = url.searchParams.get('off_from') || '';
    const offTo = url.searchParams.get('off_to') || '';
    const priceMin = url.searchParams.get('price_min') || '';
    const priceMax = url.searchParams.get('price_max') || '';
    const sqftMin = url.searchParams.get('sqft_min') || '';
    const sqftMax = url.searchParams.get('sqft_max') || '';
    const beds = url.searchParams.get('beds') || '';
    const subTypes = splitCsv(url.searchParams.get('sub_type'));
    const tagFilter = (url.searchParams.get('tag') || '').trim();
    const filterListIds = splitCsv(url.searchParams.get('filter_list_id'));
    // Strip characters that are special in PostgREST's .or() mini-syntax so a
    // comma/paren in a search box can't break or smuggle extra filter clauses.
    const escLike = (s) => s.replace(/[,()]/g, '');

    // Resolve "search within any of these lists" to a union of group_keys up
    // front, once, so both search modes can just .in() against them.
    let listGroupKeys = null;
    if (filterListIds.length) {
      const { data: items } = await fetchAllPaginated(() => supabaseAdmin.from('mls_list_items').select('group_key').in('list_id', filterListIds));
      listGroupKeys = [...new Set((items || []).map((i) => i.group_key))];
      if (listGroupKeys.length === 0) {
        return NextResponse.json({ ok: true, rows: [], mode: prospectsOnly ? 'prospects' : 'all' });
      }
    }

    if (prospectsOnly) {
      // lat/lng were added in a later migration — if it hasn't been run yet on this
      // database, selecting them by name 400s the whole query (PostgREST error
      // 42703). Fall back to the same search without them rather than show nothing.
      const buildProspectsQuery = (fields, includeNewCols = true) => () => {
        let q = supabaseAdmin.from('mls_prospects').select(fields.join(','));
        if (community) q = q.or(`subdivision.ilike.%${escLike(community)}%,neighborhood.ilike.%${escLike(community)}%,mls_area.ilike.%${escLike(community)}%`);
        if (address) q = q.ilike('address', `%${escLike(address)}%`);
        if (zips.length && includeNewCols) q = q.in('postal_code', zips);
        if (mappedCommunities.length && includeNewCols) q = q.in('community_name', mappedCommunities);
        if (elementarySchools.length && includeNewCols) q = q.in('elementary_school', elementarySchools);
        if (middleSchools.length && includeNewCols) q = q.in('middle_school', middleSchools);
        if (highSchools.length && includeNewCols) q = q.in('high_school', highSchools);
        if (statuses.length) q = q.in('last_status', statuses);
        if (offFrom) q = q.gte('last_off_market_date', offFrom);
        if (offTo) q = q.lte('last_off_market_date', offTo);
        if (priceMin) q = q.gte('last_list_price', Number(priceMin));
        if (priceMax) q = q.lte('last_list_price', Number(priceMax));
        if (sqftMin) q = q.gte('living_area', Number(sqftMin));
        if (sqftMax) q = q.lte('living_area', Number(sqftMax));
        if (beds) q = q.gte('beds_total', Number(beds));
        if (subTypes.length) q = q.in('property_sub_type', subTypes);
        if (tagFilter) q = q.ilike('tag', `%${escLike(tagFilter)}%`);
        if (listGroupKeys) q = q.in('group_key', listGroupKeys);
        return q.order('last_off_market_date', { ascending: false });
      };

      let { data, error } = await fetchAllPaginated(buildProspectsQuery(SEARCH_FIELDS_PROSPECTS));
      if (error && error.code === '42703') {
        // Older databases may not have postal_code/community_name/lat/lng on the
        // view yet — degrade gracefully (drop those fields and filters) rather
        // than show nothing.
        const legacyFields = SEARCH_FIELDS_PROSPECTS.filter((f) =>
          !['lat', 'lng', 'postal_code', 'community_name', 'elementary_school', 'middle_school', 'high_school'].includes(f));
        ({ data, error } = await fetchAllPaginated(buildProspectsQuery(legacyFields, false)));
      }
      if (error) { console.error(error); return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 }); }
      const withLists = await attachListMemberships(data || []);
      return NextResponse.json({ ok: true, rows: withLists, mode: 'prospects' });
    }

    // All history — every listing episode, not deduped by APN.
    const buildAllHistoryQuery = () => {
      let q = supabaseAdmin.from('mls_listings').select('*');
      if (community) q = q.or(`subdivision.ilike.%${escLike(community)}%,neighborhood.ilike.%${escLike(community)}%,mls_area.ilike.%${escLike(community)}%`);
      if (address) q = q.ilike('address', `%${escLike(address)}%`);
      if (zips.length) q = q.in('postal_code', zips);
      if (mappedCommunities.length) q = q.in('community_name', mappedCommunities);
      if (elementarySchools.length) q = q.in('elementary_school', elementarySchools);
      if (middleSchools.length) q = q.in('middle_school', middleSchools);
      if (highSchools.length) q = q.in('high_school', highSchools);
      if (statuses.length) q = q.in('status_normalized', statuses);
      if (offFrom) q = q.gte('off_market_date', offFrom);
      if (offTo) q = q.lte('off_market_date', offTo);
      if (priceMin) q = q.gte('orig_list_price', Number(priceMin));
      if (priceMax) q = q.lte('orig_list_price', Number(priceMax));
      if (sqftMin) q = q.gte('living_area', Number(sqftMin));
      if (sqftMax) q = q.lte('living_area', Number(sqftMax));
      if (beds) q = q.gte('beds_total', Number(beds));
      if (subTypes.length) q = q.in('property_sub_type', subTypes);
      if (tagFilter) q = q.ilike('tag', `%${escLike(tagFilter)}%`);
      if (listGroupKeys) q = q.in('group_key', listGroupKeys);
      return q.order('uploaded_at', { ascending: false });
    };
    const { data, error } = await fetchAllPaginated(buildAllHistoryQuery);
    if (error) { console.error(error); return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 }); }

    // Mark rows that are currently the live prospect for their group, so "All
    // history" can visually flag them even though every row there isn't one.
    const { data: prospectMls } = await fetchAllPaginated(() => supabaseAdmin.from('mls_prospects').select('last_mls_number'));
    const prospectSet = new Set((prospectMls || []).map((p) => p.last_mls_number));
    const rows = (data || []).map((r) => ({ ...r, is_current_prospect: prospectSet.has(r.mls_number) }));
    const withLists = await attachListMemberships(rows);

    return NextResponse.json({ ok: true, rows: withLists, mode: 'all' });
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
