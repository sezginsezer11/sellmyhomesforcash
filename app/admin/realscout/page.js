'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { supabaseBrowser } from '../../../lib/supabase-browser';

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
// Carmel Valley — where the map sits before anything is plotted.
const DEFAULT_CENTER = { lat: 32.9435, lng: -117.2297 };

// Scout Score is RealScout's engagement measure, so it's what "most active"
// means here: hotter colour and bigger pin as the score climbs.
function scoreStyle(score) {
  if (score == null) return { color: '#9aa7ad', scale: 6 };
  if (score >= 80) return { color: '#c0392b', scale: 12 };
  if (score >= 60) return { color: '#e67e22', scale: 10 };
  if (score >= 40) return { color: '#2a7ab0', scale: 8 };
  return { color: '#7f8c8d', scale: 7 };
}

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '—');

// RealScout prefixes its own auto-generated behaviour tags with "RealScout ",
// which is just noise once they're all in one column.
const SHOWN_TAGS = 2;
const tagLabel = (t) => t.replace(/^RealScout /, '');

const TYPE_LABEL = { SELLER: 'Seller', BUYER: 'Buyer', BUYER_SELLER: 'Buyer & Seller', OTHER: 'Other' };

// "San Diego, CA 92130" — from whichever of the three the contact has.
const cityLine = (c) => [[c.city, c.state].filter(Boolean).join(', '), c.zipcode].filter(Boolean).join(' ');

export default function RealScoutPage() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
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

  if (checking) return <div className="r-wrap"><p>Loading…</p><style>{css}</style></div>;
  if (!session) return (
    <div className="r-wrap"><p>Please <a href="/admin">sign in</a> first.</p><style>{css}</style></div>
  );

  return (
    <div className="r-wrap">
      <div className="r-head">
        <h1>RealScout</h1>
        <div className="r-headright">
          <a className="r-link" href="/admin">← Leads</a>
          <a className="r-link" href="/admin/comps">Comps</a>
          <a className="r-link" href="/admin/market-data">Off Market</a>
          <span className="r-me">{session.user.email}</span>
        </div>
      </div>
      <Contacts token={token} />
      <style>{css}</style>
    </div>
  );
}

