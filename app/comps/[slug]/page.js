'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';

const LAKE = '#344a57';
const GOLD = '#c9a96e';
const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

const toNum = (v) => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n !== 0 ? n : null; };
const fmtFull = (v) => { const n = toNum(v); return n ? '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : ''; };
const fmtNum = (v) => { const n = toNum(v); return n ? n.toLocaleString('en-US') : (v || ''); };
const fmtPpsf = (v) => { if (!v) return ''; const s = String(v); return s.startsWith('$') ? s : '$' + Math.round(toNum(s) || 0).toLocaleString(); };

const GROUPS = [
  { key: 'active', label: 'Active', badge: 'A', color: '#2f7d4f', match: (s) => s.includes('active') },
  { key: 'pending', label: 'Pending', badge: 'P', color: '#b88a2e', match: (s) => s.includes('pend') || s.includes('contingent') || s.includes('under contract') },
  { key: 'sold', label: 'Sold', badge: 'S', color: '#b04a3a', match: (s) => s.includes('close') || s.includes('sold') },
  { key: 'cancelled', label: 'Cancelled', badge: 'C', color: '#5a7fb0', match: (s) => s.includes('cancel') },
  { key: 'expired', label: 'Expired', badge: 'X', color: '#6b7fc4', match: (s) => s.includes('expir') },
  { key: 'withdrawn', label: 'Withdrawn', badge: 'W', color: '#8a7bb0', match: (s) => s.includes('withdraw') },
];
const groupOf = (status) => { const s = (status || '').toLowerCase(); const g = GROUPS.find((gr) => gr.match(s)); return g ? g.key : 'other'; };
const groupMeta = (key) => GROUPS.find((g) => g.key === key) || { label: 'Other', badge: '•', color: '#8a9aa2' };
const statusClass = (s) => { const k = groupOf(s); return k === 'sold' ? 'st-closed' : k === 'active' ? 'st-active' : k === 'pending' ? 'st-pending' : 'st-other'; };

// Primary fields shown as one-per-line rows (in order).
const PRIMARY = [
  { k: 'status', label: 'Status' },
  { k: 'sub_type', label: 'Sub Type' },
  { k: 'beds', label: 'Beds' },
  { k: 'baths', label: 'Baths' },
  { k: 'lot_size_sqft', label: 'Lot Sqft', num: true },
  { k: 'living_area', label: 'Living Area', num: true },
  { k: 'current_price', label: 'Current Price', money: true },
  { k: 'close_price', label: 'Close Price', money: true, big: true },
  { k: 'price_ppsf', label: 'Price / SqFt', ppsf: true },
  { k: 'sold_ppsf', label: 'Sold $/SqFt', ppsf: true, gold: true },
  { k: 'close_date', label: 'Close Date' },
  { k: 'year_built', label: 'Year Built' },
];

export default function PublicComps() {
  const { slug } = useParams();
  const [state, setState] = useState('loading');
  const [report, setReport] = useState(null);
  const [comps, setComps] = useState([]);
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState({});
  const [sort, setSort] = useState({ key: null, dir: 1 });

  useEffect(() => {
    let alive = true;
    fetch('/api/comps?slug=' + encodeURIComponent(slug))
      .then((r) => r.json())
      .then((j) => { if (!alive) return; if (j.ok) { setReport(j.report); setComps(j.comps || []); setState('ok'); } else setState('error'); })
      .catch(() => alive && setState('error'));
    return () => { alive = false; };
  }, [slug]);

  const priceOf = (c) => (groupOf(c.status) === 'sold' ? c.close_price : (c.current_price || c.orig_list_price)) || c.close_price || c.current_price || c.orig_list_price || '';
  const ppsfOf = (c) => (groupOf(c.status) === 'sold' ? (c.sold_ppsf || c.price_ppsf) : c.price_ppsf) || c.sold_ppsf || c.price_ppsf || '';

  const sortKeyVal = (c, key) => {
    switch (key) {
      case 'address': return (c.address || '').toLowerCase();
      case 'price': return toNum(priceOf(c)) || 0;
      case 'beds': return toNum(c.beds) || 0;
      case 'baths': return toNum(c.baths) || 0;
      case 'sqft': return toNum(c.living_area) || 0;
      case 'ppsf': return toNum(ppsfOf(c)) || 0;
      case 'close_date': return c.close_date ? new Date(c.close_date).getTime() || 0 : 0;
      case 'dom': return toNum(c.days_on_market) || 0;
      case 'status': return (c.status || '').toLowerCase();
      default: return 0;
    }
  };
  const sortedComps = useMemo(() => {
    if (!sort.key) return comps;
    const arr = comps.slice();
    arr.sort((a, b) => {
      const va = sortKeyVal(a, sort.key), vb = sortKeyVal(b, sort.key);
      if (va < vb) return -1 * sort.dir;
      if (va > vb) return 1 * sort.dir;
      return 0;
    });
    return arr;
  }, [comps, sort]);
  const toggleSort = (key) => setSort((s2) => s2.key === key ? { key, dir: -s2.dir } : { key, dir: 1 });
  const arrow = (key) => sort.key === key ? (sort.dir === 1 ? ' \u25b4' : ' \u25be') : '';

  // Normalize an address for matching: lowercase, drop everything after the first
  // comma, strip punctuation, and canonicalize common street suffixes so e.g.
  // "12343 Calderon Rd" matches "12343 Calderon Road".
  const SUFFIX = { rd:'road', dr:'drive', st:'street', ave:'avenue', av:'avenue', blvd:'boulevard', ln:'lane', ct:'court', pl:'place', ter:'terrace', cir:'circle', way:'way', trl:'trail', row:'row', pkwy:'parkway', hwy:'highway' };
  const norm = (a) => {
    let x = (a || '').toString().toLowerCase().replace(/,.*$/, '').replace(/[.#]/g, ' ');
    const words = x.split(/\s+/).filter(Boolean).map((w) => SUFFIX[w] || w);
    return words.join(' ').trim();
  };
  // Looser key: street number + first street word only (handles suffix/unit differences).
  const stub = (a) => {
    const w = norm(a).split(' ');
    return (w[0] || '') + ' ' + (w[1] || '');
  };
  const subjectComp = useMemo(() => {
    const target = norm(report?.subject_address);
    if (!target) return null;
    let hit = comps.find((c) => norm(c.address) === target);
    if (!hit) { const t2 = stub(report?.subject_address); hit = comps.find((c) => stub(c.address) === t2); }
    return hit || null;
  }, [comps, report]);

  const grouped = useMemo(() => {
    const out = [];
    const withSubjectFirst = (rows, key) => {
      if (!subjectComp) return rows;
      const subjKey = groupOf(subjectComp.status);
      // Remove the subject if it naturally falls in this group, then pin it first.
      const rest = rows.filter((c) => c.id !== subjectComp.id);
      return [subjectComp, ...rest];
    };
    for (const g of GROUPS) {
      let rows = comps.filter((c) => groupOf(c.status) === g.key && (!subjectComp || c.id !== subjectComp.id));
      if (rows.length || (subjectComp && comps.some((c) => groupOf(c.status) === g.key))) {
        rows = subjectComp ? [subjectComp, ...rows] : rows;
        out.push({ ...g, rows });
      }
    }
    const others = comps.filter((c) => groupOf(c.status) === 'other' && (!subjectComp || c.id !== subjectComp.id));
    if (others.length) out.push({ key: 'other', label: 'Other', badge: '\u2022', color: '#8a9aa2', rows: subjectComp ? [subjectComp, ...others] : others });
    return out;
  }, [comps, subjectComp]);

  const statsFor = (rows) => {
    const prices = rows.map(priceOf).map(toNum).filter(Boolean);
    const ppsfs = rows.map(ppsfOf).map(toNum).filter(Boolean);
    const doms = rows.map((c) => toNum(c.days_on_market)).filter((x) => x != null);
    const avg = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
    const lo = prices.length ? Math.min(...prices) : null;
    const hi = prices.length ? Math.max(...prices) : null;
    const av = avg(prices);
    const pos = (lo != null && hi != null && hi > lo) ? ((av - lo) / (hi - lo)) * 100 : 50;
    return { count: rows.length, lo, hi, av, pos, avgPpsf: avg(ppsfs), avgDom: avg(doms) };
  };

  if (state === 'loading') return <div className="cp-wrap cp-center"><p className="cp-dim">Loading…</p><style>{css}</style></div>;
  if (state === 'error') return (
    <div className="cp-wrap cp-center"><div className="cp-errcard"><h1>Report not found</h1><p className="cp-dim">This comps report link may be incorrect or no longer available.</p><a className="cp-btn" href="tel:8584366585">Call (858) 436-6585</a></div><style>{css}</style></div>
  );

  const visibleGroups = filter === 'all' ? grouped : grouped.filter((g) => g.key === filter);
  const showStats = report.show_stats !== false;
  const showMap = report.show_map !== false && MAPS_KEY;
  const mapComps = comps.filter((c) => c.lat && c.lng);

  const Card = (c, isSubject) => {
    const open = !!expanded[c.id + (isSubject ? '-subj' : '')];
    const ekey = c.id + (isSubject ? '-subj' : '');
    return (
      <article className={'cp-card' + (c.starred ? ' cp-star' : '') + (isSubject ? ' cp-subj' : '')} key={ekey}>
        <div className="cp-cardimg" style={(c.photo_override || c.photo_url) ? { backgroundImage: `url(${c.photo_override || c.photo_url})` } : {}}>
          {!(c.photo_override || c.photo_url) && <span className="cp-cardaddr-ph">{c.address}</span>}
          {isSubject && <span className="cp-subjbadge">Subject Property</span>}
          {!isSubject && c.starred && <span className="cp-starbadge">★ Top comp</span>}
          {c.status && <span className={'cp-badge ' + statusClass(c.status)}>{c.status}</span>}
        </div>
        <div className="cp-cardbody">
          <h3>{c.address}</h3>
          <div className="cp-rows">
            {PRIMARY.map((f) => {
              let v = c[f.k];
              if (f.k === 'close_price') v = c.close_price || priceOf(c);
              if (f.money) v = fmtFull(v); else if (f.num) v = fmtNum(v); else if (f.ppsf) v = fmtPpsf(v);
              return (
                <div className="cp-row" key={f.k}>
                  <span className="cp-k">{f.label}</span>
                  <span className={'cp-v' + (f.big ? ' big' : '') + (f.gold ? ' gold' : '')}>{v || '—'}</span>
                </div>
              );
            })}
            {c.my_notes && <div className="cp-row notes"><span className="cp-k">My Notes</span><span className="cp-v">{c.my_notes}</span></div>}
          </div>
          {open && (
            <div className="cp-more">
              <div className="cp-moregrid">
                {c.mls_number && <div><span>MLS #</span><b>{c.mls_number}</b></div>}
                {c.orig_list_price && <div><span>Orig List</span><b>{fmtFull(c.orig_list_price)}</b></div>}
                {c.days_on_market && <div><span>Days on Market</span><b>{c.days_on_market}</b></div>}
                {c.postal_code && <div><span>Zip</span><b>{c.postal_code}</b></div>}
              </div>
              {c.public_remarks && <p className="cp-remarks">{c.public_remarks}</p>}
            </div>
          )}
          <button className="cp-toggle" onClick={() => setExpanded((e) => ({ ...e, [ekey]: !e[ekey] }))}>{open ? 'Show less \u25b4' : 'View details \u25be'}</button>
        </div>
      </article>
    );
  };

  return (
    <div className="cp-wrap">
      <header className="cp-top">
        <div className="cp-brand">Keller Williams Realty</div>
        <div className="cp-agent">Sez Sezer · DRE #01988197 · (858) 436-6585</div>
      </header>

      <section className="cp-hero">
        <p className="cp-eyebrow">Comparative Market Analysis</p>
        <h1>{report.title || report.subject_address}</h1>
        {report.client_name && <p className="cp-sub">Prepared for {report.client_name}</p>}
        <p className="cp-subject">Subject property · <strong>{report.subject_address}</strong></p>
        {report.intro && <p className="cp-intro">{report.intro}</p>}
      </section>

      {/* Map */}
      {showMap && mapComps.length > 0 && (
        <CompsMap comps={mapComps} subject={report.subject_address} priceOf={priceOf} ppsfOf={ppsfOf} />
      )}

      {/* Filter buttons */}
      <div className="cp-filters">
        <button className={'cp-fbtn' + (filter === 'all' ? ' on' : '')} onClick={() => setFilter('all')}>All <span>{comps.length}</span></button>
        {grouped.map((g) => (
          <button key={g.key} className={'cp-fbtn' + (filter === g.key ? ' on' : '')} onClick={() => setFilter(g.key)}>{g.label} <span>{g.rows.length}</span></button>
        ))}
      </div>

      {/* Grouped cards */}
      {visibleGroups.map((g) => (
        <section className="cp-group" key={g.key}>
          <div className="cp-grouphead"><h2>{g.label}</h2></div>
          <div className="cp-cards">{g.rows.map((c, i) => Card(c, subjectComp && c.id === subjectComp.id))}</div>
        </section>
      ))}

      {/* Stats */}
      {showStats && grouped.length > 0 && (
        <section className="cp-statsec">
          <h2>Comparable Property Statistics</h2>
          <div className="cp-statrule"></div>
          {grouped.map((g) => {
            const st = statsFor(g.rows);
            return (
              <div className="cp-statblock" key={g.key}>
                <div className="cp-stattitle">
                  <span className="cp-statbadge" style={{ background: g.color }}>{g.badge}</span>
                  <h3>{st.count} {g.label} {st.count === 1 ? 'Listing' : 'Listings'}</h3>
                </div>
                <div className="cp-statrow">
                  <div className="cp-range">
                    <div className="cp-rangelabels"><span>Lowest</span><span>Average</span><span>High</span></div>
                    <div className="cp-bar"><span className="cp-dot" style={{ left: st.pos + '%' }}></span></div>
                    <div className="cp-rangevals">
                      <span className="end">{st.lo ? fmtFull(st.lo) : '—'}</span>
                      <span className="mid">{st.av ? fmtFull(st.av) : '—'}</span>
                      <span className="end">{st.hi ? fmtFull(st.hi) : '—'}</span>
                    </div>
                  </div>
                  <div className="cp-statmetric"><span className="m-l">Avg Price / SqFt</span><span className="m-v">{st.avgPpsf ? '$' + st.avgPpsf.toLocaleString() : '—'}</span></div>
                  <div className="cp-statmetric"><span className="m-l">Avg DOM</span><span className="m-v">{st.avgDom != null ? st.avgDom : '—'}</span></div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Comparison table */}
      <section className="cp-section">
        <div className="cp-sechead"><span className="cp-secnum">✦</span><h2>Quick Comparison</h2></div>
        <div className="cp-tablecard">
          <h3 className="cp-tabletitle">Compare All {comps.length} {comps.length === 1 ? 'Property' : 'Properties'}</h3>
          <div className="cp-tablewrap">
            <table className="cp-table">
              <thead><tr>
                <th></th>
                <th className="cp-sortable" onClick={() => toggleSort('address')}>Property{arrow('address')}</th>
                <th>MLS #</th>
                <th className="cp-r cp-sortable" onClick={() => toggleSort('price')}>Price{arrow('price')}</th>
                <th className="cp-r cp-sortable" onClick={() => toggleSort('beds')}>Beds{arrow('beds')}</th>
                <th className="cp-r cp-sortable" onClick={() => toggleSort('baths')}>Baths{arrow('baths')}</th>
                <th className="cp-r cp-sortable" onClick={() => toggleSort('sqft')}>Sq Ft{arrow('sqft')}</th>
                <th className="cp-r cp-sortable" onClick={() => toggleSort('ppsf')}>$/SF{arrow('ppsf')}</th>
                <th className="cp-r cp-sortable" onClick={() => toggleSort('close_date')}>Close Date{arrow('close_date')}</th>
                <th className="cp-r cp-sortable" onClick={() => toggleSort('dom')}>DOM{arrow('dom')}</th>
                <th className="cp-sortable" onClick={() => toggleSort('status')}>Status{arrow('status')}</th>
              </tr></thead>
              <tbody>
                {sortedComps.map((c) => (
                  <tr key={c.id} className={c.starred ? 'cp-trstar' : ''}>
                    <td className="cp-trstarcell">{c.starred ? '★' : ''}</td>
                    <td className="cp-addr">{c.address}</td><td className="cp-mls">{c.mls_number}</td>
                    <td className="cp-r">{fmtFull(priceOf(c))}</td><td className="cp-r">{c.beds}</td><td className="cp-r">{c.baths}</td>
                    <td className="cp-r">{fmtNum(c.living_area)}</td><td className="cp-r">{fmtPpsf(ppsfOf(c))}</td>
                    <td className="cp-r">{c.close_date}</td><td className="cp-r">{c.days_on_market}</td>
                    <td><span className={'cp-status ' + statusClass(c.status)}>{c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="cp-ctasec">
        <h2>Questions about these comps?</h2>
        <p>I'm happy to walk you through the full analysis and what it means for your home.</p>
        <div className="cp-cta-row"><a className="cp-btn" href="tel:8584366585">Call (858) 436-6585</a><a className="cp-btn cp-btn-ghost" href="mailto:sez@carmelvalley.com">Email Sez</a></div>
      </section>

      <footer className="cp-footer">
        <strong>Sez Sezer</strong> · Keller Williams Realty · DRE #01988197<br/>
        12750 High Bluff Drive, San Diego, CA 92130 · (858) 436-6585<br/>
        <span className="cp-disc">Comparable data sourced from the MLS and public records; figures are estimates for discussion and not a formal appraisal.</span>
      </footer>

      <style>{css}</style>
    </div>
  );
}

// ---- Google Map with pins + popups ----
function CompsMap({ comps, subject, priceOf, ppsfOf }) {
  const ref = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ok | nocoords | noauth

  const pts = comps.filter((c) => c.lat && c.lng);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!MAPS_KEY) { setStatus('nocoords'); return; }
    if (!pts.length) { setStatus('nocoords'); return; }

    let cancelled = false;
    window.gm_authFailure = () => { if (!cancelled) setStatus('noauth'); };

    // Load the Google Maps JS API once, using the official async bootstrap so
    // google.maps.importLibrary is available, then import the maps + marker libs.
    const ensureLoader = () => new Promise((resolve, reject) => {
      if (window.google && window.google.maps && window.google.maps.importLibrary) { resolve(); return; }
      const existing = document.getElementById('gmaps-js');
      if (existing) { existing.addEventListener('load', () => resolve()); existing.addEventListener('error', reject); return; }
      // Official inline bootstrap loader (defines google.maps.importLibrary).
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
      // after bootstrap, resolve once importLibrary exists
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
          mapTypeId: 'hybrid',               // satellite + street labels ("mixed")
          mapTypeControl: true,              // let viewers switch Map / Satellite / Hybrid
          mapTypeControlOptions: { style: g.MapTypeControlStyle.HORIZONTAL_BAR, mapTypeIds: ['roadmap', 'hybrid', 'satellite'] },
          streetViewControl: false,
          fullscreenControl: true,
        });
        const bounds = new g.LatLngBounds();
        const info = new InfoWindow();
        pts.forEach((c) => {
          const pos = { lat: Number(c.lat), lng: Number(c.lng) };
          bounds.extend(pos);
          const sold = groupOf(c.status) === 'sold';
          const shortAddr = (c.address || '').split(',')[0];
          const priceShort = fmtFull(priceOf(c));
          const marker = new Marker({
            position: pos, map, title: c.address,
            label: {
              text: shortAddr + (priceShort ? '  ' + priceShort : ''),
              color: '#26333b', fontSize: '12px', fontWeight: '600',
              className: 'cp-pinlabel',
            },
            icon: { path: g.SymbolPath.CIRCLE, scale: c.starred ? 11 : 8, fillColor: c.starred ? GOLD : (sold ? LAKE : '#2f7d4f'), fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, labelOrigin: new g.Point(0, 3.2) },
          });
          marker.addListener('click', () => {
            const price = fmtFull(priceOf(c)); const ppsf = fmtPpsf(ppsfOf(c));
            info.setContent(
              '<div style="font-family:Jost,sans-serif;max-width:240px;color:#26333b">' +
              '<div style="font-family:Georgia,serif;font-size:18px;font-weight:600;color:#344a57">' + (c.address || '') + '</div>' +
              (price ? '<div style="font-size:16px;font-weight:600;margin:2px 0 6px">' + price + '</div>' : '') +
              '<div style="font-size:12.5px;color:#4a5a62;margin-bottom:6px">' +
                [c.beds && c.beds + ' bd', c.baths && c.baths + ' ba', c.living_area && fmtNum(c.living_area) + ' sqft', ppsf && ppsf + '/sf', c.status].filter(Boolean).join(' \u00b7 ') +
              '</div>' +
              (c.my_notes ? '<div style="font-size:12px;color:#5a6a72;line-height:1.5;border-top:1px solid #eee;padding-top:6px">' + c.my_notes + '</div>' : '') +
              '</div>'
            );
            info.open(map, marker);
          });
        });
        map.fitBounds(bounds, 60);
        g.event.addListenerOnce(map, 'idle', () => { if (pts.length === 1) map.setZoom(15); });
        if (!cancelled) setStatus('ok');
      } catch (e) {
        console.error('map load error', e);
        if (!cancelled) setStatus('noauth');
      }
    })();

    return () => { cancelled = true; };
  }, [comps]);

  return (
    <section className="cp-mapsec">
      <div className="cp-sechead"><span className="cp-secnum">\u25c9</span><h2>Location Map</h2></div>
      <div className="cp-maplegend">
        <span><i style={{ background: LAKE }}></i> Sold</span>
        <span><i style={{ background: '#2f7d4f' }}></i> Active / Other</span>
        <span><i style={{ background: GOLD }}></i> Top comp</span>
      </div>
      <div ref={ref} className="cp-map" style={{ display: status === 'ok' || status === 'loading' ? 'block' : 'none' }} />
      {status === 'nocoords' && <div className="cp-mapmsg">Map locations are being prepared. Re-import the sheet in admin to plot these addresses.</div>}
      {status === 'noauth' && <div className="cp-mapmsg">The map could not load. Check that the Google Maps JavaScript API is enabled and billing is on.</div>}
    </section>
  );
}

const MAP_STYLE = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

const css = `
  .cp-wrap { max-width: 1200px; margin: 0 auto; padding: 0 20px 70px; font-family: 'Jost',system-ui,sans-serif; color: #26333b; background: #faf9f7; }
  .cp-center { min-height: 80vh; display: flex; align-items: center; justify-content: center; }
  .cp-dim { color: #7a8891; }
  .cp-errcard { background: #fff; border: 1px solid #e6e9ec; border-radius: 14px; padding: 32px; text-align: center; max-width: 420px; }
  .cp-errcard h1 { font-family: 'Cormorant Garamond',serif; font-size: 28px; margin: 0 0 10px; }
  .cp-top { display: flex; align-items: center; justify-content: space-between; padding: 22px 0; border-bottom: 1px solid #ece8e1; flex-wrap: wrap; gap: 6px; }
  .cp-brand { font-family: 'Cormorant Garamond',serif; font-size: 21px; font-weight: 600; color: ${LAKE}; letter-spacing: .02em; }
  .cp-agent { font-size: 13px; color: #7a8891; }
  .cp-hero { padding: 42px 0 24px; text-align: center; }
  .cp-eyebrow { font-size: 12px; letter-spacing: .22em; text-transform: uppercase; color: ${GOLD}; font-weight: 600; margin: 0 0 12px; }
  .cp-hero h1 { font-family: 'Cormorant Garamond',serif; font-size: 44px; font-weight: 600; margin: 0 0 8px; color: ${LAKE}; line-height: 1.1; }
  .cp-sub { font-size: 17px; color: #4a5a62; margin: 0 0 6px; font-style: italic; }
  .cp-subject { font-size: 15px; color: #4a5a62; margin: 10px 0 0; }
  .cp-intro { font-size: 15.5px; color: #4a5a62; line-height: 1.7; margin: 18px auto 0; max-width: 720px; }
  /* Map */
  .cp-mapsec { margin-top: 38px; }
  .cp-maplegend { display: flex; gap: 18px; margin-bottom: 12px; font-size: 12.5px; color: #4a5a62; }
  .cp-maplegend i { display: inline-block; width: 11px; height: 11px; border-radius: 50%; margin-right: 5px; vertical-align: middle; border: 1.5px solid #fff; box-shadow: 0 0 0 1px #d5dbdf; }
  .cp-map { width: 100%; height: 440px; border-radius: 12px; overflow: hidden; border: 1px solid #eee9e1; box-shadow: 0 10px 30px rgba(52,74,87,.08); }
  .cp-mapmsg { background: #fff; border: 1px solid #eee9e1; border-radius: 12px; padding: 28px; text-align: center; color: #7a8891; font-size: 14px; }
  /* Stats */
  .cp-statsec { margin-top: 44px; }
  .cp-statsec > h2 { font-family: 'Cormorant Garamond',serif; font-weight: 600; font-size: 32px; color: ${LAKE}; margin: 0 0 4px; }
  .cp-statrule { height: 1px; background: #e6e2da; margin: 14px 0 26px; }
  .cp-statblock { margin-bottom: 24px; }
  .cp-stattitle { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .cp-statbadge { width: 30px; height: 30px; border-radius: 50%; color: #fff; font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .cp-stattitle h3 { font-size: 20px; font-weight: 600; color: #26333b; margin: 0; }
  .cp-statrow { display: grid; grid-template-columns: 1fr auto auto; gap: 40px; align-items: center; background: #fff; border: 1px solid #eee9e1; border-radius: 12px; padding: 24px 28px; }
  .cp-rangelabels { display: flex; justify-content: space-between; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #9aa4ab; margin-bottom: 10px; }
  .cp-bar { position: relative; height: 2px; background: #e0dbd2; margin: 14px 2px; }
  .cp-dot { position: absolute; top: 50%; width: 13px; height: 13px; border-radius: 50%; background: #26333b; transform: translate(-50%, -50%); }
  .cp-bar::before, .cp-bar::after { content: ''; position: absolute; top: 50%; width: 2px; height: 9px; background: #e0dbd2; transform: translateY(-50%); }
  .cp-bar::before { left: 0; } .cp-bar::after { right: 0; }
  .cp-rangevals { display: flex; justify-content: space-between; font-size: 19px; font-weight: 600; color: #26333b; font-variant-numeric: tabular-nums; }
  .cp-rangevals .mid { color: ${LAKE}; } .cp-rangevals .end { color: #7a8891; font-size: 17px; }
  .cp-statmetric { text-align: center; min-width: 120px; }
  .cp-statmetric .m-l { font-size: 11px; letter-spacing: .07em; text-transform: uppercase; color: #9aa4ab; display: block; margin-bottom: 6px; }
  .cp-statmetric .m-v { font-size: 28px; font-weight: 700; color: #26333b; font-variant-numeric: tabular-nums; }
  /* Filters */
  .cp-filters { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin: 34px 0 8px; }
  .cp-fbtn { background: #fff; border: 1px solid #e0dbd2; color: ${LAKE}; border-radius: 30px; padding: 9px 18px; font-family: 'Jost',sans-serif; font-size: 14px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; }
  .cp-fbtn span { background: #f0ece4; color: #7a8891; font-size: 12px; padding: 1px 8px; border-radius: 10px; }
  .cp-fbtn.on { background: ${LAKE}; color: #fff; border-color: ${LAKE}; }
  .cp-fbtn.on span { background: rgba(255,255,255,.22); color: #fff; }
  /* Groups + cards */
  .cp-group { margin-top: 30px; }
  .cp-grouphead { border-bottom: 2px solid ${GOLD}; padding-bottom: 10px; margin-bottom: 20px; }
  .cp-grouphead h2 { font-family: 'Cormorant Garamond',serif; font-size: 28px; font-weight: 500; margin: 0; color: ${LAKE}; }
  .cp-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
  .cp-card { background: #fff; border: 1px solid #eee9e1; border-radius: 11px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(52,74,87,.07); }
  .cp-card.cp-star { border: 2px solid ${GOLD}; }
  .cp-cardimg { position: relative; aspect-ratio: 16/10; background-size: cover; background-position: center; background-color: ${LAKE}; display: flex; align-items: center; justify-content: center; }
  .cp-cardaddr-ph { font-family: 'Cormorant Garamond',serif; font-size: 22px; color: rgba(255,255,255,.55); text-align: center; padding: 0 18px; }
  .cp-badge { position: absolute; top: 11px; left: 11px; font-size: 10px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; padding: 4px 10px; border-radius: 4px; background: rgba(255,255,255,.95); color: ${LAKE}; }
  .cp-badge.st-closed { background: ${LAKE}; color: #fff; } .cp-badge.st-active { background: #2f7d4f; color: #fff; } .cp-badge.st-pending { background: ${GOLD}; color: #fff; }
  .cp-starbadge { position: absolute; top: 11px; right: 11px; font-size: 10px; font-weight: 600; padding: 4px 10px; border-radius: 4px; background: ${GOLD}; color: #fff; }
  .cp-subjbadge { position: absolute; top: 11px; right: 11px; font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; padding: 4px 10px; border-radius: 4px; background: #26333b; color: #fff; }
  .cp-card.cp-subj { border: 2px solid #26333b; box-shadow: 0 12px 34px rgba(38,51,59,.16); }
  .cp-cardbody { padding: 18px 20px 20px; display: flex; flex-direction: column; flex: 1; }
  .cp-cardbody h3 { font-family: 'Cormorant Garamond',serif; font-size: 21px; font-weight: 600; margin: 0 0 2px; color: ${LAKE}; line-height: 1.15; }
  .cp-rows { margin-top: 12px; display: flex; flex-direction: column; }
  .cp-row { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: baseline; padding: 7px 0; border-bottom: 1px solid #f4f0e9; }
  .cp-row .cp-k { font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: #9aa4ab; }
  .cp-row .cp-v { font-size: 14px; font-weight: 600; color: #26333b; text-align: right; font-variant-numeric: tabular-nums; }
  .cp-row .cp-v.big { font-size: 16px; } .cp-row .cp-v.gold { color: ${GOLD}; }
  .cp-row.notes { grid-template-columns: 1fr; gap: 3px; }
  .cp-row.notes .cp-v { text-align: left; font-weight: 400; font-size: 13px; color: #5a6a72; line-height: 1.55; }
  .cp-toggle { margin-top: 14px; background: none; border: 0; color: ${GOLD}; cursor: pointer; font-family: 'Jost',sans-serif; font-size: 13px; font-weight: 600; padding: 0; text-align: left; }
  .cp-more { margin-top: 12px; padding-top: 12px; border-top: 1px dashed #efe9df; }
  .cp-moregrid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; }
  .cp-moregrid div { display: flex; justify-content: space-between; font-size: 12.5px; padding: 3px 0; border-bottom: 1px solid #f4f0e9; }
  .cp-moregrid span { color: #9aa4ab; } .cp-moregrid b { color: #26333b; font-weight: 600; }
  .cp-remarks { font-size: 12.5px; color: #5a6a72; line-height: 1.6; margin: 12px 0 0; }
  /* Table */
  .cp-section { margin-top: 44px; }
  .cp-sechead { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
  .cp-secnum { width: 44px; height: 44px; border: 1.5px solid ${GOLD}; border-radius: 50%; color: ${GOLD}; display: flex; align-items: center; justify-content: center; font-size: 17px; flex-shrink: 0; }
  .cp-sechead h2 { font-family: 'Cormorant Garamond',serif; font-size: 30px; font-weight: 500; margin: 0; color: ${LAKE}; }
  .cp-sechead::after { content: ''; flex: 1; height: 1px; background: #e6e2da; }
  .cp-tablecard { background: #fff; border-radius: 12px; padding: 30px; box-shadow: 0 10px 30px rgba(52,74,87,.06); border: 1px solid #eee9e1; }
  .cp-tabletitle { font-family: 'Cormorant Garamond',serif; font-size: 28px; font-weight: 500; margin: 0 0 18px; color: ${LAKE}; }
  .cp-tablewrap { overflow-x: auto; }
  .cp-table { border-collapse: collapse; width: 100%; font-size: 14px; }
  .cp-table th { background: ${LAKE}; color: #fff; text-align: left; padding: 13px 14px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; white-space: nowrap; }
  .cp-table th.cp-sortable { cursor: pointer; user-select: none; }
  .cp-table th.cp-sortable:hover { background: #2b3e49; }
  .cp-table th.cp-r, .cp-table td.cp-r { text-align: right; }
  .cp-table td { border-bottom: 1px solid #f0ece4; padding: 14px; white-space: nowrap; color: #3a4a52; font-variant-numeric: tabular-nums; }
  .cp-trstar { background: #fffdf4; } .cp-trstarcell { color: ${GOLD}; text-align: center; padding: 0 !important; width: 24px; }
  .cp-addr { font-weight: 600; color: ${LAKE} !important; } .cp-mls { color: #9aa4ab !important; font-size: 13px; }
  .cp-status { font-weight: 600; } .cp-status.st-closed { color: ${LAKE}; } .cp-status.st-active { color: #2f7d4f; } .cp-status.st-pending { color: ${GOLD}; }
  .cp-ctasec { background: ${LAKE}; border-radius: 14px; padding: 44px 30px; text-align: center; margin-top: 44px; color: #fff; }
  .cp-ctasec h2 { font-family: 'Cormorant Garamond',serif; font-size: 30px; font-weight: 500; margin: 0 0 8px; }
  .cp-ctasec p { color: rgba(255,255,255,.82); margin: 0 auto; max-width: 480px; font-size: 15px; }
  .cp-cta-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 22px; }
  .cp-btn { display: inline-block; background: #fff; color: ${LAKE}; text-decoration: none; padding: 14px 26px; border-radius: 7px; font-size: 15px; font-weight: 600; }
  .cp-btn-ghost { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.6); }
  .cp-footer { text-align: center; font-size: 13px; color: #7a8891; padding: 34px 0 0; line-height: 1.8; }
  .cp-footer strong { color: ${LAKE}; } .cp-disc { font-size: 11.5px; color: #a8b0b6; }
  @media (max-width: 1100px) { .cp-cards { grid-template-columns: repeat(3, 1fr); } }
  @media (max-width: 820px) { .cp-cards { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 720px) { .cp-statrow { grid-template-columns: 1fr; gap: 18px; } .cp-statmetric { text-align: left; display: flex; justify-content: space-between; align-items: baseline; } }
  @media (max-width: 640px) { .cp-hero h1 { font-size: 32px; } .cp-cards { grid-template-columns: 1fr; } .cp-map { height: 340px; } }
`;
