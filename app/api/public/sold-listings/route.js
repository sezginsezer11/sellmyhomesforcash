import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';

// Public, unauthenticated, read-only feed of SOLD comps — meant to be called
// directly from other sites you build (carmelvalleycondos.com, etc.) so they
// don't need their own copy of the MLS data. Scoped to status_normalized =
// 'sold' only: sold price/date is public record, unlike active/pending
// listing data, which may carry separate MLS display-licensing restrictions
// this endpoint deliberately stays out of.
const PUBLIC_SOLD_FIELDS = [
  'group_key', 'address', 'postal_code', 'community_name', 'subdivision', 'neighborhood', 'mls_area',
  'property_sub_type', 'beds_total', 'baths_total', 'living_area', 'lot_size_sqft', 'year_built',
  'lat', 'lng', 'close_price', 'close_date', 'days_on_market',
];
function toPublicSoldRow(r) {
  const out = {};
  for (const f of PUBLIC_SOLD_FIELDS) out[f] = r[f] ?? null;
  return out;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function splitCsv(v) {
  return (v || '').split(',').map((s) => s.trim()).filter(Boolean);
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const communities = splitCsv(url.searchParams.get('community'));
    const zips = splitCsv(url.searchParams.get('zip'));
    const propertyTypes = splitCsv(url.searchParams.get('property_type'));
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 1), 500);
    const page = Math.max(parseInt(url.searchParams.get('page') || '0', 10) || 0, 0);

    let query = supabaseAdmin
      .from('mls_listings')
      .select(PUBLIC_SOLD_FIELDS.join(','), { count: 'exact' })
      .eq('status_normalized', 'sold')
      .not('close_date', 'is', null);
    if (communities.length) query = query.in('community_name', communities);
    if (zips.length) query = query.in('postal_code', zips);
    if (propertyTypes.length) query = query.in('property_sub_type', propertyTypes);
    query = query.order('close_date', { ascending: false }).range(page * limit, page * limit + limit - 1);

    const { data, error, count } = await query;
    if (error) {
      console.error('public sold-listings query failed:', error);
      return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500, headers: CORS_HEADERS });
    }

    return NextResponse.json(
      { ok: true, total: count ?? null, page, limit, rows: (data || []).map(toPublicSoldRow) },
      { headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: 'Server error.' }, { status: 500, headers: CORS_HEADERS });
  }
}
