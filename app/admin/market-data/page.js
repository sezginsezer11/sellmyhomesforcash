'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { supabaseBrowser } from '../../../lib/supabase-browser';

const STATUSES = ['expired', 'canceled', 'withdrawn'];
const fmtMoney = (v) => (v == null ? '—' : '$' + Number(v).toLocaleString());
const fmtDate = (v) => (v ? new Date(v + 'T00:00:00').toLocaleDateString() : '—');
const STATUS_COLOR = {
  active: '#1c5b34', pending: '#b26a00', sold: '#296190',
  expired: '#8a5a20', canceled: '#8a2020', withdrawn: '#5a3d8a', unknown: '#6a7a82',
};

export default function MarketDataPage() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState('upload');
  const token = () => session?.access_token;

  useEffect(() => {
    let done = false;
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (done) return;
      setSession(data.session); setChecking(false);
    });
    const t = setTimeout(() => { if (!done) setChecking(false); }, 6000);
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => { done = true; clearTimeout(t); sub.subscription.unsubscribe(); };
  }, []);

  if (checking) return <div className="m-wrap"><p>Loading…</p><style>{css}</style></div>;
  if (!session) return (
    <div className="m-wrap"><p>Please <a href="/admin">sign in</a> first.</p><style>{css}</style></div>
  );

  return (
    <div className="m-wrap">
      <div className="m-head">
        <h1>Market Data</h1>
        <div><a className="m-link" href="/admin">← Leads</a><a className="m-link" href="/admin/comps">Comps</a><span className="m-me">{session.user.email}</span></div>
      </div>

      <div className="m-tabs">
        <button className={'m-tab' + (tab === 'upload' ? ' on' : '')} onClick={() => setTab('upload')}>Upload</button>
        <button className={'m-tab' + (tab === 'search' ? ' on' : '')} onClick={() => setTab('search')}>Search</button>
      </div>

      {tab === 'upload' ? <UploadTab token={token} /> : <SearchTab token={token} />}

      <style>{css}</style>
    </div>
  );
}

// ===== Upload tab =====

