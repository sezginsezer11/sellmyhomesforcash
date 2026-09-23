import { supabaseAdmin } from './supabase';

const HOST = process.env.RAPIDAPI_HOST || 'redfin-com-data.p.rapidapi.com';
const KEY = process.env.RAPIDAPI_KEY;

const TYPE_MAP = {
  1: 'Single-family home', 2: 'Condo', 3: 'Condo', 4: 'Townhome',
  5: 'Multi-family', 6: 'Land', 7: 'Other', 8: 'Other', 13: 'Condo',
};

function headers() {
  return { 'x-rapidapi-key': KEY, 'x-rapidapi-host': HOST };
}

// Address autocomplete -> list of { label, url } suggestions.
export async function autocompleteAddress(q) {
  if (!KEY || !q || q.length < 3) return [];
  try {
    const url = `https://${HOST}/property/auto-complete?location=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: headers() });
    const j = await r.json();
    const out = [];
    const sections = j?.data?.sections || [];
    for (const sec of sections) {
      for (const row of (sec.rows || [])) {
        // Only address-type rows (they carry a /home/ url and a subName).
        if (row.url && row.url.includes('/home/')) {
          const label = [row.name, row.subName].filter(Boolean).join(', ');
          out.push({ label, url: row.url });
        }
      }
    }
    return out.slice(0, 6);
  } catch (e) {
    console.error('autocomplete error:', e);
    return [];
  }
}

function extract(detail) {
  try {
    const asi = detail?.data?.aboveTheFold?.addressSectionInfo || {};
    const sqftVal = asi.sqFt && typeof asi.sqFt === 'object' ? asi.sqFt.value : asi.sqFt;
    let type = '';
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

// Property facts from a Redfin property URL (with 29-day cache).
export async function lookupByUrl(propUrl) {
  if (!KEY || !propUrl) return {};
  const cacheKey = propUrl.toLowerCase();
  try {
    const { data: cached } = await supabaseAdmin
      .from('redfin_cache').select('facts, fetched_at').eq('address_key', cacheKey).single();
    if (cached && cached.facts) {
      const age = Date.now() - new Date(cached.fetched_at).getTime();
      if (age < 29 * 24 * 60 * 60 * 1000) return cached.facts;
    }
  } catch {}
  try {
    const du = `https://${HOST}/property/detail?url=${encodeURIComponent(propUrl)}`;
    const dr = await fetch(du, { headers: headers() });
    const dj = await dr.json();
    const facts = extract(dj);
    try {
      await supabaseAdmin.from('redfin_cache').upsert({
        address_key: cacheKey, facts, fetched_at: new Date().toISOString(),
      });
    } catch {}
    return facts;
  } catch (e) {
    console.error('lookupByUrl error:', e);
    return {};
  }
}
