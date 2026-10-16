'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabaseBrowser } from '../../../lib/supabase-browser';

// Column definitions for the editable comps table.
const COLS = [
  { k: 'mls_number', label: 'MLS #', w: 90 },
  { k: 'status', label: 'Status', w: 90 },
  { k: 'sub_type', label: 'Sub Type', w: 120 },
  { k: 'my_notes', label: 'My Notes', w: 160 },
  { k: 'address', label: 'Address', w: 180 },
  { k: 'postal_code', label: 'Zip', w: 70 },
  { k: 'year_built', label: 'Year', w: 64 },
  { k: 'beds', label: 'Beds', w: 56 },
  { k: 'baths', label: 'Baths', w: 56 },
  { k: 'living_area', label: 'Living Area', w: 90 },
  { k: 'lot_size_sqft', label: 'Lot Sqft', w: 80 },
  { k: 'sold_ppsf', label: 'Sold $/sf', w: 80 },
  { k: 'close_price', label: 'Close Price', w: 100 },
  { k: 'close_date', label: 'Close Date', w: 100 },
  { k: 'orig_list_price', label: 'Orig List', w: 100 },
  { k: 'price_ppsf', label: '$/sqft', w: 72 },
  { k: 'days_on_market', label: 'DOM', w: 60 },
];

