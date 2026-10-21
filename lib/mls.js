import Papa from 'papaparse';

// ===== MLS CSV import: header-name mapping, status/APN normalization =====
// Mirrors the approach in lib/sheets.js — map by header NAME (not column
// position), since Paragon/CRMLS exports vary in column order and may have
// a few title/filter rows above the real header row.

function normHeader(h) {
  return (h || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Header-name -> our field. Lowercased, non-alphanum stripped for matching.
const HEADER_MAP = {
  'mls': 'mls_number', 'mls#': 'mls_number', 'mlsnumber': 'mls_number', 'mlsid': 'mls_number', 'listingid': 'mls_number',
  'apn': 'apn_raw', 'parcelnumber': 'apn_raw', 'assessorparcelnumber': 'apn_raw', 'apnnumber': 'apn_raw',
  'status': 'status_raw', 'mlsstatus': 'status_raw', 'standardstatus': 'status_raw',
  'address': 'address', 'streetaddress': 'address', 'fulladdress': 'address',
  'postalcode': 'postal_code', 'zip': 'postal_code', 'zipcode': 'postal_code',
  'subdivision': 'subdivision', 'subdivisionname': 'subdivision',
  'neighborhood': 'neighborhood', 'neighbourhood': 'neighborhood',
  'mlsarea': 'mls_area', 'area': 'mls_area', 'areaname': 'mls_area',
  'propertysubtype': 'property_sub_type', 'subtype': 'property_sub_type',
  'bedstotal': 'beds_total', 'beds': 'beds_total',
  'bathstotal': 'baths_total', 'baths': 'baths_total',
  'livingarea': 'living_area', 'sqft': 'living_area', 'squarefeet': 'living_area',
  'lotsizesqft': 'lot_size_sqft', 'lotsize': 'lot_size_sqft',
  'yearbuilt': 'year_built',
  'origlistpr': 'orig_list_price', 'originallistprice': 'orig_list_price', 'origlistprice': 'orig_list_price',
  'currentprice': 'current_price', 'listprice': 'current_price',
  'closeprice': 'close_price', 'soldprice': 'close_price',
  'listingcontractdate': 'listing_contract_date', 'listdate': 'listing_contract_date',
  'offmarketdate': 'off_market_date',
  'closedate': 'close_date', 'solddate': 'close_date',
  'dam': 'days_on_market', 'dom': 'days_on_market', 'daysonmarket': 'days_on_market', 'cdom': 'days_on_market',
  'publicremarks': 'public_remarks', 'remarks': 'public_remarks',
};

// Status text -> one of: active, pending, sold, expired, canceled, withdrawn.
// Anything not recognized stays 'unknown' rather than guessed into a bucket —
// it shows up in "All history" search so it can be reviewed and this map extended.
const STATUS_MAP = {
  active: 'active', comingsoon: 'active', activelisting: 'active',
  activeundercontract: 'pending', pending: 'pending', pendingtakingbackups: 'pending', backuprequested: 'pending',
  closed: 'sold', sold: 'sold',
  expired: 'expired',
  cancelled: 'canceled', canceled: 'canceled',
  withdrawn: 'withdrawn', hold: 'withdrawn', tempoffmarket: 'withdrawn', temporarilyoffmarket: 'withdrawn',
};

export function normalizeStatus(raw) {
  const key = normHeader(raw);
  return STATUS_MAP[key] || 'unknown';
}

// Strip dashes, spaces, dots so the same parcel always matches.
export function normalizeApn(raw) {
  const s = (raw || '').toString().replace(/[-.\s]/g, '').toUpperCase();
  if (!s) return null;
  // MLS exports use an all-same-digit APN (e.g. "9999999999", "00000000",
  // sometimes spaced as "999 999 99 99") as a sentinel for "not entered" —
  // never a real parcel. A genuine APN is never a single digit repeated for
  // its whole length. Treating one as real would wrongly group unrelated
  // properties together, so fall back to the address key instead.
  if (/^(\d)\1*$/.test(s)) return null;
  return s;
}

// Lowercase, strip punctuation, canonicalize common street suffixes, append zip —
// a fallback grouping key for rows with no APN.
const SUFFIX = { rd: 'road', dr: 'drive', st: 'street', ave: 'avenue', av: 'avenue', blvd: 'boulevard', ln: 'lane', ct: 'court', pl: 'place', ter: 'terrace', cir: 'circle', way: 'way', trl: 'trail', pkwy: 'parkway', hwy: 'highway' };
export function normalizeAddressKey(address, postalCode) {
  let x = (address || '').toString().toLowerCase().replace(/,.*$/, '').replace(/[.#]/g, ' ');
  const words = x.split(/\s+/).filter(Boolean).map((w) => SUFFIX[w] || w);
  const base = words.join(' ').trim();
  if (!base) return null;
  return base + (postalCode ? ' ' + postalCode.toString().trim() : '');
}

export function groupKeyFor(apnNormalized, addressKey) {
  return apnNormalized || (addressKey ? 'addr:' + addressKey : null);
}

export function parseDate(v) {
  if (v == null) return null;
  const s = v.toString().trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let [, mm, dd, yy] = m;
    if (yy.length === 2) yy = (Number(yy) > 50 ? '19' : '20') + yy;
    return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function toInt(v) {
  const n = toNum(v);
  return n == null ? null : Math.round(n);
}

const NUMERIC_FIELDS = ['beds_total', 'baths_total', 'living_area', 'lot_size_sqft', 'orig_list_price', 'current_price', 'close_price', 'days_on_market'];
const INT_FIELDS = ['year_built'];
const DATE_FIELDS = ['listing_contract_date', 'off_market_date', 'close_date'];

// Parse CSV text into mapped, normalized listing rows ready to upsert.
// Returns { rows, totalDataRows, skippedNoMlsNumber } — rows already have
// every column add_mls_listings.sql expects (minus id/created_at/etc).
export function parseMlsCsv(csvText, sourceFilename) {
  const parsed = Papa.parse(csvText, { skipEmptyLines: true });
  const allRows = parsed.data || [];
  if (allRows.length === 0) return { rows: [], totalDataRows: 0, skippedNoMlsNumber: 0 };

  // Find the header row: the first row (within the first 10) containing a
  // cell that maps to 'mls_number' or 'address' — real MLS exports sometimes
  // have a title/filter-criteria row or two above the actual header row.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(allRows.length, 10); i++) {
    if (allRows[i].some((c) => { const f = HEADER_MAP[normHeader(c)]; return f === 'mls_number' || f === 'address'; })) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) headerIdx = 0;

  const headerCells = allRows[headerIdx];
  const fields = headerCells.map((h) => HEADER_MAP[normHeader(h)] || null);

  const rows = [];
  let totalDataRows = 0;
  let skippedNoMlsNumber = 0;

  for (let r = headerIdx + 1; r < allRows.length; r++) {
    const rowCells = allRows[r];
    if (!rowCells || rowCells.every((c) => !c || !c.toString().trim())) continue; // fully blank row
    totalDataRows++;

    const obj = {};
    const rawRow = {};
    for (let c = 0; c < headerCells.length; c++) {
      const headerText = (headerCells[c] || '').toString().trim();
      const val = rowCells[c] != null ? rowCells[c].toString().trim() : '';
      if (headerText) rawRow[headerText] = val;
      const field = fields[c];
      if (field && val) obj[field] = val;
    }

    if (!obj.mls_number) { skippedNoMlsNumber++; continue; }

    const apnNormalized = normalizeApn(obj.apn_raw);
    const addressKey = normalizeAddressKey(obj.address, obj.postal_code);
    const groupKey = groupKeyFor(apnNormalized, addressKey);
    if (!groupKey) { skippedNoMlsNumber++; continue; } // no APN and no usable address — can't group at all

    const row = {
      mls_number: obj.mls_number.slice(0, 40),
      apn_raw: obj.apn_raw ? obj.apn_raw.slice(0, 60) : null,
      apn_normalized: apnNormalized,
      address_key: addressKey,
      group_key: groupKey,
      flagged: !apnNormalized,
      address: obj.address ? obj.address.slice(0, 300) : null,
      postal_code: obj.postal_code ? obj.postal_code.slice(0, 12) : null,
      subdivision: obj.subdivision ? obj.subdivision.slice(0, 160) : null,
      neighborhood: obj.neighborhood ? obj.neighborhood.slice(0, 160) : null,
      mls_area: obj.mls_area ? obj.mls_area.slice(0, 160) : null,
      property_sub_type: obj.property_sub_type ? obj.property_sub_type.slice(0, 120) : null,
      public_remarks: obj.public_remarks ? obj.public_remarks.slice(0, 4000) : null,
      status_raw: obj.status_raw ? obj.status_raw.slice(0, 60) : null,
      status_normalized: normalizeStatus(obj.status_raw),
      raw: rawRow,
      source_filename: sourceFilename || null,
      uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    for (const f of NUMERIC_FIELDS) row[f] = toNum(obj[f]);
    for (const f of INT_FIELDS) row[f] = toInt(obj[f]);
    for (const f of DATE_FIELDS) row[f] = parseDate(obj[f]);

    rows.push(row);
  }

  return { rows, totalDataRows, skippedNoMlsNumber };
}
