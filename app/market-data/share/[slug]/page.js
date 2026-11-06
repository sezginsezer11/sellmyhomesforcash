'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
const BLUE = '#296190';
const fmtDate = (v) => (v ? new Date(v + 'T00:00:00').toLocaleDateString() : '—');

// Zillow resolves straight to the exact listing page when the URL includes
// city + state — confirmed directly against the live site. Dataset is
// entirely Carmel Valley / San Diego.
const zillowUrl = (address, postalCode) => {
  const slug = (address || '').replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/).join('-');
  if (!slug) return null;
  return `https://www.zillow.com/homes/${slug}-San-Diego-CA-${(postalCode || '').toString().trim()}_rb/`;
};
const mapsUrl = (address) => (address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address) : null);

export default function SharedList() {
  const { slug } = useParams();
  const [state, setState] = useState('loading'); // loading | ok | error
  const [list, setList] = useState(null);
  const [rows, setRows] = useState([]);
  const [view, setView] = useState('table');

  useEffect(() => {
    let alive = true;
    fetch('/api/market-data?public_slug=' + encodeURIComponent(slug))
      .then((r) => r.json())
      .then((j) => { if (!alive) return; if (j.ok) { setList(j.list); setRows(j.rows || []); setState('ok'); } else setState('error'); })
      .catch(() => alive && setState('error'));
    return () => { alive = false; };
  }, [slug]);

  const sorted = useMemo(() => rows.slice().sort((a, b) => (a.address || '').localeCompare(b.address || '')), [rows]);

  if (state === 'loading') return <div className="s-wrap"><p>Loading…</p><style>{css}</style></div>;
  if (state === 'error') return <div className="s-wrap"><p>This list link isn't valid, or it's no longer being shared.</p><style>{css}</style></div>;

  return (
    <div className="s-wrap">
      <div className="s-head">
        <h1>{list?.name || 'Property List'}</h1>
        <div className="s-count">{rows.length} propert{rows.length === 1 ? 'y' : 'ies'}</div>
      </div>

      {rows.length === 0 ? (
        <p className="s-empty">No properties on this list yet.</p>
      ) : (
        <>
          <div className="s-viewtoggle">
            <button className={'s-viewbtn' + (view === 'table' ? ' on' : '')} onClick={() => setView('table')}>Table</button>
            <button className={'s-viewbtn' + (view === 'map' ? ' on' : '')} onClick={() => setView('map')}>Map</button>
          </div>

          {view === 'map' ? (
            <SharedMap rows={sorted} />
          ) : (
            <div className="s-cards">
              {sorted.map((r) => (
                <div className="s-card" key={r.group_key}>
                  <div className="s-addr">{r.address}</div>
                  <div className="s-sub">{[r.subdivision || r.neighborhood || r.mls_area, r.property_sub_type].filter(Boolean).join(' · ')}</div>
                  <div className="s-specs">
                    {[r.beds_total && `${r.beds_total} bd`, r.baths_total && `${r.baths_total} ba`,
                      r.living_area && `${Number(r.living_area).toLocaleString()} sqft`,
                      r.lot_size_sqft && `${Number(r.lot_size_sqft).toLocaleString()} sqft lot`,
                      r.year_built && `Built ${r.year_built}`]
                      .filter(Boolean).join(' · ')}
                  </div>
                  {r.off_market_date && <div className="s-offmarket">Off market since {fmtDate(r.off_market_date)}</div>}
                  <div className="s-links">
                    {mapsUrl(r.address) && <a className="s-linkbtn" target="_blank" rel="noopener" href={mapsUrl(r.address)}>📍 Google Maps</a>}
                    {zillowUrl(r.address, r.postal_code) && <a className="s-linkbtn" target="_blank" rel="noopener" href={zillowUrl(r.address, r.postal_code)}>🏠 Zillow</a>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <style>{css}</style>
    </div>
  );
}

// ---- Read-only map: same pins-per-property experience as the admin tool,
// but no status coloring (status isn't shared) and the info window carries
// the Zillow/Google Maps links directly, since there's no row to click back to.
function SharedMap({ rows }) {
  const ref = useRef(null);
  const [status, setStatus] = useState('loading');

  const pts = useMemo(() => {
    const raw = rows.filter((r) => r.lat && r.lng);
    const groups = new Map();
    for (const r of raw) {
      const key = `${Number(r.lat).toFixed(5)},${Number(r.lng).toFixed(5)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    const out = [];
    for (const group of groups.values()) {
      if (group.length === 1) { out.push({ ...group[0], _lat: Number(group[0].lat), _lng: Number(group[0].lng) }); continue; }
      const baseLat = Number(group[0].lat), baseLng = Number(group[0].lng);
      const metersPerDegLat = 111320;
      const metersPerDegLng = 111320 * Math.cos((baseLat * Math.PI) / 180);
      const radiusMeters = 9 + Math.min(group.length, 14);
      group.forEach((r, i) => {
        const angle = (2 * Math.PI * i) / group.length;
        out.push({ ...r, _lat: baseLat + (radiusMeters * Math.sin(angle)) / metersPerDegLat, _lng: baseLng + (radiusMeters * Math.cos(angle)) / metersPerDegLng });
      });
    }
    return out;
  }, [rows]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!MAPS_KEY) { setStatus('noauth'); return; }
    if (!pts.length) { setStatus('nocoords'); return; }

    let cancelled = false;
    window.gm_authFailure = () => { if (!cancelled) setStatus('noauth'); };

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
        const map = new Map(ref.current, { mapTypeId: 'roadmap', mapTypeControl: true, streetViewControl: false, fullscreenControl: true });
        const bounds = new g.LatLngBounds();
        const info = new InfoWindow();
        pts.forEach((r) => {
          const pos = { lat: r._lat, lng: r._lng };
          bounds.extend(pos);
          const marker = new Marker({
            position: pos, map, title: r.address,
            icon: { path: g.SymbolPath.CIRCLE, scale: 9, fillColor: BLUE, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
          });
          const community = r.subdivision || r.neighborhood || r.mls_area;
          const sub = [community, r.property_sub_type].filter(Boolean).join(' · ');
          const specs = [r.beds_total && `${r.beds_total} bd`, r.baths_total && `${r.baths_total} ba`,
            r.living_area && `${Number(r.living_area).toLocaleString()} sqft`,
            r.lot_size_sqft && `${Number(r.lot_size_sqft).toLocaleString()} sqft lot`,
            r.year_built && `Built ${r.year_built}`]
            .filter(Boolean).join(' · ');
          const gm = mapsUrl(r.address), zl = zillowUrl(r.address, r.postal_code);
          marker.addListener('click', () => {
            info.setContent(
              '<div style="font-family:Jost,sans-serif;max-width:240px;color:#1c2b33">' +
              '<div style="font-weight:700;font-size:15px">' + (r.address || '') + '</div>' +
              (sub ? '<div style="font-size:12px;color:#6a7a82;margin-top:2px">' + sub + '</div>' : '') +
              (specs ? '<div style="font-size:12.5px;color:#4a5a62;margin:4px 0">' + specs + '</div>' : '') +
              (r.off_market_date ? '<div style="font-size:11.5px;color:#9aa4ab;margin-bottom:8px">Off market since ' + fmtDate(r.off_market_date) + '</div>' : '<div style="margin-bottom:4px"></div>') +
              '<div style="display:flex;gap:10px">' +
              (gm ? '<a href="' + gm + '" target="_blank" rel="noopener" style="font-size:12.5px;color:#296190;font-weight:600;text-decoration:none">📍 Google Maps</a>' : '') +
              (zl ? '<a href="' + zl + '" target="_blank" rel="noopener" style="font-size:12.5px;color:#296190;font-weight:600;text-decoration:none">🏠 Zillow</a>' : '') +
              '</div></div>'
            );
            info.open(map, marker);
          });
        });
        map.fitBounds(bounds, 60);
        g.event.addListenerOnce(map, 'idle', () => { if (pts.length === 1) map.setZoom(15); });
        if (!cancelled) setStatus('ok');
      } catch (e) {
        console.error('shared map load error', e);
        if (!cancelled) setStatus('noauth');
      }
    })();

    return () => { cancelled = true; };
  }, [pts]);

  return (
    <div className="s-mapwrap">
      <div ref={ref} className="s-map" style={{ display: status === 'ok' || status === 'loading' ? 'block' : 'none' }} />
      {status === 'nocoords' && <div className="s-mapmsg">None of these properties have map coordinates yet.</div>}
      {status === 'noauth' && <div className="s-mapmsg">The map couldn't load.</div>}
    </div>
  );
}

const css = `
  .s-wrap { max-width: 1000px; margin: 0 auto; padding: 32px 18px 60px; font-family: 'Jost',system-ui,sans-serif; color: #1c2b33; }
  .s-head { margin-bottom: 20px; }
  .s-head h1 { font-family: 'Cormorant Garamond',serif; font-size: 32px; margin: 0 0 4px; }
  .s-count { font-size: 14px; color: #6a7a82; }
  .s-empty { color: #6a7a82; }
  .s-viewtoggle { display: flex; gap: 4px; background: #eef1f3; border-radius: 8px; padding: 3px; width: fit-content; margin-bottom: 16px; }
  .s-viewbtn { padding: 7px 16px; border: 0; background: none; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 13px; font-weight: 600; color: #6a7a82; cursor: pointer; }
  .s-viewbtn.on { background: #fff; color: #296190; box-shadow: 0 1px 3px rgba(20,40,60,.12); }
  .s-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
  .s-card { background: #fff; border: 1px solid #e6e9ec; border-radius: 10px; padding: 16px; box-shadow: 0 2px 10px rgba(20,40,60,.05); }
  .s-addr { font-weight: 700; font-size: 16px; color: #1c2b33; margin-bottom: 3px; }
  .s-sub { font-size: 12.5px; color: #6a7a82; margin-bottom: 6px; }
  .s-specs { font-size: 13px; color: #4a5a62; margin-bottom: 6px; }
  .s-offmarket { font-size: 12px; color: #9aa4ab; margin-bottom: 12px; }
  .s-links { display: flex; gap: 8px; flex-wrap: wrap; }
  .s-linkbtn { font-size: 12.5px; font-weight: 600; color: #296190; text-decoration: none; border: 1px solid #bcd2e4; border-radius: 6px; padding: 6px 12px; }
  .s-linkbtn:hover { background: #eaf2fa; }
  .s-mapwrap { border: 1px solid #e6e9ec; border-radius: 10px; overflow: hidden; background: #fff; }
  .s-map { width: 100%; height: 560px; }
  .s-mapmsg { padding: 40px 20px; text-align: center; color: #6a7a82; font-size: 13.5px; }
`;