function Contacts({ token }) {
  const [account, setAccount] = useState(null); // {ok, account?, error?, status?}
  const [accountLoading, setAccountLoading] = useState(true);

  const [contacts, setContacts] = useState([]);
  const [total, setTotal] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [zip, setZip] = useState('');
  const [contactType, setContactType] = useState('');
  const [sort, setSort] = useState('last_active_at');

  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [view, setView] = useState('table'); // table | map
  const [geocoding, setGeocoding] = useState(false);
  const [geoProgress, setGeoProgress] = useState(null);

  const mappable = useMemo(() => contacts.filter((c) => c.lat && c.lng), [contacts]);
  const needsGeocode = useMemo(() => contacts.filter((c) => c.lat == null && c.street).length, [contacts]);

  // Google's geocoder is rate-limited and charged per call, so this runs in
  // bounded batches the same way the listings backfill does.
  const runGeocode = async () => {
    setGeocoding(true); setGeoProgress({ done: 0 });
    let done = 0;
    try {
      while (true) {
        const res = await fetch('/api/realscout', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
          body: JSON.stringify({ action: 'geocode_batch', limit: 25 }),
        });
        const j = await res.json();
        if (!j.ok) { setError(j); break; }
        done += j.processed;
        setGeoProgress({ done, remaining: j.remaining });
        if (j.remaining <= 0 || j.processed === 0) break;
      }
    } catch { setError({ error: 'network_error' }); }
    setGeocoding(false);
    await loadContacts();
  };

  const loadAccount = async () => {
    setAccountLoading(true);
    try {
      const res = await fetch('/api/realscout?action=me', { headers: { Authorization: 'Bearer ' + token() } });
      setAccount(await res.json());
    } catch { setAccount({ ok: false, error: 'network_error' }); }
    setAccountLoading(false);
  };
  useEffect(() => { loadAccount(); }, []);

  const loadContacts = async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ action: 'synced', sort });
      if (name.trim()) params.set('name', name.trim());
      if (address.trim()) params.set('address', address.trim());
      if (zip.trim()) params.set('zip', zip.trim());
      if (contactType) params.set('contact_type', contactType);
      const res = await fetch('/api/realscout?' + params.toString(), { headers: { Authorization: 'Bearer ' + token() } });
      const j = await res.json();
      if (!j.ok) { setError(j); setContacts([]); setLoading(false); return; }
      setContacts(j.contacts); setTotal(j.total); setLastSyncedAt(j.lastSyncedAt);
    } catch { setError({ error: 'network_error' }); }
    setLoading(false);
  };

  useEffect(() => {
    if (account?.ok) loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.ok, sort]);

  // Pages through RealScout one request at a time — a full sync is dozens of
  // calls, far more than one serverless invocation can hold open.
  const runSync = async () => {
    setSyncing(true); setSyncProgress({ synced: 0 });
    let cursor = null, synced = 0;
    try {
      while (true) {
        const res = await fetch('/api/realscout', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
          body: JSON.stringify({ action: 'sync_contacts', cursor }),
        });
        const j = await res.json();
        if (!j.ok) { setError(j); break; }
        synced += j.synced;
        setSyncProgress({ synced });
        if (!j.hasMore || !j.nextCursor) break;
        cursor = j.nextCursor;
      }
    } catch { setError({ error: 'network_error' }); }
    setSyncing(false);
    await loadContacts();
  };

  const runSearch = (e) => { if (e) e.preventDefault(); loadContacts(); };

  if (accountLoading) return <p className="r-dim">Checking RealScout connection…</p>;

  if (!account?.ok) {
    const code = account?.error;
    return (
      <div className="r-connectbox">
        {code === 'not_configured' ? (
          <>
            <h2>Not connected yet</h2>
            <p>
              Create a token on RealScout's Integrations page with the <code>account:read</code> and <code>contacts:read</code> scopes,
              then add it to this project's <code>.env.local</code> file (never paste it here in chat):
            </p>
            <pre>REALSCOUT_API_TOKEN=your-token-here</pre>
            <p className="r-dim">Restart the dev server (or redeploy) after saving, then reload this page.</p>
          </>
        ) : account?.status === 401 ? (
          <>
            <h2>Token rejected</h2>
            <p>RealScout says this token is invalid or expired. Create a new one on the Integrations page and update <code>.env.local</code>.</p>
          </>
        ) : account?.status === 403 ? (
          <>
            <h2>Missing scope</h2>
            <p>This token doesn't have the scopes this page needs (<code>account:read</code>, <code>contacts:read</code>). Edit the token's scopes on RealScout's Integrations page.</p>
          </>
        ) : account?.status === 429 ? (
          <>
            <h2>Rate limited</h2>
            <p>RealScout asked to wait before trying again. Reload this page in a minute.</p>
          </>
        ) : (
          <>
            <h2>Couldn't connect</h2>
            <p className="r-dim">{JSON.stringify(account?.error)}</p>
          </>
        )}
      </div>
    );
  }

  const acct = account.account;
  return (
    <div className="r-contacts">
      <div className="r-connected">
        Connected as <b>{acct.full_name || acct.email}</b>
        {acct.cached_client_count != null && <> · {acct.cached_client_count} contacts in RealScout</>}
      </div>

      <div className="r-syncbar">
        <button className="r-syncbtn" onClick={runSync} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync from RealScout'}
        </button>
        {syncing && syncProgress && <span className="r-dim">{syncProgress.synced} pulled…</span>}
        {!syncing && (
          <span className="r-dim">
            {total > 0
              ? <>{total} synced{lastSyncedAt && <> · last synced {new Date(lastSyncedAt).toLocaleString()}</>}</>
              : 'Nothing synced yet — hit Sync to pull your contacts in.'}
          </span>
        )}
      </div>

      <form className="r-filters" onSubmit={runSearch}>
        <input placeholder="Name or email…" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Street or city…" value={address} onChange={(e) => setAddress(e.target.value)} />
        <input placeholder="Zip(s)…" title="One or more ZIPs, separated by commas or spaces" value={zip} onChange={(e) => setZip(e.target.value)} />
        <select value={contactType} onChange={(e) => setContactType(e.target.value)}>
          <option value="">Any type</option>
          <option value="SELLER">Seller</option>
          <option value="BUYER">Buyer</option>
          <option value="BUYER_SELLER">Buyer &amp; Seller</option>
          <option value="OTHER">Other</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="last_active_at">Sort: Last active</option>
          <option value="rs_created_at">Sort: Created</option>
          <option value="scout_score">Sort: Scout Score</option>
        </select>
        <button type="submit" className="r-searchbtn" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
      </form>

      {error?.error === 'table_missing' ? (
        <div className="r-connectbox">
          <h2>One migration left to run</h2>
          <p>The <code>realscout_contacts</code> table doesn't exist yet. Run <code>add_realscout_contacts.sql</code> in the Supabase SQL editor, then hit Sync.</p>
        </div>
      ) : error ? (
        <p className="r-err">{error.status === 429 ? 'Rate limited — try again shortly.' : 'Could not load contacts.'}</p>
      ) : null}

      <div className="r-viewbar">
        <div className="r-toggle">
          <button className={'r-togglebtn' + (view === 'table' ? ' on' : '')} onClick={() => setView('table')}>Table</button>
          <button className={'r-togglebtn' + (view === 'map' ? ' on' : '')} onClick={() => setView('map')}>Map</button>
        </div>
        {view === 'map' && (
          <>
            <span className="r-dim">{mappable.length} of {contacts.length} mapped</span>
            {needsGeocode > 0 && (
              <button className="r-syncbtn" onClick={runGeocode} disabled={geocoding}>
                {geocoding ? 'Geocoding…' : `Geocode ${needsGeocode} address${needsGeocode === 1 ? '' : 'es'}`}
              </button>
            )}
            {geocoding && geoProgress && <span className="r-dim">{geoProgress.done} done{geoProgress.remaining != null && `, ${geoProgress.remaining} left`}</span>}
          </>
        )}
      </div>

      {view === 'map' ? (
        <LeadsMap contacts={mappable} />
      ) : (
      <div className="r-tablewrap">
        <table className="r-table">
          <thead>
            <tr>
              <th className="r-name">Name</th><th>Address</th><th>Type</th><th>Email</th><th>Phone</th><th>Tags</th>
              <th className="r-r">Scout Score</th><th>Last active</th><th>Created</th><th></th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id}>
                <td className="r-name">{[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}</td>
                <td className="r-addr">
                  {c.street || cityLine(c) ? (
                    <>
                      {c.street && <div>{c.street}</div>}
                      {cityLine(c) && <div className="r-addr2">{cityLine(c)}</div>}
                    </>
                  ) : '—'}
                </td>
                <td>{TYPE_LABEL[c.contact_type] || '—'}</td>
                <td>{c.email || '—'}</td>
                <td>{c.primary_mobile_phone || '—'}</td>
                <td className="r-tags" title={(c.tags || []).join(', ')}>
                  {(c.tags || []).length === 0 ? '—' : (
                    <>
                      {(c.tags || []).slice(0, SHOWN_TAGS).map(tagLabel).join(', ')}
                      {(c.tags || []).length > SHOWN_TAGS && <span className="r-more"> +{c.tags.length - SHOWN_TAGS}</span>}
                    </>
                  )}
                </td>
                <td className="r-r">{c.scout_score ?? '—'}</td>
                <td>{fmtDate(c.last_active_at)}</td>
                <td>{fmtDate(c.rs_created_at)}</td>
                <td>{c.realscout_url && <a className="r-link" href={c.realscout_url} target="_blank" rel="noopener">View ↗</a>}</td>
              </tr>
            ))}
            {!loading && contacts.length === 0 && !error && (
              <tr><td colSpan={10} className="r-dim">{total > 0 ? 'No contacts match those filters.' : 'Nothing synced yet.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}
      {contacts.length === 500 && <p className="r-dim">Showing the first 500 matches — narrow the filters to see the rest.</p>}
    </div>
  );
}

function LeadsMap({ contacts }) {
  const ref = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ok | noauth
  const builtRef = useRef(false);

  // Contacts in the same building geocode to one point and stack invisibly —
  // fan any such group into a small ring so every lead gets its own pin.
  const pts = useMemo(() => {
    const groups = new Map();
    for (const c of contacts) {
      const key = `${Number(c.lat).toFixed(5)},${Number(c.lng).toFixed(5)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    const out = [];
    for (const group of groups.values()) {
      if (group.length === 1) {
        out.push({ ...group[0], _lat: Number(group[0].lat), _lng: Number(group[0].lng) });
        continue;
      }
      const baseLat = Number(group[0].lat), baseLng = Number(group[0].lng);
      const metersPerDegLat = 111320;
      const metersPerDegLng = 111320 * Math.cos((baseLat * Math.PI) / 180);
      const radius = 9 + Math.min(group.length, 14);
      group.forEach((c, i) => {
        const angle = (2 * Math.PI * i) / group.length;
        out.push({
          ...c,
          _lat: baseLat + (radius * Math.sin(angle)) / metersPerDegLat,
          _lng: baseLng + (radius * Math.cos(angle)) / metersPerDegLng,
        });
      });
    }
    return out;
  }, [contacts]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!MAPS_KEY) { setStatus('noauth'); return; }
    let cancelled = false;
    window.gm_authFailure = () => { if (!cancelled) setStatus('noauth'); };

    const ensureLoader = () => new Promise((resolve, reject) => {
      if (window.google?.maps?.importLibrary) { resolve(); return; }
      const existing = document.getElementById('gmaps-js');
      if (existing) { existing.addEventListener('load', () => resolve()); existing.addEventListener('error', reject); return; }
      const s = document.createElement('script');
      s.id = 'gmaps-js';
      s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=marker`;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(Error('Google Maps could not load.'));
      document.head.append(s);
    });

    (async () => {
      try {
        await ensureLoader();
        if (cancelled || !ref.current || builtRef.current) return;
        builtRef.current = true;
        const g = window.google.maps;
        const map = new g.Map(ref.current, {
          mapTypeId: 'roadmap', mapTypeControl: true, streetViewControl: false, fullscreenControl: true,
          center: DEFAULT_CENTER, zoom: 11,
        });
        const bounds = new g.LatLngBounds();
        const info = new g.InfoWindow();
        pts.forEach((c) => {
          const pos = { lat: c._lat, lng: c._lng };
          bounds.extend(pos);
          const { color, scale } = scoreStyle(c.scout_score);
          const marker = new g.Marker({
            position: pos, map,
            title: [c.first_name, c.last_name].filter(Boolean).join(' '),
            icon: { path: g.SymbolPath.CIRCLE, scale, fillColor: color, fillOpacity: 0.9, strokeColor: '#fff', strokeWeight: 2 },
          });
          marker.addListener('mouseover', () => {
            const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Contact';
            info.setContent(
              '<div style="font-family:sans-serif;max-width:230px;color:#1c2b33">' +
              '<div style="font-weight:700;font-size:14px">' + name + '</div>' +
              (c.street ? '<div style="font-size:12px;margin-top:2px">' + c.street + '</div>' : '') +
              (cityLine(c) ? '<div style="font-size:12px;color:#6a7a82">' + cityLine(c) + '</div>' : '') +
              '<div style="font-size:12px;margin-top:4px">Scout Score: <b>' + (c.scout_score ?? '—') + '</b></div>' +
              (c.contact_type ? '<div style="font-size:11.5px;color:#296190;margin-top:3px">' + (TYPE_LABEL[c.contact_type] || c.contact_type) + '</div>' : '') +
              '</div>'
            );
            info.open(map, marker);
          });
          if (c.realscout_url) marker.addListener('click', () => window.open(c.realscout_url, '_blank', 'noopener'));
        });
        if (pts.length) map.fitBounds(bounds, 48);
        if (!cancelled) setStatus('ok');
      } catch {
        if (!cancelled) setStatus('noauth');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts]);

  return (
    <div>
      {status === 'noauth' && <p className="r-err">Map couldn't load — check NEXT_PUBLIC_GOOGLE_MAPS_KEY.</p>}
      <div ref={ref} className="r-map" />
      <div className="r-legend">
        <span><i style={{ background: '#c0392b' }} /> 80+</span>
        <span><i style={{ background: '#e67e22' }} /> 60–79</span>
        <span><i style={{ background: '#2a7ab0' }} /> 40–59</span>
        <span><i style={{ background: '#7f8c8d' }} /> under 40</span>
        <span><i style={{ background: '#9aa7ad' }} /> no score</span>
      </div>
    </div>
  );
}

const css = `
  .r-wrap { max-width: 1100px; margin: 0 auto; padding: 24px 16px 60px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a2630; }
  .r-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
  .r-head h1 { font-size: 26px; margin: 0; }
  .r-headright { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .r-link { color: #296190; text-decoration: none; font-size: 14px; }
  .r-link:hover { text-decoration: underline; }
  .r-me { font-size: 13px; color: #6a7a82; }
  .r-dim { color: #6a7a82; font-size: 14px; }
  .r-err { color: #8a2020; font-size: 14px; }

  .r-connectbox { background: #fbf6e9; border: 1px solid #e0cf8f; border-radius: 10px; padding: 20px 24px; max-width: 620px; }
  .r-connectbox h2 { margin: 0 0 8px; font-size: 18px; }
  .r-connectbox p { font-size: 14px; line-height: 1.5; }
  .r-connectbox code { background: #f1e9d2; padding: 1px 5px; border-radius: 4px; font-size: 13px; }
  .r-connectbox pre { background: #1a2630; color: #e7eef2; padding: 10px 14px; border-radius: 8px; font-size: 13px; overflow-x: auto; }

  .r-connected { font-size: 14px; margin-bottom: 14px; color: #2d4f36; }
  .r-filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
  .r-filters input, .r-filters select { padding: 8px 10px; border: 1px solid #d3dade; border-radius: 8px; font-size: 14px; }
  .r-searchbtn { padding: 8px 18px; border: none; border-radius: 8px; background: #296190; color: #fff; font-size: 14px; cursor: pointer; }
  .r-searchbtn:disabled { opacity: .6; cursor: default; }

  .r-tablewrap { overflow-x: auto; border: 1px solid #e3e8ea; border-radius: 10px; }
  .r-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .r-table th, .r-table td { padding: 9px 12px; border-bottom: 1px solid #eef1f2; text-align: left; white-space: nowrap; }
  .r-table th { background: #f7f9fa; font-weight: 600; color: #46535a; }
  .r-table .r-r { text-align: right; }
  /* Tags are long, auto-generated and many — cap and wrap them so they can't
     push name/email/phone off the side of the table. */
  /* min-width, not max: the table layout squeezes these two wrapping columns
     to almost nothing otherwise, breaking a street address over four lines. */
  .r-table td.r-tags { white-space: normal; min-width: 190px; max-width: 260px; color: #46535a; }
  .r-table td.r-addr { white-space: normal; min-width: 190px; }
  .r-addr2 { color: #6a7a82; font-size: 12px; }
  .r-more { color: #8b979d; }
  /* Keep the person visible while scrolling the rest sideways. */
  .r-table .r-name { position: sticky; left: 0; z-index: 1; background: #fff; }
  .r-table th.r-name { background: #f7f9fa; z-index: 2; }

  .r-viewbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
  .r-toggle { display: inline-flex; border: 1px solid #d3dade; border-radius: 8px; overflow: hidden; }
  .r-togglebtn { padding: 7px 16px; border: none; background: #fff; cursor: pointer; font-size: 14px; color: #46535a; }
  .r-togglebtn.on { background: #296190; color: #fff; }
  .r-map { height: 560px; width: 100%; border: 1px solid #e3e8ea; border-radius: 10px; }
  .r-legend { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 10px; font-size: 12px; color: #6a7a82; }
  .r-legend span { display: inline-flex; align-items: center; gap: 6px; }
  .r-legend i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }

  .r-syncbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
  .r-syncbtn { padding: 8px 16px; border: 1px solid #d3dade; border-radius: 8px; background: #fff; cursor: pointer; font-size: 14px; }
  .r-syncbtn:disabled { opacity: .6; cursor: default; }
`;
