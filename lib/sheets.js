import crypto from 'crypto';
import { supabaseAdmin as _sa } from './supabase';

// ===== Google Sheets reader via service account (no googleapis dependency) =====
// Reads a sheet the service account has been granted access to, maps rows by
// header name to comp fields. Credentials come from env:
//   GOOGLE_SA_EMAIL        - service account email
//   GOOGLE_SA_PRIVATE_KEY  - its private key (PEM; \n escaped is fine)

function b64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// Mint a short-lived Google OAuth access token for the Sheets read scope.
async function getAccessToken() {
  const email = process.env.GOOGLE_SA_EMAIL;
  let key = process.env.GOOGLE_SA_PRIVATE_KEY || '';
  key = key.replace(/\\n/g, '\n'); // env stores newlines escaped
  if (!email || !key) throw new Error('Google service account not configured.');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const unsigned = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(claim));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = signer.sign(key).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = unsigned + '.' + signature;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('Google auth failed: ' + (j.error_description || j.error || 'unknown'));
  return j.access_token;
}

export function extractSheetId(url) {
  if (!url) return '';
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : (/^[a-zA-Z0-9_-]{20,}$/.test(url) ? url : '');
}

// Header-name -> comp field. Lowercased, non-alphanum stripped for matching.
const HEADER_MAP = {
  'mls': 'mls_number', 'mls#': 'mls_number', 'mlsnumber': 'mls_number',
  'status': 'status',
  'propertysubtype': 'sub_type', 'subtype': 'sub_type',
  'mynotes': 'my_notes', 'notes': 'my_notes',
  'address': 'address',
  'postalcode': 'postal_code', 'zip': 'postal_code', 'zipcode': 'postal_code',
  'yearbuilt': 'year_built',
  'bedstotal': 'beds', 'beds': 'beds',
  'bathstotal': 'baths', 'baths': 'baths',
  'livingarea': 'living_area', 'sqft': 'living_area',
  'lotsizesqft': 'lot_size_sqft', 'lotsize': 'lot_size_sqft',
  'soldpricepersqft': 'sold_ppsf',
  'closeprice': 'close_price', 'soldprice': 'close_price',
  'closedate': 'close_date', 'solddate': 'close_date',
  'origlistpr': 'orig_list_price', 'originallistprice': 'orig_list_price', 'origlistprice': 'orig_list_price',
  'pricepersqft': 'price_ppsf',
  'dam': 'days_on_market', 'dom': 'days_on_market', 'daysonmarket': 'days_on_market', 'cdom': 'days_on_market',
  'listingpictures': 'photo_url', 'listingpicture': 'photo_url', 'photo': 'photo_url', 'photos': 'photo_url', 'picture': 'photo_url',
  'publicremarks': 'public_remarks', 'remarks': 'public_remarks', 'description': 'public_remarks',
  'currentprice': 'current_price',
};

function normHeader(h) {
  return (h || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Read a sheet and return mapped comp rows.
export async function readCompsSheet(sheetUrlOrId) {
  const id = extractSheetId(sheetUrlOrId);
  if (!id) throw new Error('Could not read the sheet link.');
  const tokenStr = await getAccessToken();

  // Grab a wide range of the first sheet.
  const range = 'A1:Z200';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?majorDimension=ROWS`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + tokenStr } });
  const j = await res.json();
  if (j.error) throw new Error('Sheets read failed: ' + (j.error.message || 'unknown'));
  const rows = j.values || [];
  if (rows.length === 0) return { comps: [] };

  // Find the header row: the first row containing a cell that maps to 'address'.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    if (rows[i].some((c) => HEADER_MAP[normHeader(c)] === 'address')) { headerIdx = i; break; }
  }
  if (headerIdx === -1) headerIdx = 0;

  const headers = rows[headerIdx].map((h) => HEADER_MAP[normHeader(h)] || null);

  const comps = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      const field = headers[c];
      if (!field) continue;
      const val = (row[c] != null ? row[c] : '').toString().trim();
      if (val) obj[field] = val;
    }
    // Skip entirely-empty rows and the MLS-export link row.
    const hasData = obj.address || obj.mls_number || obj.close_price || obj.living_area;
    if (!hasData) continue;
    comps.push(obj);
  }
  return { comps };
}

// ===== Geocoding (Google Geocoding API), cached in redfin_cache =====

export async function geocodeAddress(address, zip) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!key || !address) return null;
  const full = [address, zip, 'CA'].filter(Boolean).join(', ');
  const cacheKey = 'geo:' + full.toLowerCase();
  try {
    const { data: cached } = await _sa
      .from('redfin_cache').select('facts').eq('address_key', cacheKey).single();
    if (cached?.facts?.lat != null) return cached.facts;
  } catch {}
  try {
    const u = 'https://maps.googleapis.com/maps/api/geocode/json?address=' +
      encodeURIComponent(full) + '&key=' + key;
    const r = await fetch(u);
    const j = await r.json();
    const loc = j?.results?.[0]?.geometry?.location;
    if (!loc) return null;
    const out = { lat: loc.lat, lng: loc.lng };
    try {
      await _sa.from('redfin_cache').upsert({
        address_key: cacheKey, facts: out, fetched_at: new Date().toISOString(),
      });
    } catch {}
    return out;
  } catch (e) {
    console.error('geocode error:', e);
    return null;
  }
}
