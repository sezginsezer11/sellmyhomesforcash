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

// ===== Comps: full field extraction from a Redfin property detail =====

function num(v) {
  if (v == null) return '';
  if (typeof v === 'object') v = v.value ?? v.amount ?? '';
  const n = String(v).replace(/[^0-9.]/g, '');
  return n || '';
}
function msToDate(ms) {
  if (!ms) return '';
  const n = Number(ms);
  if (!Number.isFinite(n)) return '';
  try { return new Date(n).toISOString().slice(0, 10); } catch { return ''; }
}

function extractComp(detail) {
  try {
    const d = detail?.data || {};
    const asi = d.aboveTheFold?.addressSectionInfo || {};
    const avm = d.avm || {};
    const ii = d.initialInfo || {};
    const basic = d.belowTheFold?.publicRecordsInfo?.basicInfo || {};
    const blob = JSON.stringify(d);

    const pick = (re) => { const m = blob.match(re); return m ? m[1] : ''; };

    const livingArea = num(asi.sqFt) || num(basic.totalSqFt) || num(basic.sqFtFinished);
    const closePrice = num(avm.lastSoldPrice) || num(pick(/"soldPrice"\s*:\s*\{\s*"amount"\s*:\s*([0-9.]+)/));
    const origList = num(pick(/"listPrice"\s*:\s*([0-9.]+)/)) || num(pick(/"latestPriceInfo"\s*:\s*\{\s*"amount"\s*:\s*([0-9.]+)/));
    const pricePPSF = num(asi.pricePerSqFt);
    const soldDate = msToDate(asi.soldDate || avm.lastSoldDate);
    const lotSize = num(basic.lotSqFt) || num(pick(/"lotSqFt"\s*:\s*([0-9.]+)/)) || num(pick(/"lotSize"\s*:\s*([0-9.]+)/));

    let soldPPSF = '';
    if (closePrice && livingArea) {
      const v = Math.round(Number(closePrice) / Number(livingArea));
      if (Number.isFinite(v)) soldPPSF = String(v);
    }

    return {
      mls_number: ii.mlsId != null ? String(ii.mlsId) : '',
      status: asi.status?.displayValue || '',
      sub_type: basic.propertyTypeName || '',
      postal_code: asi.zip != null ? String(asi.zip) : (basic.zip != null ? String(basic.zip) : ''),
      year_built: (asi.yearBuilt ?? basic.yearBuilt) != null ? String(asi.yearBuilt ?? basic.yearBuilt) : '',
      beds: (asi.beds ?? basic.beds) != null ? String(asi.beds ?? basic.beds) : '',
      baths: (asi.baths ?? basic.baths) != null ? String(asi.baths ?? basic.baths) : '',
      living_area: livingArea,
      lot_size_sqft: lotSize,
      sold_ppsf: soldPPSF,
      close_price: closePrice,
      close_date: soldDate,
      orig_list_price: origList,
      price_ppsf: pricePPSF,
      days_on_market: asi.cumulativeDaysOnMarket != null ? String(asi.cumulativeDaysOnMarket) : '',
    };
  } catch (e) {
    console.error('extractComp error:', e);
    return {};
  }
}

// Full comp fields from a Redfin property URL, cached 30 days (shared cache,
// separate key namespace so comp pulls and lead pulls don't collide).
export async function lookupCompByUrl(propUrl, force = false) {
  if (!KEY || !propUrl) return {};
  const cacheKey = 'comp:' + propUrl.toLowerCase();
  if (!force) {
    try {
      const { data: cached } = await supabaseAdmin
        .from('redfin_cache').select('facts, fetched_at').eq('address_key', cacheKey).single();
      if (cached && cached.facts) {
        const age = Date.now() - new Date(cached.fetched_at).getTime();
        if (age < 30 * 24 * 60 * 60 * 1000) return { ...cached.facts, _cached: true };
      }
    } catch {}
  }
  try {
    const du = `https://${HOST}/property/detail?url=${encodeURIComponent(propUrl)}`;
    const dr = await fetch(du, { headers: headers() });
    const dj = await dr.json();
    const facts = extractComp(dj);
    try {
      await supabaseAdmin.from('redfin_cache').upsert({
        address_key: cacheKey, facts, fetched_at: new Date().toISOString(),
      });
    } catch {}
    return { ...facts, _cached: false };
  } catch (e) {
    console.error('lookupCompByUrl error:', e);
    return {};
  }
}