function UploadTab({ token }) {
  const [dragOver, setDragOver] = useState(false);
  const [results, setResults] = useState([]); // [{filename, status: 'working'|'ok'|'error', summary, error}]
  const fileInputRef = useRef(null);

  const processFiles = async (fileList) => {
    const files = Array.from(fileList).filter((f) => /\.csv$/i.test(f.name));
    if (!files.length) return;
    for (const file of files) {
      setResults((rs) => [...rs, { filename: file.name, status: 'working' }]);
      try {
        const text = await file.text();
        const res = await fetch('/api/market-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
          body: JSON.stringify({ action: 'upload_csv', filename: file.name, csv_text: text }),
        });
        const j = await res.json();
        setResults((rs) => rs.map((r) => (r.filename === file.name && r.status === 'working')
          ? (j.ok ? { ...r, status: 'ok', summary: j.summary } : { ...r, status: 'error', error: j.error || 'Upload failed.' })
          : r));
      } catch (e) {
        setResults((rs) => rs.map((r) => (r.filename === file.name && r.status === 'working') ? { ...r, status: 'error', error: 'Upload error.' } : r));
      }
    }
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files?.length) processFiles(e.dataTransfer.files);
  };

  return (
    <div className="m-upload">
      <div
        className={'m-dropzone' + (dragOver ? ' over' : '')}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <p className="m-droptitle">Drag &amp; drop CSV export(s) here</p>
        <p className="m-dropsub">Sold, Active, Pending, Expired, Canceled, Withdrawn — any mix, any column order. Click to browse.</p>
        <input ref={fileInputRef} type="file" accept=".csv" multiple style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files?.length) processFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {results.length > 0 && (
        <div className="m-results">
          {results.slice().reverse().map((r, i) => (
            <div className={'m-result' + (r.status === 'error' ? ' err' : '')} key={i}>
              <div className="m-resultname">{r.filename}</div>
              {r.status === 'working' && <div className="m-resultstat">Uploading…</div>}
              {r.status === 'error' && <div className="m-resultstat">{r.error}</div>}
              {r.status === 'ok' && (
                <div className="m-resultgrid">
                  <span>Read <b>{r.summary.read}</b></span>
                  <span>Inserted <b>{r.summary.inserted}</b></span>
                  <span>Updated <b>{r.summary.updated}</b></span>
                  <span>Skipped <b>{r.summary.skipped}</b></span>
                  <span>Flagged (no APN) <b>{r.summary.flagged}</b></span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Search tab =====

function SearchTab({ token }) {
  const [prospectsOnly, setProspectsOnly] = useState(true);
  const [community, setCommunity] = useState('');
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState('all');
  const [offFrom, setOffFrom] = useState('');
  const [offTo, setOffTo] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [beds, setBeds] = useState('');
  const [subType, setSubType] = useState('');
  const [rows, setRows] = useState([]);
  const [mode, setMode] = useState('prospects');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sort, setSort] = useState({ key: null, dir: 1 });
  const [timelineKey, setTimelineKey] = useState('');
  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const runSearch = async () => {
    setLoading(true); setSearched(true);
    const params = new URLSearchParams({
      prospects_only: prospectsOnly ? '1' : '0',
      status, community, address, off_from: offFrom, off_to: offTo,
      price_min: priceMin, price_max: priceMax, beds, sub_type: subType,
    });
    try {
      const res = await fetch('/api/market-data?' + params.toString(), { headers: { Authorization: 'Bearer ' + token() } });
      const j = await res.json();
      if (j.ok) { setRows(j.rows || []); setMode(j.mode); }
    } catch {}
    setLoading(false);
  };

  const openTimeline = async (groupKey) => {
    setTimelineKey(groupKey); setTimeline([]); setTimelineLoading(true);
    try {
      const res = await fetch('/api/market-data?group_key=' + encodeURIComponent(groupKey), { headers: { Authorization: 'Bearer ' + token() } });
      const j = await res.json();
      if (j.ok) setTimeline(j.listings || []);
    } catch {}
    setTimelineLoading(false);
  };

  // Every episode in a timeline shares the same property, so the first row
  // (oldest, per the API's ordering) identifies it for the modal header.
  const timelineProperty = timeline[0];

  const rowMlsNumber = (r) => (mode === 'prospects' ? r.last_mls_number : r.mls_number);
  const isStarred = (r) => !!r.starred || (mode === 'all' && r.is_current_prospect);

  const sortKeyVal = (r, key) => {
    switch (key) {
      case 'star': return isStarred(r) ? 1 : 0;
      case 'tag': return (r.tag || '').toLowerCase() || '￿'; // blanks sort last
      case 'address': return (r.address || '').toLowerCase();
      case 'community': return (r.subdivision || r.neighborhood || r.mls_area || '').toLowerCase();
      case 'status': return mode === 'prospects' ? (r.last_status || '') : (r.status_normalized || '');
      case 'price': return (mode === 'prospects' ? r.last_list_price : r.orig_list_price) ?? -1;
      case 'off_market': return (mode === 'prospects' ? r.last_off_market_date : r.off_market_date) || '';
      case 'times_listed': return mode === 'prospects' ? (r.times_listed_without_selling ?? -1) : -1;
      case 'sqft': return r.living_area ?? -1;
      default: return 0;
    }
  };
  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'star' ? -1 : 1 }));
  const sortArrow = (key) => (sort.key === key ? (sort.dir === 1 ? ' ▴' : ' ▾') : '');

  const toggleStar = (r) => {
    const mlsNumber = rowMlsNumber(r);
    const next = !r.starred;
    setRows((rs) => rs.map((x) => (rowMlsNumber(x) === mlsNumber ? { ...x, starred: next } : x)));
    fetch('/api/market-data', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify({ mls_number: mlsNumber, starred: next }),
    }).catch(() => {});
  };
  const saveTag = (r, tag) => {
    const mlsNumber = rowMlsNumber(r);
    fetch('/api/market-data', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify({ mls_number: mlsNumber, tag }),
    }).catch(() => {});
  };
  const editTag = (r, tag) => {
    const mlsNumber = rowMlsNumber(r);
    setRows((rs) => rs.map((x) => (rowMlsNumber(x) === mlsNumber ? { ...x, tag } : x)));
  };
  const sortedRows = useMemo(() => {
    if (!sort.key) return rows;
    const arr = rows.slice();
    arr.sort((a, b) => {
      const va = sortKeyVal(a, sort.key), vb = sortKeyVal(b, sort.key);
      if (va < vb) return -1 * sort.dir;
      if (va > vb) return 1 * sort.dir;
      return 0;
    });
    return arr;
  }, [rows, sort, mode]);

  const exportCSV = () => {
    const cols = mode === 'prospects'
      ? ['address', 'subdivision', 'neighborhood', 'mls_area', 'property_sub_type', 'beds_total', 'baths_total', 'living_area', 'last_status', 'last_list_price', 'original_list_price', 'last_off_market_date', 'days_since_off_market', 'total_listings', 'times_listed_without_selling']
      : ['address', 'subdivision', 'neighborhood', 'mls_area', 'property_sub_type', 'beds_total', 'baths_total', 'living_area', 'status_normalized', 'orig_list_price', 'current_price', 'close_price', 'listing_contract_date', 'off_market_date', 'close_date', 'mls_number'];
    const esc = (v) => '"' + (v == null ? '' : String(v).replace(/"/g, '""')) + '"';
    const csv = [cols.join(',')].concat(rows.map((r) => cols.map((c) => esc(r[c])).join(','))).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'market-data-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="m-search">
      <div className="m-toggle">
        <button className={'m-togglebtn' + (prospectsOnly ? ' on' : '')} onClick={() => setProspectsOnly(true)}>Prospects only</button>
        <button className={'m-togglebtn' + (!prospectsOnly ? ' on' : '')} onClick={() => setProspectsOnly(false)}>All history</button>
      </div>

      <div className="m-filters">
        <input placeholder="Address…" value={address} onChange={(e) => setAddress(e.target.value)} />
        <input placeholder="Community (subdivision, neighborhood, or area)…" value={community} onChange={(e) => setCommunity(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          {!prospectsOnly && <><option value="active">Active</option><option value="pending">Pending</option><option value="sold">Sold</option><option value="unknown">Unknown</option></>}
        </select>
        <input type="date" value={offFrom} onChange={(e) => setOffFrom(e.target.value)} title="Off-market from" />
        <input type="date" value={offTo} onChange={(e) => setOffTo(e.target.value)} title="Off-market to" />
        <input type="number" placeholder="Min price" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
        <input type="number" placeholder="Max price" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
        <input type="number" placeholder="Beds (min)" value={beds} onChange={(e) => setBeds(e.target.value)} />
        <input placeholder="Property sub type…" value={subType} onChange={(e) => setSubType(e.target.value)} />
        <button className="m-searchbtn" onClick={runSearch} disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
        {searched && rows.length > 0 && <button className="m-exportbtn" onClick={exportCSV}>Export CSV</button>}
      </div>

      {searched && (
        <div className="m-resultswrap">
          <div className="m-resultcount">{rows.length} result{rows.length === 1 ? '' : 's'}</div>
          <div className="m-tablewrap">
            <table className="m-table">
              <thead>
                <tr>
                  <th className="m-starcol m-sortable" onClick={() => toggleSort('star')} title="Sort by starred">★</th>
                  <th className="m-sortable" onClick={() => toggleSort('address')}>Address{sortArrow('address')}</th>
                  <th className="m-sortable" onClick={() => toggleSort('community')}>Community{sortArrow('community')}</th>
                  <th className="m-sortable" onClick={() => toggleSort('status')}>Status{sortArrow('status')}</th>
                  <th className="m-sortable" onClick={() => toggleSort('tag')}>Tag{sortArrow('tag')}</th>
                  <th className="m-r m-sortable" onClick={() => toggleSort('price')}>List Price{sortArrow('price')}</th>
                  <th className="m-sortable" onClick={() => toggleSort('off_market')}>Off-Market{sortArrow('off_market')}</th>
                  <th className="m-r m-sortable" onClick={() => toggleSort('times_listed')}>Times Listed{sortArrow('times_listed')}</th>
                  <th className="m-sortable" onClick={() => toggleSort('sqft')} title="Sorts by square footage">Beds/Baths/SqFt{sortArrow('sqft')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={9} className="m-empty">No matches.</td></tr>}
                {mode === 'prospects' ? sortedRows.map((r) => (
                  <tr key={r.group_key} onClick={() => openTimeline(r.group_key)} className="m-clickrow">
                    <td className="m-starcol" onClick={(e) => e.stopPropagation()}>
                      <button className={'m-starbtn' + (isStarred(r) ? ' on' : '')} onClick={() => toggleStar(r)}>★</button>
                    </td>
                    <td className="m-addr">{r.address}{r.flagged && <span className="m-flag" title="No APN — matched by address">⚑</span>}</td>
                    <td>{r.subdivision || r.neighborhood || r.mls_area || '—'}</td>
                    <td><span className="m-status" style={{ background: (STATUS_COLOR[r.last_status] || '#6a7a82') + '1c', color: STATUS_COLOR[r.last_status] || '#6a7a82' }}>{r.last_status}</span></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input className="m-taginput" placeholder="+ tag" value={r.tag || ''}
                        onChange={(e) => editTag(r, e.target.value)} onBlur={(e) => saveTag(r, e.target.value)} />
                    </td>
                    <td className="m-r">{fmtMoney(r.last_list_price)}</td>
                    <td>{fmtDate(r.last_off_market_date)} <span className="m-dim">({r.days_since_off_market}d)</span></td>
                    <td className="m-r">{r.times_listed_without_selling}</td>
                    <td>{r.beds_total || '—'}/{r.baths_total || '—'}/{r.living_area ? Number(r.living_area).toLocaleString() : '—'}</td>
                  </tr>
                )) : sortedRows.map((r) => (
                  <tr key={r.id} onClick={() => openTimeline(r.group_key)} className="m-clickrow">
                    <td className="m-starcol" onClick={(e) => e.stopPropagation()}>
                      <button className={'m-starbtn' + (isStarred(r) ? ' on' : '')} title={r.is_current_prospect ? 'Currently a prospect' : ''} onClick={() => toggleStar(r)}>★</button>
                    </td>
                    <td className="m-addr">{r.address}{r.flagged && <span className="m-flag" title="No APN — matched by address">⚑</span>}</td>
                    <td>{r.subdivision || r.neighborhood || r.mls_area || '—'}</td>
                    <td><span className="m-status" style={{ background: (STATUS_COLOR[r.status_normalized] || '#6a7a82') + '1c', color: STATUS_COLOR[r.status_normalized] || '#6a7a82' }}>{r.status_normalized}</span></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input className="m-taginput" placeholder="+ tag" value={r.tag || ''}
                        onChange={(e) => editTag(r, e.target.value)} onBlur={(e) => saveTag(r, e.target.value)} />
                    </td>
                    <td className="m-r">{fmtMoney(r.orig_list_price)}</td>
                    <td>{fmtDate(r.off_market_date)}</td>
                    <td className="m-r">—</td>
                    <td>{r.beds_total || '—'}/{r.baths_total || '—'}/{r.living_area ? Number(r.living_area).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {timelineKey && (
        <div className="m-modalbg" onClick={() => setTimelineKey('')}>
          <div className="m-modal" onClick={(e) => e.stopPropagation()}>
            <div className="m-modalhead">
              <span>Listing history</span>
              <button className="m-modalclose" onClick={() => setTimelineKey('')}>✕</button>
            </div>
            {timelineProperty && (
              <div className="m-modalproperty">
                <div className="m-modaladdr">{timelineProperty.address}</div>
                <div className="m-modalsub">
                  {[timelineProperty.subdivision || timelineProperty.neighborhood || timelineProperty.mls_area,
                    timelineProperty.beds_total && `${timelineProperty.beds_total} bd`,
                    timelineProperty.baths_total && `${timelineProperty.baths_total} ba`,
                    timelineProperty.living_area && `${Number(timelineProperty.living_area).toLocaleString()} sqft`]
                    .filter(Boolean).join(' · ')}
                </div>
              </div>
            )}
            <div className="m-modalbody">
              {timelineLoading ? <p>Loading…</p> : timeline.length === 0 ? <p>No history found.</p> : (
                <div className="m-timeline">
                  {timeline.map((t) => (
                    <div className="m-tlrow" key={t.id}>
                      <div className="m-tlstatus"><span className="m-status">{t.status_normalized}</span></div>
                      <div className="m-tlbody">
                        <div className="m-tlmls">MLS# {t.mls_number}</div>
                        <div className="m-tldates">
                          {t.listing_contract_date && <span>Listed {fmtDate(t.listing_contract_date)}</span>}
                          {t.off_market_date && <span>Off-market {fmtDate(t.off_market_date)}</span>}
                          {t.close_date && <span>Closed {fmtDate(t.close_date)}</span>}
                        </div>
                        <div className="m-tlprices">
                          {t.orig_list_price != null && <span>Orig {fmtMoney(t.orig_list_price)}</span>}
                          {t.close_price != null && <span>Close {fmtMoney(t.close_price)}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const css = `
  .m-wrap { max-width: 1300px; margin: 0 auto; padding: 24px 18px 60px; font-family: 'Jost',system-ui,sans-serif; color: #1c2b33; }
  .m-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; flex-wrap: wrap; gap: 10px; }
  .m-head h1 { font-family: 'Cormorant Garamond',serif; font-size: 30px; margin: 0; }
  .m-link { color: #296190; text-decoration: none; margin-right: 14px; font-size: 14px; }
  .m-me { font-size: 13px; color: #6a7a82; }
  .m-tabs { display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid #e6e9ec; }
  .m-tab { background: none; border: 0; border-bottom: 2px solid transparent; padding: 10px 4px; margin-right: 18px; font-family: 'Jost',sans-serif; font-size: 15px; font-weight: 600; color: #6a7a82; cursor: pointer; }
  .m-tab.on { color: #296190; border-bottom-color: #296190; }

  .m-dropzone { border: 2px dashed #bcd2e4; border-radius: 12px; padding: 46px 20px; text-align: center; background: #f5f9fc; cursor: pointer; transition: border-color .15s, background .15s; }
  .m-dropzone.over { border-color: #296190; background: #eaf2fa; }
  .m-droptitle { font-family: 'Cormorant Garamond',serif; font-size: 22px; margin: 0 0 6px; color: #1c2b33; }
  .m-dropsub { font-size: 13.5px; color: #6a7a82; margin: 0; }
  .m-results { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }
  .m-result { background: #fff; border: 1px solid #e6e9ec; border-left: 3px solid #296190; border-radius: 8px; padding: 14px 16px; }
  .m-result.err { border-left-color: #8a2020; }
  .m-resultname { font-weight: 600; font-size: 14px; margin-bottom: 6px; }
  .m-resultstat { font-size: 13px; color: #6a7a82; }
  .m-resultgrid { display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px; color: #4a5a62; }
  .m-resultgrid b { color: #1c2b33; }

  .m-toggle { display: flex; gap: 8px; margin-bottom: 16px; }
  .m-togglebtn { padding: 9px 18px; border: 1px solid #d5dbdf; background: #fff; border-radius: 20px; font-family: 'Jost',sans-serif; font-size: 13.5px; font-weight: 600; color: #4a5a62; cursor: pointer; }
  .m-togglebtn.on { background: #296190; border-color: #296190; color: #fff; }
  .m-filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; align-items: center; }
  .m-filters input, .m-filters select { padding: 9px 11px; border: 1px solid #d5dbdf; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 13.5px; background: #fff; }
  .m-filters input[placeholder*="Address"], .m-filters input[placeholder*="Community"] { flex: 1; min-width: 180px; }
  .m-searchbtn { padding: 9px 18px; background: #296190; color: #fff; border: 0; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 13.5px; font-weight: 600; cursor: pointer; }
  .m-searchbtn:disabled { opacity: .6; cursor: default; }
  .m-exportbtn { padding: 9px 16px; background: #1c5b34; color: #fff; border: 0; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 13.5px; font-weight: 600; cursor: pointer; }

  .m-resultcount { font-size: 13px; color: #6a7a82; margin-bottom: 8px; }
  .m-tablewrap { overflow-x: auto; border: 1px solid #e6e9ec; border-radius: 8px; background: #fff; box-shadow: 0 4px 16px rgba(20,40,60,.04); }
  .m-table { border-collapse: collapse; width: 100%; font-size: 13px; }
  .m-table th { background: #eef2f5; text-align: left; padding: 11px 12px; font-size: 11.5px; font-weight: 700; color: #3a4a52; text-transform: uppercase; letter-spacing: .03em; border-bottom: 1px solid #dde3e7; white-space: nowrap; position: sticky; top: 0; z-index: 1; }
  .m-table th.m-r, .m-table td.m-r { text-align: right; }
  .m-table th.m-sortable { cursor: pointer; user-select: none; }
  .m-table th.m-sortable:hover { color: #296190; }
  .m-table th + th, .m-table td + td { border-left: 1px solid #f0f3f5; }
  .m-table td { border-bottom: 1px solid #f0f3f5; padding: 11px 12px; white-space: nowrap; }
  .m-table tbody tr:nth-child(even) { background: #fafbfc; }
  .m-clickrow { cursor: pointer; }
  .m-clickrow:hover { background: #eef5fb !important; }
  .m-addr { font-weight: 600; color: #1c2b33; }
  .m-flag { margin-left: 6px; color: #b26a00; }
  .m-status { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; padding: 3px 9px; border-radius: 10px; }
  .m-dim { color: #9aa4ab; font-size: 12px; }
  .m-empty { text-align: center; color: #6a7a82; padding: 24px; }
  .m-starcol { width: 36px; text-align: center !important; padding: 6px !important; }
  .m-starbtn { background: none; border: 0; cursor: pointer; font-size: 16px; color: #d5dbdf; padding: 2px; line-height: 1; }
  .m-starbtn.on { color: #e0a800; }
  .m-starbtn:hover { color: #b8860b; }
  .m-taginput { width: 100px; padding: 5px 7px; border: 1px solid #e6e9ec; border-radius: 5px; font-family: 'Jost',sans-serif; font-size: 12.5px; background: #fafbfc; }
  .m-taginput:focus { outline: none; border-color: #296190; background: #fff; }

  .m-modalbg { position: fixed; inset: 0; background: rgba(20,30,38,.55); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 24px; }
  .m-modal { background: #fff; border-radius: 10px; width: 100%; max-width: 560px; max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
  .m-modalhead { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid #e6e9ec; font-weight: 600; }
  .m-modalclose { background: none; border: 0; cursor: pointer; font-size: 16px; color: #6a7a82; }
  .m-modalproperty { padding: 12px 18px; background: #f5f9fc; border-bottom: 1px solid #e6e9ec; }
  .m-modaladdr { font-weight: 700; font-size: 15px; color: #1c2b33; }
  .m-modalsub { font-size: 12.5px; color: #6a7a82; margin-top: 2px; }
  .m-modalbody { padding: 16px 18px; overflow-y: auto; }
  .m-timeline { display: flex; flex-direction: column; gap: 12px; }
  .m-tlrow { display: flex; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid #f0f3f5; }
  .m-tlbody { flex: 1; }
  .m-tlmls { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
  .m-tldates, .m-tlprices { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12.5px; color: #6a7a82; }
  .m-tlprices { margin-top: 2px; }
`;