export default function AdminComps() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  const [reports, setReports] = useState([]);
  const [active, setActive] = useState(null); // active report object
  const [comps, setComps] = useState([]);
  const [loading, setLoading] = useState(false);

  // new report form
  const [newSubject, setNewSubject] = useState('');
  const [newClient, setNewClient] = useState('');

  // add-property box
  const [addr, setAddr] = useState('');
  const [sugg, setSugg] = useState([]);
  const [selUrl, setSelUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  const token = () => session?.access_token;

  useEffect(() => {
    let done = false;
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (done) return;
      setSession(data.session); setChecking(false);
      if (data.session) loadReports(data.session.access_token);
    });
    const t = setTimeout(() => { if (!done) setChecking(false); }, 6000);
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_e, s) => {
      setSession(s); if (s) loadReports(s.access_token);
    });
    return () => { done = true; clearTimeout(t); sub.subscription.unsubscribe(); };
  }, []);

  const loadReports = async (tk) => {
    try {
      const r = await fetch('/api/comps', { headers: { Authorization: 'Bearer ' + tk } });
      const j = await r.json();
      if (j.ok) setReports(j.reports || []);
    } catch {}
  };

  const openReport = async (id) => {
    setLoading(true); setMsg('');
    try {
      const r = await fetch('/api/comps?report=' + id, { headers: { Authorization: 'Bearer ' + token() } });
      const j = await r.json();
      if (j.ok) { setActive(j.report); setComps(j.comps || []); setSheetUrl(j.report.sheet_url || ''); }
    } catch {}
    setLoading(false);
  };

  const setReportToggle = async (key, val) => {
    setActive((a) => ({ ...a, [key]: val }));
    try {
      await fetch('/api/comps', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ report_id: active.id, report_fields: { [key]: val } }),
      });
    } catch {}
  };

  const createReport = async () => {
    if (!newSubject.trim()) return;
    const r = await fetch('/api/comps', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify({ action: 'create_report', subject_address: newSubject, client_name: newClient }),
    });
    const j = await r.json();
    if (j.ok) {
      setNewSubject(''); setNewClient('');
      await loadReports(token());
      openReport(j.report.id);
    }
  };

  // address autocomplete for adding a comp
  useEffect(() => {
    if (!addr || addr.length < 3) { setSugg([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch('/api/comps?autocomplete=' + encodeURIComponent(addr), { headers: { Authorization: 'Bearer ' + token() } });
        const j = await r.json();
        setSugg(j.suggestions || []);
      } catch {}
    }, 350);
    return () => clearTimeout(t);
  }, [addr]);

  const pickSugg = (s) => { setAddr(s.label); setSelUrl(s.url); setSugg([]); };

  const addComp = async () => {
    if (!active) return;
    setAdding(true); setMsg('');
    try {
      const r = await fetch('/api/comps', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({
          action: 'add_comp', report_id: active.id,
          redfin_url: selUrl, address: addr, sort_order: comps.length,
        }),
      });
      const j = await r.json();
      if (j.ok) { setComps((c) => [...c, j.comp]); setAddr(''); setSelUrl(''); setMsg('Added ✓'); }
      else setMsg(j.error || 'Could not add.');
    } catch { setMsg('Error adding.'); }
    setAdding(false);
    setTimeout(() => setMsg(''), 2000);
  };

  // debounced per-cell save
  const saveCell = async (compId, k, v) => {
    setComps((cs) => cs.map((c) => c.id === compId ? { ...c, [k]: v } : c));
  };
  const commitCell = async (compId, k, v) => {
    try {
      await fetch('/api/comps', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ comp_id: compId, [k]: v }),
      });
    } catch {}
  };

  const importSheet = async () => {
    if (!active || !sheetUrl.trim()) return;
    setImporting(true); setImportMsg('Reading sheet…');
    try {
      const r = await fetch('/api/comps', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ action: 'import_sheet', report_id: active.id, sheet_url: sheetUrl }),
      });
      const j = await r.json();
      if (j.ok) { setComps(j.comps || []); setImportMsg('Imported ' + j.count + ' rows ✓'); }
      else setImportMsg(j.error || 'Import failed.');
    } catch { setImportMsg('Import error.'); }
    setImporting(false);
    setTimeout(() => setImportMsg(''), 4000);
  };

  const refreshComp = async (compId) => {
    const r = await fetch('/api/comps', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify({ comp_id: compId, action: 'refresh' }),
    });
    const j = await r.json();
    if (j.ok && j.comp) setComps((cs) => cs.map((c) => c.id === compId ? j.comp : c));
  };

  const toggleStar = async (compId, current) => {
    const val = !current;
    setComps((cs) => cs.map((c) => c.id === compId ? { ...c, starred: val } : c));
    try {
      await fetch('/api/comps', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ comp_id: compId, starred: val }),
      });
    } catch {}
  };

  const moveComp = async (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= comps.length) return;
    const arr = comps.slice();
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    setComps(arr);
    // persist new sort_order for both swapped rows (and keep whole list consistent)
    try {
      await Promise.all(arr.map((c, i) =>
        fetch('/api/comps', {
          method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
          body: JSON.stringify({ comp_id: c.id, sort_order: i }),
        })
      ));
    } catch {}
  };

  const uploadPhoto = async (compId, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      try {
        const r = await fetch('/api/comps', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
          body: JSON.stringify({ action: 'upload_photo', comp_id: compId, data_url: dataUrl }),
        });
        const jr = await r.json();
        if (jr.ok) setComps((cs) => cs.map((c) => c.id === compId ? { ...c, photo_override: jr.url } : c));
        else alert(jr.error || 'Upload failed.');
      } catch { alert('Upload error.'); }
    };
    reader.readAsDataURL(file);
  };

  const deleteComp = async (compId) => {
    setComps((cs) => cs.filter((c) => c.id !== compId));
    try {
      await fetch('/api/comps', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ comp_id: compId }),
      });
    } catch {}
  };

  const publicUrl = active ? (typeof window !== 'undefined' ? window.location.origin : '') + '/comps/' + active.slug : '';
  const [copied, setCopied] = useState(false);
  const copyLink = () => { navigator.clipboard?.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  if (checking) return <div className="c-wrap"><p>Loading…</p><style>{css}</style></div>;
  if (!session) return (
    <div className="c-wrap"><p>Please <a href="/admin">sign in</a> first.</p><style>{css}</style></div>
  );

  return (
    <div className="c-wrap">
      <div className="c-head">
        <h1>Comps</h1>
        <div><a className="c-link" href="/admin">← Leads</a><span className="c-me">{session.user.email}</span></div>
      </div>

      {!active ? (
        <>
          <div className="c-newcard">
            <h2>New comps report</h2>
            <p className="c-sub">Enter the subject property you're running comps for. Its address becomes the shareable link.</p>
            <div className="c-newrow">
              <input placeholder="Subject property address" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} />
              <input placeholder="Client name (optional)" value={newClient} onChange={(e) => setNewClient(e.target.value)} />
              <button onClick={createReport} disabled={!newSubject.trim()}>Create report</button>
            </div>
          </div>

          <h2 className="c-listhead">Your reports</h2>
          <div className="c-reports">
            {reports.length === 0 && <p className="c-dim">No reports yet.</p>}
            {reports.map((r) => (
              <div className="c-reportrow" key={r.id} onClick={() => openReport(r.id)}>
                <div>
                  <div className="c-rtitle">{r.title || r.subject_address}</div>
                  <div className="c-rmeta">{r.client_name ? r.client_name + ' · ' : ''}/comps/{r.slug}</div>
                </div>
                <span className="c-open">Open →</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <button className="c-back" onClick={() => { setActive(null); setComps([]); }}>← All reports</button>
          <div className="c-reporthead">
            <div>
              <h2>{active.title || active.subject_address}</h2>
              <div className="c-rmeta">{active.client_name}</div>
            </div>
            <div className="c-share">
              <a className="c-viewpub" href={'/comps/' + active.slug} target="_blank" rel="noopener">View public page ↗</a>
              <button className="c-copy" onClick={copyLink}>{copied ? 'Copied ✓' : 'Copy share link'}</button>
            </div>
          </div>

          <div className="c-toggles">
            <label><input type="checkbox" checked={active.show_stats !== false} onChange={(e) => setReportToggle('show_stats', e.target.checked)} /> Show statistics section</label>
            <label><input type="checkbox" checked={active.show_map !== false} onChange={(e) => setReportToggle('show_map', e.target.checked)} /> Show map</label>
          </div>

          <div className="c-sheetbox">
            <div className="c-sheethead">Import comps from a Google Sheet</div>
            <div className="c-sheetrow">
              <input placeholder="Paste Google Sheet link…" value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)} />
              <button className="c-sheetbtn" onClick={importSheet} disabled={importing || !sheetUrl.trim()}>
                {importing ? 'Importing…' : 'Import / Refresh from sheet'}
              </button>
              {importMsg && <span className="c-msg">{importMsg}</span>}
            </div>
            <div className="c-sheethint">Reads your standard MLS export columns. Re-import anytime to refresh.</div>
          </div>

          <div className="c-addbox">
            <div className="c-addfield">
              <input placeholder="Add a comp — type property address…" value={addr}
                onChange={(e) => { setAddr(e.target.value); setSelUrl(''); }} />
              {sugg.length > 0 && (
                <ul className="c-sugg">
                  {sugg.map((s, i) => <li key={i} onClick={() => pickSugg(s)}>{s.label}</li>)}
                </ul>
              )}
            </div>
            <button className="c-addbtn" onClick={addComp} disabled={adding || !addr.trim()}>
              {adding ? 'Pulling…' : 'Add comp'}
            </button>
            {msg && <span className="c-msg">{msg}</span>}
          </div>

          {loading ? <p>Loading…</p> : (
          <div className="c-tablewrap">
            <table className="c-table">
              <thead>
                <tr>
                  <th className="c-ctrlcol">Order</th>
                  <th className="c-photocol">Photo</th>
                  {COLS.map((col) => <th key={col.k} style={{ minWidth: col.w }}>{col.label}</th>)}
                  <th className="c-actcol"></th>
                </tr>
              </thead>
              <tbody>
                {comps.length === 0 && (
                  <tr><td colSpan={COLS.length + 3} className="c-empty">No comps yet. Add a property above.</td></tr>
                )}
                {comps.map((c, idx) => (
                  <tr key={c.id} className={c.starred ? 'c-starred' : ''}>
                    <td className="c-ctrlcol">
                      <button className={'c-star' + (c.starred ? ' on' : '')} title="Star (most comparable)" onClick={() => toggleStar(c.id, c.starred)}>★</button>
                      <div className="c-move">
                        <button onClick={() => moveComp(idx, -1)} disabled={idx === 0} title="Move up">▲</button>
                        <button onClick={() => moveComp(idx, 1)} disabled={idx === comps.length - 1} title="Move down">▼</button>
                      </div>
                    </td>
                    <td className="c-photocol">
                      <label className="c-photolabel" title="Upload / change photo">
                        {(c.photo_override || c.photo_url)
                          ? <img src={c.photo_override || c.photo_url} alt="" className="c-thumb" />
                          : <span className="c-nophoto">+ Photo</span>}
                        <input type="file" accept="image/*" style={{ display: 'none' }}
                          onChange={(e) => uploadPhoto(c.id, e.target.files && e.target.files[0])} />
                      </label>
                    </td>
                    {COLS.map((col) => (
                      <td key={col.k}>
                        <input
                          value={c[col.k] ?? ''}
                          onChange={(e) => saveCell(c.id, col.k, e.target.value)}
                          onBlur={(e) => commitCell(c.id, col.k, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="c-actcol">
                      {c.redfin_url && <button className="c-refresh" title="Refresh from Redfin" onClick={() => refreshComp(c.id)}>↻</button>}
                      <button className="c-del" title="Delete" onClick={() => deleteComp(c.id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </>
      )}

      <style>{css}</style>
    </div>
  );
}

const css = `
  .c-wrap { max-width: 1400px; margin: 0 auto; padding: 24px 18px 60px; font-family: 'Jost',system-ui,sans-serif; color: #1c2b33; }
  .c-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .c-head h1 { font-family: 'Cormorant Garamond',serif; font-size: 30px; margin: 0; }
  .c-link { color: #296190; text-decoration: none; margin-right: 14px; font-size: 14px; }
  .c-me { font-size: 13px; color: #6a7a82; }
  .c-dim { color: #6a7a82; }
  .c-newcard { background: #fff; border: 1px solid #e6e9ec; border-top: 3px solid #296190; border-radius: 12px; padding: 22px; margin-bottom: 26px; }
  .c-newcard h2 { font-family: 'Cormorant Garamond',serif; font-size: 22px; margin: 0 0 4px; }
  .c-sub { color: #6a7a82; font-size: 14px; margin: 0 0 14px; }
  .c-newrow { display: flex; gap: 10px; flex-wrap: wrap; }
  .c-newrow input { flex: 1; min-width: 200px; padding: 11px 12px; border: 1px solid #d5dbdf; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 15px; }
  .c-newrow button { padding: 11px 20px; background: #296190; color: #fff; border: 0; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 15px; font-weight: 600; cursor: pointer; }
  .c-newrow button:disabled { opacity: .5; cursor: default; }
  .c-listhead { font-family: 'Cormorant Garamond',serif; font-size: 22px; margin: 0 0 12px; }
  .c-reports { display: flex; flex-direction: column; gap: 8px; }
  .c-reportrow { background: #fff; border: 1px solid #e6e9ec; border-radius: 8px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
  .c-reportrow:hover { border-color: #296190; }
  .c-rtitle { font-weight: 600; font-size: 15px; }
  .c-rmeta { font-size: 13px; color: #6a7a82; margin-top: 2px; }
  .c-open { color: #296190; font-size: 14px; }
  .c-back { background: none; border: 0; color: #296190; cursor: pointer; font-family: 'Jost',sans-serif; font-size: 14px; padding: 0; margin-bottom: 14px; }
  .c-reporthead { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 18px; flex-wrap: wrap; }
  .c-reporthead h2 { font-family: 'Cormorant Garamond',serif; font-size: 26px; margin: 0; }
  .c-share { display: flex; gap: 10px; align-items: center; }
  .c-toggles { display: flex; gap: 22px; margin-bottom: 16px; flex-wrap: wrap; }
  .c-toggles label { display: flex; align-items: center; gap: 7px; font-size: 13.5px; color: #4a5a62; cursor: pointer; }
  .c-toggles input { width: 16px; height: 16px; cursor: pointer; }
  .c-viewpub { color: #296190; text-decoration: none; font-size: 14px; font-weight: 600; }
  .c-copy { padding: 9px 16px; background: #1c5b34; color: #fff; border: 0; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 13.5px; font-weight: 600; cursor: pointer; }
  .c-sheetbox { background: #eef4f9; border: 1px solid #d3e2ee; border-radius: 10px; padding: 14px 16px; margin-bottom: 16px; }
  .c-sheethead { font-size: 13px; font-weight: 600; color: #296190; margin-bottom: 10px; }
  .c-sheetrow { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .c-sheetrow input { flex: 1; min-width: 260px; padding: 11px 12px; border: 1px solid #bcd2e4; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 14px; }
  .c-sheetbtn { padding: 11px 18px; background: #296190; color: #fff; border: 0; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .c-sheetbtn:disabled { opacity: .5; cursor: default; }
  .c-sheethint { font-size: 12px; color: #6a7a82; margin-top: 8px; }
  .c-addbox { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 16px; position: relative; }
  .c-addfield { position: relative; flex: 1; max-width: 460px; }
  .c-addfield input { width: 100%; padding: 12px 13px; border: 1px solid #d5dbdf; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 15px; box-sizing: border-box; }
  .c-sugg { position: absolute; top: calc(100% + 3px); left: 0; right: 0; background: #fff; border: 1px solid #e6e9ec; border-radius: 8px; box-shadow: 0 12px 28px rgba(20,40,60,.16); list-style: none; margin: 0; padding: 5px; z-index: 40; }
  .c-sugg li { padding: 10px 11px; border-radius: 5px; cursor: pointer; font-size: 14px; }
  .c-sugg li:hover { background: #f0f4f7; color: #296190; }
  .c-addbtn { padding: 12px 20px; background: #296190; color: #fff; border: 0; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 15px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .c-addbtn:disabled { opacity: .5; cursor: default; }
  .c-msg { align-self: center; font-size: 14px; color: #1c5b34; }
  .c-tablewrap { overflow-x: auto; border: 1px solid #e6e9ec; border-radius: 8px; background: #fff; }
  .c-table { border-collapse: collapse; width: 100%; font-size: 13px; }
  .c-table th { background: #f5f7f9; text-align: left; padding: 9px 8px; font-size: 11.5px; font-weight: 600; color: #4a5a62; text-transform: uppercase; letter-spacing: .03em; border-bottom: 1px solid #e6e9ec; white-space: nowrap; }
  .c-table td { border-bottom: 1px solid #f0f3f5; padding: 0; }
  .c-table input { width: 100%; border: 0; padding: 8px 8px; font-family: 'Jost',sans-serif; font-size: 13px; background: transparent; box-sizing: border-box; }
  .c-table input:focus { outline: 2px solid #296190; outline-offset: -2px; background: #f8fbfd; }
  .c-empty { text-align: center; color: #6a7a82; padding: 24px; font-size: 14px; }
  .c-ctrlcol { white-space: nowrap; text-align: center; padding: 4px 6px !important; width: 70px; }
  .c-photocol { padding: 4px !important; text-align: center; width: 66px; }
  .c-star { background: none; border: 0; cursor: pointer; font-size: 18px; color: #d5dbdf; padding: 2px; line-height: 1; }
  .c-star.on { color: #e0a800; }
  .c-move { display: flex; flex-direction: column; gap: 1px; align-items: center; margin-top: 2px; }
  .c-move button { background: none; border: 0; cursor: pointer; font-size: 9px; color: #8a9aa2; padding: 0 3px; line-height: 1.1; }
  .c-move button:disabled { opacity: .25; cursor: default; }
  .c-move button:hover:not(:disabled) { color: #296190; }
  .c-photolabel { cursor: pointer; display: inline-block; }
  .c-thumb { width: 54px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #e6e9ec; display: block; }
  .c-nophoto { display: inline-flex; align-items: center; justify-content: center; width: 54px; height: 40px; border: 1px dashed #c5ccd1; border-radius: 4px; font-size: 10px; color: #8a9aa2; }
  .c-starred { background: #fffdf4; }
  .c-actcol { white-space: nowrap; padding: 0 6px !important; text-align: center; }
  .c-refresh, .c-del { background: none; border: 0; cursor: pointer; font-size: 14px; padding: 4px 6px; color: #6a7a82; }
  .c-refresh:hover { color: #296190; }
  .c-del:hover { color: #8a2020; }
`;
