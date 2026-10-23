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
const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
const GOLD = '#e0a800';

// Zillow resolves straight to the exact listing page when the URL includes
// city + state (confirmed directly — without them it lands on a generic search
// page instead). This dataset is entirely Carmel Valley / San Diego.
const zillowUrl = (address, postalCode) => {
  const slug = (address || '').replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/).join('-');
  if (!slug) return null;
  return `https://www.zillow.com/homes/${slug}-San-Diego-CA-${(postalCode || '').toString().trim()}_rb/`;
};

export default function MarketDataPage() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState('search');
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
        <div className="m-headright">
          <a className="m-link" href="/admin">← Leads</a>
          <a className="m-link" href="/admin/comps">Comps</a>
          <span className="m-me">{session.user.email}</span>
          <button className="m-uploadbtn" onClick={() => setTab('upload')}>⬆ Upload CSV</button>
        </div>
      </div>

      <div className="m-tabs">
        <button className={'m-tab' + (tab === 'search' ? ' on' : '')} onClick={() => setTab('search')}>Search</button>
        <button className={'m-tab' + (tab === 'lists' ? ' on' : '')} onClick={() => setTab('lists')}>Lists</button>
        <button className={'m-tab' + (tab === 'upload' ? ' on' : '')} onClick={() => setTab('upload')}>Upload</button>
      </div>

      {tab === 'upload' ? <UploadTab token={token} /> : tab === 'lists' ? <ListsTab token={token} /> : <SearchTab token={token} />}

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

// ===== Lists tab =====

