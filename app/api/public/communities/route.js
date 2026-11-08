import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';

// Public, unauthenticated feed of the mapped communities (from the admin's
// KML import) plus live sold-comp stats, so other sites can build community
// landing pages / pick a community filter without their own copy of the data.
// Excludes the "No Community" / '' sentinels used internally for unmatched
// listings — those aren't real communities.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

async function fetchAllPaginated(buildQuery, cap = 50000) {
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

function median(nums) {
  if (!nums.length) return null;
  const sorted = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export async function GET() {
  try {
    const { data: boundaries, error: bErr } = await supabaseAdmin
      .from('community_boundaries')
      .select('name, geometry_type, ring')
      .eq('geometry_type', 'polygon');
    if (bErr) {
      console.error(bErr);
      return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500, headers: CORS_HEADERS });
    }
    const names = [...new Set((boundaries || []).map((b) => b.name).filter(Boolean))];
    if (!names.length) return NextResponse.json({ ok: true, communities: [] }, { headers: CORS_HEADERS });

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const cutoff = twelveMonthsAgo.toISOString().slice(0, 10);

    const { data: sold, error: sErr } = await fetchAllPaginated(() =>
      supabaseAdmin
        .from('mls_listings')
        .select('community_name, close_price, close_date, postal_code')
        .eq('status_normalized', 'sold')
        .in('community_name', names)
        .not('close_date', 'is', null)
    );
    if (sErr) {
      console.error(sErr);
      return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500, headers: CORS_HEADERS });
    }

    const byName = new Map();
    for (const name of names) byName.set(name, { prices12mo: [], soldCount12mo: 0, zips: new Set() });
    for (const row of sold || []) {
      const bucket = byName.get(row.community_name);
      if (!bucket) continue;
      if (row.postal_code) bucket.zips.add(row.postal_code);
      if (row.close_date >= cutoff) {
        bucket.soldCount12mo++;
        if (row.close_price) bucket.prices12mo.push(row.close_price);
      }
    }

    const ringByName = new Map();
    for (const b of boundaries || []) if (!ringByName.has(b.name)) ringByName.set(b.name, b.ring);

    const communities = names.map((name) => {
      const bucket = byName.get(name);
      return {
        name,
        zip_codes: Array.from(bucket.zips).sort(),
        sold_last_12mo: bucket.soldCount12mo,
        median_sold_price_last_12mo: median(bucket.prices12mo),
        boundary_ring: ringByName.get(name) || null,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(
      { ok: true, communities },
      { headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=900, s-maxage=900, stale-while-revalidate=1800' } }
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: 'Server error.' }, { status: 500, headers: CORS_HEADERS });
  }
}
