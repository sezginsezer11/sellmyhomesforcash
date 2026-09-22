import { supabaseAdmin } from './supabase';

const HOST = process.env.RAPIDAPI_HOST || 'redfin-com-data.p.rapidapi.com';
const KEY = process.env.RAPIDAPI_KEY;

// Redfin numeric property-type codes -> readable labels.
const TYPE_MAP = {
  1: 'Single-family home',
  2: 'Condo',
  3: 'Condo',
  4: 'Townhome',
  5: 'Multi-family',
  6: 'Land',
  7: 'Other',
  8: 'Other',
  13: 'Condo',
};

function headers() {
  return { 'x-rapidapi-key': KEY, 'x-rapidapi-host': HOST };
}

// Normalize the pulled facts to just what we store.
function extract(detail) {
  try {
    const asi = detail?.data?.aboveTheFold?.addressSectionInfo || {};
    const sqftVal = asi.sqFt && typeof asi.sqFt === 'object' ? asi.sqFt.value : asi.sqFt;
    let type = '';
    // Prefer explicit label if present anywhere; else map the numeric code.
    const blob = JSON.stringify(detail?.data || {});
    const m = blob.match(/"propertyTypeName"\s*:\s*"([^"]+)"/);
    if (m) type = m[1];
    else if (asi.propertyType != null) type = TYPE_MAP[asi.propertyType] || '';
    return {
      property_type: type,
      sqft: sqftVal ? String(sqftVal) : '',
      beds: asi.beds != null ? String(asi.beds) : '',
      baths: asi.baths != null ? String(asi.baths) : '',
      year_built: asi.yearBuilt != null ? String(asi.yearBuilt) : '',
    };
  } catch { return {}; }
}

// Look up property facts from an address string. Returns {} on any miss.
export async function lookupProperty(address) {
  if (!KEY || !address) return {};
  const key = address.trim().toLowerCase();

  // 1) Cache check — reuse a recent lookup for the same address.
  try {
    const { data: cached } = await supabaseAdmin
      .from('redfin_cache')
      .select('facts, fetched_at')
      .eq('address_key', key)
      .single();
    if (cached && cached.facts) {
      const age = Date.now() - new Date(cached.fetched_at).getTime();
      if (age < 29 * 24 * 60 * 60 * 1000) return cached.facts; // 29-day cache
    }
  } catch {}

  try {
    // 2) Search to resolve the address -> Redfin property URL.
    const su = `https://${HOST}/property/search?location=${encodeURIComponent(address)}&search_by=addresses`;
    const sr = await fetch(su, { headers: headers() });
    const sj = await sr.json();
    let url = '';
    if (Array.isArray(sj?.suggestionLocation) && sj.suggestionLocation[0]?.url) {
      url = sj.suggestionLocation[0].url;
    } else if (Array.isArray(sj?.data) && sj.data[0]?.url) {
      url = sj.data[0].url;
    }
    if (!url) return {};

    // 3) Details from that URL.
    const du = `https://${HOST}/property/detail?url=${encodeURIComponent(url)}`;
    const dr = await fetch(du, { headers: headers() });
    const dj = await dr.json();
    const facts = extract(dj);

    // 4) Cache the result (best-effort).
    try {
      await supabaseAdmin.from('redfin_cache').upsert({
        address_key: key, facts, fetched_at: new Date().toISOString(),
      });
    } catch {}

    return facts;
  } catch (e) {
    console.error('Redfin lookup error:', e);
    return {};
  }
}