function ListsTab({ token }) {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState('');
  const [openList, setOpenList] = useState(null);
  const [openRows, setOpenRows] = useState([]);
  const [openLoading, setOpenLoading] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState('');

  const loadLists = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/market-data?lists=1', { headers: { Authorization: 'Bearer ' + token() } });
      const j = await res.json();
      if (j.ok) setLists(j.lists || []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { loadLists(); }, []);

  const openOne = async (id) => {
    setOpenId(id); setOpenList(null); setOpenRows([]); setOpenLoading(true); setRenaming(false);
    try {
      const res = await fetch('/api/market-data?list_id=' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + token() } });
      const j = await res.json();
      if (j.ok) { setOpenList(j.list); setOpenRows(j.rows || []); }
    } catch {}
    setOpenLoading(false);
  };

  const removeItem = async (groupKey) => {
    setOpenRows((rs) => rs.filter((r) => r.group_key !== groupKey));
    try {
      await fetch('/api/market-data', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ action: 'remove_from_list', list_id: openId, group_key: groupKey }),
      });
      loadLists();
    } catch {}
  };

  const saveRename = async () => {
    const name = renameVal.trim();
    if (!name) { setRenaming(false); return; }
    setOpenList((l) => ({ ...l, name }));
    setRenaming(false);
    try {
      await fetch('/api/market-data', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ action: 'rename_list', list_id: openId, name }),
      });
      loadLists();
    } catch {}
  };

  const deleteList = async () => {
    if (!window.confirm(`Delete list "${openList?.name}"? This can't be undone.`)) return;
    try {
      await fetch('/api/market-data', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ action: 'delete_list', list_id: openId }),
      });
    } catch {}
    setOpenId(''); setOpenList(null); setOpenRows([]);
    loadLists();
  };

  const exportCSV = () => {
    const cols = ['address', 'subdivision', 'neighborhood', 'mls_area', 'property_sub_type', 'beds_total', 'baths_total', 'living_area', 'status_normalized', 'orig_list_price', 'off_market_date', 'tag'];
    const esc = (v) => '"' + (v == null ? '' : String(v).replace(/"/g, '""')) + '"';
    const csv = [cols.join(',')].concat(openRows.map((r) => cols.map((c) => esc(r[c])).join(','))).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (openList?.name || 'list').replace(/[^a-z0-9]+/gi, '-') + '.csv';
    a.click(); URL.revokeObjectURL(url);
  };

  if (openId) {
    return (
      <div className="m-listsview">
        <button className="m-backbtn" onClick={() => { setOpenId(''); setOpenList(null); }}>← All lists</button>
        {openLoading ? <p>Loading…</p> : !openList ? <p>List not found.</p> : (
          <>
            <div className="m-listhead">
              {renaming ? (
                <div className="m-listrename">
                  <input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} autoFocus />
                  <button onClick={saveRename}>Save</button>
                  <button onClick={() => setRenaming(false)}>Cancel</button>
                </div>
              ) : (
                <h2>{openList.name} <span className="m-listcount">({openRows.length})</span></h2>
              )}
              <div className="m-listactions">
                {!renaming && <button className="m-listactbtn" onClick={() => { setRenaming(true); setRenameVal(openList.name); }}>Rename</button>}
                {openRows.length > 0 && <button className="m-listactbtn" onClick={exportCSV}>Export CSV</button>}
                <button className="m-listactbtn danger" onClick={deleteList}>Delete list</button>
              </div>
            </div>
            <div className="m-tablewrap">
              <table className="m-table">
                <thead>
                  <tr>
                    <th>Address</th><th>Community</th><th>Status</th><th>Tag</th>
                    <th className="m-r">List Price</th><th>Off-Market</th><th>Beds/Baths/SqFt</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {openRows.length === 0 && <tr><td colSpan={8} className="m-empty">No properties in this list yet.</td></tr>}
                  {openRows.map((r) => (
                    <tr key={r.group_key}>
                      <td className="m-addr">{r.address}</td>
                      <td>{r.subdivision || r.neighborhood || r.mls_area || '—'}</td>
                      <td><span className="m-status" style={{ background: (STATUS_COLOR[r.status_normalized] || '#6a7a82') + '1c', color: STATUS_COLOR[r.status_normalized] || '#6a7a82' }}>{r.status_normalized}</span></td>
                      <td>{r.tag || '—'}</td>
                      <td className="m-r">{fmtMoney(r.orig_list_price)}</td>
                      <td>{fmtDate(r.off_market_date)}</td>
                      <td>{r.beds_total || '—'}/{r.baths_total || '—'}/{r.living_area ? Number(r.living_area).toLocaleString() : '—'}</td>
                      <td><button className="m-removebtn" onClick={() => removeItem(r.group_key)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="m-listsview">
      {loading ? <p>Loading…</p> : lists.length === 0 ? (
        <p className="m-dim">No lists yet — select properties in Search (table or map) and add them to a new list.</p>
      ) : (
        <div className="m-listsgrid">
          {lists.map((l) => (
            <div className="m-listcard" key={l.id} onClick={() => openOne(l.id)}>
              <div className="m-listcardname">{l.name}</div>
              <div className="m-listcardmeta">{l.item_count} propert{l.item_count === 1 ? 'y' : 'ies'}</div>
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
  const [sqftMin, setSqftMin] = useState('');
  const [sqftMax, setSqftMax] = useState('');
  const [beds, setBeds] = useState('');
  const [subType, setSubType] = useState('');
  const [listFilter, setListFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [rows, setRows] = useState([]);
  const [mode, setMode] = useState('prospects');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sort, setSort] = useState({ key: null, dir: 1 });
  const [view, setView] = useState('table'); // table | map
  const [geocoding, setGeocoding] = useState(false);
  const [geoProgress, setGeoProgress] = useState(null); // { done, remaining }
  const [timelineKey, setTimelineKey] = useState('');
  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineIndex, setTimelineIndex] = useState(-1); // position within sortedRows, for Prev/Next
  const [showDetails, setShowDetails] = useState(false);
  const [addrCopied, setAddrCopied] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [lists, setLists] = useState([]);
  const [listChoice, setListChoice] = useState('');
  const [newListName, setNewListName] = useState('');
  const [addingToList, setAddingToList] = useState(false);
  const [addMsg, setAddMsg] = useState('');

  const loadLists = async () => {
    try {
      const res = await fetch('/api/market-data?lists=1', { headers: { Authorization: 'Bearer ' + token() } });
      const j = await res.json();
      if (j.ok) setLists(j.lists || []);
    } catch {}
  };
  useEffect(() => { loadLists(); }, []);

  const toggleSelect = (groupKey) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
      return next;
    });
  };
  const toggleSelectAll = () => {
    const keys = sortedRows.map((r) => r.group_key);
    const allSelected = keys.length > 0 && keys.every((k) => selected.has(k));
    setSelected(allSelected ? new Set() : new Set(keys));
  };

  const addSelectedToList = async () => {
    const groupKeys = Array.from(selected);
    if (!groupKeys.length) return;
    setAddingToList(true); setAddMsg('');
    try {
      let listId = listChoice;
      if (!listId && newListName.trim()) {
        const res = await fetch('/api/market-data', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
          body: JSON.stringify({ action: 'create_list', name: newListName.trim() }),
        });
        const j = await res.json();
        if (j.ok) { listId = j.list.id; await loadLists(); setListChoice(listId); setNewListName(''); }
        else { setAddMsg(j.error || 'Could not create list.'); setAddingToList(false); return; }
      }
      if (!listId) { setAddMsg('Pick or name a list.'); setAddingToList(false); return; }
      const res = await fetch('/api/market-data', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ action: 'add_to_list', list_id: listId, group_keys: groupKeys }),
      });
      const j = await res.json();
      if (j.ok) { setAddMsg(`Added ${groupKeys.length} to list ✓`); setSelected(new Set()); loadLists(); }
      else setAddMsg(j.error || 'Could not add to list.');
    } catch { setAddMsg('Error adding to list.'); }
    setAddingToList(false);
    setTimeout(() => setAddMsg(''), 3000);
  };

  const runSearch = async () => {
    setLoading(true); setSearched(true);
    const params = new URLSearchParams({
      prospects_only: prospectsOnly ? '1' : '0',
      status, community, address, off_from: offFrom, off_to: offTo,
      price_min: priceMin, price_max: priceMax, sqft_min: sqftMin, sqft_max: sqftMax,
      beds, sub_type: subType, filter_list_id: listFilter, tag: tagFilter,
    });
    try {
      const res = await fetch('/api/market-data?' + params.toString(), { headers: { Authorization: 'Bearer ' + token() } });
      const j = await res.json();
      if (j.ok) { setRows(j.rows || []); setMode(j.mode); }
    } catch {}
    setLoading(false);
  };

  const openTimeline = async (groupKey, index) => {
    setTimelineKey(groupKey); setTimeline([]); setTimelineLoading(true);
    setTimelineIndex(index != null ? index : -1);
    setShowDetails(false);
    try {
      const res = await fetch('/api/market-data?group_key=' + encodeURIComponent(groupKey), { headers: { Authorization: 'Bearer ' + token() } });
      const j = await res.json();
      if (j.ok) setTimeline(j.listings || []);
    } catch {}
    setTimelineLoading(false);
  };

  const goToTimeline = (delta) => {
    const next = timelineIndex + delta;
    if (next < 0 || next >= sortedRows.length) return;
    const r = sortedRows[next];
    openTimeline(r.group_key, next);
  };

  // Every episode in a timeline shares the same property; timeline[0] (now
  // newest-first) identifies it for the modal header.
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

  // Geocodes the whole database (not just the current search), in small bounded
  // batches so no single request risks a serverless timeout. Loops until none remain.
  const runGeocodeBackfill = async () => {
    setGeocoding(true);
    let done = 0;
    try {
      while (true) {
        const res = await fetch('/api/market-data', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
          body: JSON.stringify({ action: 'geocode_batch', limit: 25 }),
        });
        const j = await res.json();
        if (!j.ok) break;
        done += j.processed;
        setGeoProgress({ done, remaining: j.remaining });
        if (j.remaining <= 0 || j.processed === 0) break;
      }
    } catch {}
    setGeocoding(false);
    if (searched) runSearch(); // refresh so newly-geocoded rows get their coordinates
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
        <div className="m-datefield">
          <span className="m-datelabel">Off-market date</span>
          <div className="m-daterange">
            <input type="date" value={offFrom} onChange={(e) => setOffFrom(e.target.value)} title="Off-market from" />
            <span>to</span>
            <input type="date" value={offTo} onChange={(e) => setOffTo(e.target.value)} title="Off-market to" />
            {(offFrom || offTo) && <button type="button" className="m-dateclear" title="Clear dates" onClick={() => { setOffFrom(''); setOffTo(''); }}>✕</button>}
          </div>
        </div>
        <input type="number" placeholder="Min price" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
        <input type="number" placeholder="Max price" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
        <input type="number" placeholder="Min sqft" value={sqftMin} onChange={(e) => setSqftMin(e.target.value)} />
        <input type="number" placeholder="Max sqft" value={sqftMax} onChange={(e) => setSqftMax(e.target.value)} />
        <input type="number" placeholder="Beds (min)" value={beds} onChange={(e) => setBeds(e.target.value)} />
        <input placeholder="Property sub type…" value={subType} onChange={(e) => setSubType(e.target.value)} />
        <select value={listFilter} onChange={(e) => setListFilter(e.target.value)}>
          <option value="">Any list</option>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.item_count})</option>)}
        </select>
        <input placeholder="Tag…" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} />
        <button className="m-searchbtn" onClick={runSearch} disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
        {searched && rows.length > 0 && <button className="m-exportbtn" onClick={exportCSV}>Export CSV</button>}
      </div>

      {searched && (
        <div className="m-resultswrap">
          <div className="m-resultbar">
            <div className="m-resultcount">{rows.length} result{rows.length === 1 ? '' : 's'}</div>
            <div className="m-viewtoggle">
              <button className={'m-viewbtn' + (view === 'table' ? ' on' : '')} onClick={() => setView('table')}>Table</button>
              <button className={'m-viewbtn' + (view === 'map' ? ' on' : '')} onClick={() => setView('map')}>Map</button>
            </div>
          </div>

          {view === 'map' && (
            <div className="m-geocodebar">
              {geocoding ? (
                <span>Geocoding… {geoProgress ? `${geoProgress.done} done, ${geoProgress.remaining} left` : ''}</span>
              ) : (
                <>
                  <span>Addresses without map coordinates won't show as pins.</span>
                  <button className="m-geocodebtn" onClick={runGeocodeBackfill}>Geocode all addresses</button>
                </>
              )}
            </div>
          )}

          {selected.size > 0 && (
            <div className="m-selectbar">
              <span className="m-selectcount">{selected.size} selected</span>
              <select value={listChoice} onChange={(e) => { setListChoice(e.target.value); if (e.target.value) setNewListName(''); }}>
                <option value="">Choose a list…</option>
                {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.item_count})</option>)}
              </select>
              <span className="m-selectorsep">or</span>
              <input placeholder="New list name…" value={newListName}
                onChange={(e) => { setNewListName(e.target.value); if (e.target.value) setListChoice(''); }} />
              <button className="m-addlistbtn" onClick={addSelectedToList} disabled={addingToList || (!listChoice && !newListName.trim())}>
                {addingToList ? 'Adding…' : 'Add to list'}
              </button>
              {addMsg && <span className="m-selectmsg">{addMsg}</span>}
              <button className="m-clearselectbtn" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          )}

          {view === 'map' ? (
            <MarketMap rows={sortedRows} mode={mode} isStarred={isStarred} onMarkerClick={openTimeline} selected={selected} onToggleSelect={toggleSelect} />
          ) : (
          <div className="m-tablewrap">
            <table className="m-table">
              <thead>
                <tr>
                  <th className="m-checkcol">
                    <input type="checkbox" checked={sortedRows.length > 0 && sortedRows.every((r) => selected.has(r.group_key))} onChange={toggleSelectAll} title="Select all" />
                  </th>
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
                {rows.length === 0 && <tr><td colSpan={10} className="m-empty">No matches.</td></tr>}
                {mode === 'prospects' ? sortedRows.map((r, i) => (
                  <tr key={r.group_key} onClick={() => openTimeline(r.group_key, i)} className="m-clickrow">
                    <td className="m-checkcol" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(r.group_key)} onChange={() => toggleSelect(r.group_key)} />
                    </td>
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
                )) : sortedRows.map((r, i) => (
                  <tr key={r.id} onClick={() => openTimeline(r.group_key, i)} className="m-clickrow">
                    <td className="m-checkcol" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(r.group_key)} onChange={() => toggleSelect(r.group_key)} />
                    </td>
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
          )}
        </div>
      )}

      {timelineKey && (
        <div className="m-modalbg" onClick={() => setTimelineKey('')}>
          <div className="m-modal" onClick={(e) => e.stopPropagation()}>
            <div className="m-modalhead">
              <div className="m-modalnav">
                <button className="m-navbtn" onClick={() => goToTimeline(-1)} disabled={timelineIndex <= 0} title="Previous">‹ Prev</button>
                <button className="m-navbtn" onClick={() => goToTimeline(1)} disabled={timelineIndex < 0 || timelineIndex >= sortedRows.length - 1} title="Next">Next ›</button>
              </div>
              <span>Listing history</span>
              <button className="m-modalclose" onClick={() => setTimelineKey('')}>✕</button>
            </div>
            {timelineProperty && (
              <div className="m-modalproperty">
                <div className="m-modaladdrrow">
                  <div className="m-modaladdrgroup">
                    <div className="m-modaladdr">{timelineProperty.address}</div>
                    <button className="m-inlinebtn" onClick={() => {
                      navigator.clipboard?.writeText(timelineProperty.address || '');
                      setAddrCopied(true); setTimeout(() => setAddrCopied(false), 1500);
                    }}>{addrCopied ? 'Copied ✓' : 'Copy'}</button>
                    <button className="m-inlinebtn" onClick={() => setShowDetails((d) => !d)}>{showDetails ? 'Hide details' : 'Details'}</button>
                  </div>
                  <div className="m-modallinks">
                    {timelineProperty.address && (
                      <a className="m-mapsbtn" target="_blank" rel="noopener"
                        href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(timelineProperty.address)}>
                        📍 Google Maps
                      </a>
                    )}
                    {zillowUrl(timelineProperty.address, timelineProperty.postal_code) && (
                      <a className="m-mapsbtn" target="_blank" rel="noopener"
                        href={zillowUrl(timelineProperty.address, timelineProperty.postal_code)}>
                        🏠 Zillow
                      </a>
                    )}
                  </div>
                </div>
                <div className="m-modalsub">
                  {[timelineProperty.subdivision || timelineProperty.neighborhood || timelineProperty.mls_area,
                    timelineProperty.beds_total && `${timelineProperty.beds_total} bd`,
                    timelineProperty.baths_total && `${timelineProperty.baths_total} ba`,
                    timelineProperty.living_area && `${Number(timelineProperty.living_area).toLocaleString()} sqft`]
                    .filter(Boolean).join(' · ')}
                </div>
                {showDetails && (
                  <div className="m-detailsgrid">
                    <div><span>APN</span><b>{timelineProperty.apn_normalized || '—'}</b></div>
                    <div><span>Postal Code</span><b>{timelineProperty.postal_code || '—'}</b></div>
                    <div><span>Subdivision</span><b>{timelineProperty.subdivision || '—'}</b></div>
                    <div><span>Neighborhood</span><b>{timelineProperty.neighborhood || '—'}</b></div>
                    <div><span>MLS Area</span><b>{timelineProperty.mls_area || '—'}</b></div>
                    <div><span>Property Type</span><b>{timelineProperty.property_sub_type || '—'}</b></div>
                    <div><span>Year Built</span><b>{timelineProperty.year_built || '—'}</b></div>
                    <div><span>Lot Size</span><b>{timelineProperty.lot_size_sqft ? Number(timelineProperty.lot_size_sqft).toLocaleString() + ' sqft' : '—'}</b></div>
                  </div>
                )}
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

// ---- Google Map with status-colored pins ----
function MarketMap({ rows, mode, isStarred, onMarkerClick, selected, onToggleSelect }) {
  const ref = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ok | nocoords | noauth

  const pts = rows.filter((r) => r.lat && r.lng);

  // The main map-build effect deliberately doesn't depend on `selected` (toggling
  // a selection shouldn't rebuild the map and reset pan/zoom), so its mouseover
  // closures can't just read the `selected` prop — they'd see a stale snapshot.
  // A ref kept in sync on every selection change gives them the live value instead.
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // Bridge for the plain-HTML InfoWindow content to call back into React without
  // rebuilding the whole map (selection shouldn't reset pan/zoom or reload markers).
  useEffect(() => {
    window.__mdToggleSelect = (groupKey) => onToggleSelect(groupKey);
    return () => { delete window.__mdToggleSelect; };
  }, [onToggleSelect]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!MAPS_KEY) { setStatus('noauth'); return; }
    if (!pts.length) { setStatus('nocoords'); return; }

    let cancelled = false;
    window.gm_authFailure = () => { if (!cancelled) setStatus('noauth'); };

    // Same official async bootstrap as the Comps map (app/comps/[slug]/page.js) —
    // loads google.maps.importLibrary once, reused if this script tag already exists.
    const ensureLoader = () => new Promise((resolve, reject) => {
      if (window.google && window.google.maps && window.google.maps.importLibrary) { resolve(); return; }
      const existing = document.getElementById('gmaps-js');
      if (existing) { existing.addEventListener('load', () => resolve()); existing.addEventListener('error', reject); return; }
      (function (g) {
        var h, a, k, p = 'The Google Maps JavaScript API', c = 'google', l = 'importLibrary', q = '__ib__', m = document, b = window;
        b = b[c] || (b[c] = {});
        var d = b.maps || (b.maps = {}), r = new Set(), e = new URLSearchParams(), u = function () {
          return h || (h = new Promise(function (f, n) {
            a = m.createElement('script'); a.id = 'gmaps-js';
            e.set('libraries', [...r] + '');
            e.set('key', MAPS_KEY);
            a.src = 'https://maps.' + c + 'apis.com/maps/api/js?' + e;
            a.onerror = function () { n(Error(p + ' could not load.')); };
            a.onload = function () { f(); };
            m.head.append(a);
          }));
        };
        d[l] ? 0 : d[l] = function (f) { for (var _ = arguments.length, n = new Array(_ > 1 ? _ - 1 : 0), x = 1; x < _; x++) n[x - 1] = arguments[x]; return r.add(f) && u().then(function () { return d[l].apply(d, [f, ...n]); }); };
      })({});
      const check = setInterval(() => { if (window.google && window.google.maps && window.google.maps.importLibrary) { clearInterval(check); resolve(); } }, 50);
      setTimeout(() => { clearInterval(check); if (!(window.google && window.google.maps && window.google.maps.importLibrary)) reject(Error('timeout')); }, 8000);
    });

    (async () => {
      try {
        await ensureLoader();
        const { Map, InfoWindow } = await window.google.maps.importLibrary('maps');
        const { Marker } = await window.google.maps.importLibrary('marker');
        if (cancelled || !ref.current) return;
        const g = window.google.maps;
        const map = new Map(ref.current, {
          mapTypeId: 'roadmap', mapTypeControl: true, streetViewControl: false, fullscreenControl: true,
        });
        const bounds = new g.LatLngBounds();
        const info = new InfoWindow();
        pts.forEach((r) => {
          const pos = { lat: Number(r.lat), lng: Number(r.lng) };
          bounds.extend(pos);
          const rowStatus = mode === 'prospects' ? r.last_status : r.status_normalized;
          const color = STATUS_COLOR[rowStatus] || '#6a7a82';
          const starred = isStarred(r);
          const marker = new Marker({
            position: pos, map, title: r.address,
            icon: { path: g.SymbolPath.CIRCLE, scale: starred ? 11 : 8, fillColor: starred ? GOLD : color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
          });
          // Hover shows a quick preview (with a select-toggle button bridged back
          // into React); click opens the full history modal, same as a table row.
          marker.addListener('mouseover', () => {
            const price = fmtMoney(mode === 'prospects' ? r.last_list_price : r.orig_list_price);
            const isSel = selectedRef.current.has(r.group_key);
            const gkEscaped = (r.group_key || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            info.setContent(
              '<div style="font-family:Jost,sans-serif;max-width:220px;color:#1c2b33">' +
              '<div style="font-weight:700;font-size:15px">' + (r.address || '') + '</div>' +
              '<div style="font-size:14px;font-weight:600;margin:2px 0 4px">' + price + '</div>' +
              '<div style="font-size:12px;color:#6a7a82">' + [rowStatus, r.subdivision || r.neighborhood].filter(Boolean).join(' · ') + '</div>' +
              (r.tag ? '<div style="font-size:11.5px;color:#296190;margin-top:4px">#' + r.tag + '</div>' : '') +
              '<button onclick="window.__mdToggleSelect && window.__mdToggleSelect(\'' + gkEscaped + '\')" style="margin-top:8px;padding:4px 10px;font-size:11.5px;font-weight:600;border-radius:5px;cursor:pointer;' +
                (isSel ? 'background:#296190;color:#fff;border:1px solid #296190;' : 'background:#fff;color:#4a5a62;border:1px solid #d5dbdf;') +
              '">' + (isSel ? '☑ Selected' : '☐ Select') + '</button>' +
              '</div>'
            );
            info.open(map, marker);
          });
          marker.addListener('click', () => onMarkerClick(r.group_key, rows.indexOf(r)));
        });
        map.fitBounds(bounds, 60);
        g.event.addListenerOnce(map, 'idle', () => { if (pts.length === 1) map.setZoom(15); });
        if (!cancelled) setStatus('ok');
      } catch (e) {
        console.error('market map load error', e);
        if (!cancelled) setStatus('noauth');
      }
    })();

    return () => { cancelled = true; };
  }, [rows, mode]);

  return (
    <div className="m-mapwrap">
      <div ref={ref} className="m-map" style={{ display: status === 'ok' || status === 'loading' ? 'block' : 'none' }} />
      {status === 'nocoords' && <div className="m-mapmsg">None of these results have map coordinates yet. Click "Geocode all addresses" above.</div>}
      {status === 'noauth' && <div className="m-mapmsg">The map could not load — check the Google Maps key and billing.</div>}
    </div>
  );
}

const css = `
  .m-wrap { max-width: 1300px; margin: 0 auto; padding: 24px 18px 60px; font-family: 'Jost',system-ui,sans-serif; color: #1c2b33; }
  .m-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; flex-wrap: wrap; gap: 10px; }
  .m-head h1 { font-family: 'Cormorant Garamond',serif; font-size: 30px; margin: 0; }
  .m-headright { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .m-link { color: #296190; text-decoration: none; font-size: 14px; }
  .m-me { font-size: 13px; color: #6a7a82; }
  .m-uploadbtn { padding: 8px 15px; background: #296190; color: #fff; border: 0; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; }
  .m-uploadbtn:hover { background: #21506f; }
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
  .m-datefield { display: flex; flex-direction: column; gap: 3px; }
  .m-datelabel { font-size: 10.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #8a9aa2; }
  .m-daterange { display: flex; align-items: center; gap: 6px; }
  .m-daterange span { font-size: 12.5px; color: #9aa4ab; }
  .m-dateclear { background: none; border: 0; cursor: pointer; font-size: 12px; color: #9aa4ab; padding: 2px 4px; }
  .m-dateclear:hover { color: #8a2020; }
  .m-searchbtn { padding: 9px 18px; background: #296190; color: #fff; border: 0; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 13.5px; font-weight: 600; cursor: pointer; }
  .m-searchbtn:disabled { opacity: .6; cursor: default; }
  .m-exportbtn { padding: 9px 16px; background: #1c5b34; color: #fff; border: 0; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 13.5px; font-weight: 600; cursor: pointer; }

  .m-resultbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .m-resultcount { font-size: 13px; color: #6a7a82; }
  .m-viewtoggle { display: flex; gap: 4px; background: #eef1f3; border-radius: 8px; padding: 3px; }
  .m-viewbtn { padding: 6px 14px; border: 0; background: none; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 12.5px; font-weight: 600; color: #6a7a82; cursor: pointer; }
  .m-viewbtn.on { background: #fff; color: #296190; box-shadow: 0 1px 3px rgba(20,40,60,.12); }
  .m-geocodebar { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #fdf3da; border: 1px solid #f0e2b8; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; font-size: 13px; color: #6a5215; }
  .m-geocodebtn { padding: 7px 14px; background: #296190; color: #fff; border: 0; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .m-mapwrap { border: 1px solid #e6e9ec; border-radius: 8px; overflow: hidden; background: #fff; }
  .m-map { width: 100%; height: 520px; }
  .m-mapmsg { padding: 40px 20px; text-align: center; color: #6a7a82; font-size: 13.5px; }
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
  .m-listsview { margin-top: 4px; }
  .m-listsgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  .m-listcard { background: #fff; border: 1px solid #e6e9ec; border-radius: 10px; padding: 16px; cursor: pointer; transition: box-shadow .15s, border-color .15s; }
  .m-listcard:hover { border-color: #296190; box-shadow: 0 4px 14px rgba(20,40,60,.08); }
  .m-listcardname { font-weight: 700; font-size: 15px; color: #1c2b33; margin-bottom: 4px; }
  .m-listcardmeta { font-size: 12.5px; color: #6a7a82; }
  .m-backbtn { background: none; border: 0; color: #296190; font-family: 'Jost',sans-serif; font-size: 13.5px; cursor: pointer; padding: 0; margin-bottom: 14px; }
  .m-listhead { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
  .m-listhead h2 { font-family: 'Cormorant Garamond',serif; font-size: 24px; margin: 0; }
  .m-listcount { font-size: 15px; color: #9aa4ab; font-weight: 400; }
  .m-listrename { display: flex; gap: 8px; align-items: center; }
  .m-listrename input { padding: 7px 10px; border: 1px solid #d5dbdf; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 15px; }
  .m-listrename button { padding: 6px 12px; border: 1px solid #d5dbdf; background: #fff; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 12.5px; cursor: pointer; }
  .m-listactions { display: flex; gap: 8px; }
  .m-listactbtn { padding: 7px 13px; border: 1px solid #d5dbdf; background: #fff; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 12.5px; font-weight: 600; color: #4a5a62; cursor: pointer; }
  .m-listactbtn:hover { border-color: #296190; color: #296190; }
  .m-listactbtn.danger:hover { border-color: #8a2020; color: #8a2020; }
  .m-removebtn { background: none; border: 0; color: #8a2020; font-family: 'Jost',sans-serif; font-size: 12px; cursor: pointer; opacity: .7; }
  .m-removebtn:hover { opacity: 1; text-decoration: underline; }
  .m-checkcol { width: 32px; text-align: center !important; padding: 6px !important; }
  .m-starcol { width: 36px; text-align: center !important; padding: 6px !important; }
  .m-selectbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: #eaf2fa; border: 1px solid #bcd2e4; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; font-size: 13px; }
  .m-selectbar select, .m-selectbar input { padding: 7px 9px; border: 1px solid #d5dbdf; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 12.5px; background: #fff; }
  .m-selectcount { font-weight: 700; color: #1c2b33; white-space: nowrap; }
  .m-selectorsep { color: #9aa4ab; font-size: 12px; }
  .m-addlistbtn { padding: 7px 14px; background: #296190; color: #fff; border: 0; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .m-addlistbtn:disabled { opacity: .5; cursor: default; }
  .m-selectmsg { color: #1c5b34; font-weight: 600; }
  .m-clearselectbtn { background: none; border: 0; color: #6a7a82; font-family: 'Jost',sans-serif; font-size: 12.5px; cursor: pointer; text-decoration: underline; margin-left: auto; }
  .m-starbtn { background: none; border: 0; cursor: pointer; font-size: 16px; color: #d5dbdf; padding: 2px; line-height: 1; }
  .m-starbtn.on { color: #e0a800; }
  .m-starbtn:hover { color: #b8860b; }
  .m-taginput { width: 100px; padding: 5px 7px; border: 1px solid #e6e9ec; border-radius: 5px; font-family: 'Jost',sans-serif; font-size: 12.5px; background: #fafbfc; }
  .m-taginput:focus { outline: none; border-color: #296190; background: #fff; }

  .m-modalbg { position: fixed; inset: 0; background: rgba(20,30,38,.55); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 24px; }
  .m-modal { background: #fff; border-radius: 10px; width: 100%; max-width: 560px; max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
  .m-modalhead { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid #e6e9ec; font-weight: 600; gap: 10px; }
  .m-modalclose { background: none; border: 0; cursor: pointer; font-size: 16px; color: #6a7a82; }
  .m-modalnav { display: flex; gap: 6px; }
  .m-navbtn { background: none; border: 1px solid #d5dbdf; border-radius: 6px; padding: 5px 10px; font-family: 'Jost',sans-serif; font-size: 12px; font-weight: 600; color: #4a5a62; cursor: pointer; }
  .m-navbtn:hover:not(:disabled) { border-color: #296190; color: #296190; }
  .m-navbtn:disabled { opacity: .35; cursor: default; }
  .m-modalproperty { padding: 12px 18px; background: #f5f9fc; border-bottom: 1px solid #e6e9ec; }
  .m-modaladdrrow { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .m-modaladdrgroup { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .m-modaladdr { font-weight: 700; font-size: 15px; color: #1c2b33; }
  .m-inlinebtn { background: none; border: 0; color: #b8341f; font-family: 'Jost',sans-serif; font-size: 12.5px; font-weight: 600; cursor: pointer; padding: 0; }
  .m-inlinebtn:hover { text-decoration: underline; }
  .m-modallinks { display: flex; gap: 8px; }
  .m-mapsbtn { font-size: 12.5px; font-weight: 600; color: #296190; text-decoration: none; white-space: nowrap; border: 1px solid #bcd2e4; border-radius: 6px; padding: 5px 10px; }
  .m-mapsbtn:hover { background: #eaf2fa; }
  .m-detailsgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; margin-top: 12px; padding-top: 12px; border-top: 1px dashed #dde3e7; }
  .m-detailsgrid div { display: flex; justify-content: space-between; font-size: 12.5px; padding: 3px 0; border-bottom: 1px solid #eef1f3; }
  .m-detailsgrid span { color: #9aa4ab; } .m-detailsgrid b { color: #1c2b33; font-weight: 600; }
  .m-modalsub { font-size: 12.5px; color: #6a7a82; margin-top: 2px; }
  .m-modalbody { padding: 16px 18px; overflow-y: auto; }
  .m-timeline { display: flex; flex-direction: column; gap: 12px; }
  .m-tlrow { display: flex; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid #f0f3f5; }
  .m-tlbody { flex: 1; }
  .m-tlmls { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
  .m-tldates, .m-tlprices { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12.5px; color: #6a7a82; }
  .m-tlprices { margin-top: 2px; }
`;
