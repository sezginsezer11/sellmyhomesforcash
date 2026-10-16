'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabaseBrowser } from '../../lib/supabase-browser';

const STAGES = ['Request', 'Discovery call', 'Property visit', 'Investors compete', 'Choose & close'];
const STATUSES = ['New', 'Contacted', 'Working', 'Closed', 'Dead'];
const STATUS_COLOR = {
  New: '#296190', Contacted: '#b26a00', Working: '#1c5b34', Closed: '#555', Dead: '#8a2020',
};

export default function AdminPage() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);

  // controls
  const [q, setQ] = useState('');
  const [fStage, setFStage] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [fFlag, setFFlag] = useState('all');
  const [sort, setSort] = useState('newest');
  const [noteDraft, setNoteDraft] = useState({});

  useEffect(() => {
    let done = false;
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (done) return;
      setSession(data.session); setChecking(false);
      if (data.session) loadLeads(data.session.access_token);
    });
    // Safety: never hang on "Loading…" — show login after 6s if auth stalls.
    const t = setTimeout(() => { if (!done) setChecking(false); }, 6000);
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_e, s) => {
      setSession(s); if (s) loadLeads(s.access_token);
    });
    return () => { done = true; clearTimeout(t); sub.subscription.unsubscribe(); };
  }, []);

  const login = async (e) => {
    e.preventDefault(); setLoginErr('');
    const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password: pw });
    if (error) setLoginErr(error.message);
  };
  const logout = () => supabaseBrowser.auth.signOut();

  const loadLeads = async (token) => {
    setLoading(true);
    try {
      const res = await fetch('/api/lead?admin=1', { headers: { Authorization: 'Bearer ' + token } });
      const data = await res.json();
      if (data.ok) setLeads(data.leads || []);
    } catch {}
    setLoading(false);
  };

  const patch = async (id, body) => {
    const token = session?.access_token; if (!token) return;
    await fetch('/api/lead', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ id, ...body }),
    });
  };
  const setStage = (id, stage) => { patch(id, { stage }); setLeads(ls => ls.map(l => l.id === id ? { ...l, stage } : l)); };
  const setStatus = (id, status) => { patch(id, { status }); setLeads(ls => ls.map(l => l.id === id ? { ...l, status } : l)); };
  const saveNote = (id) => { const notes = noteDraft[id] ?? ''; patch(id, { notes }); setLeads(ls => ls.map(l => l.id === id ? { ...l, notes } : l)); };

  const view = useMemo(() => {
    let r = leads.slice();
    const term = q.trim().toLowerCase();
    if (term) r = r.filter(l => [l.name, l.address, l.phone, l.email].some(x => (x || '').toLowerCase().includes(term)));
    if (fStage !== 'all') r = r.filter(l => String(l.stage || 1) === fStage);
    if (fStatus !== 'all') r = r.filter(l => (l.status || 'New') === fStatus);
    if (fFlag === 'details') r = r.filter(l => l.details_completed);
    if (fFlag === 'callback') r = r.filter(l => l.callback_requested);
    if (sort === 'newest') r.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    else if (sort === 'oldest') r.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    else if (sort === 'stage') r.sort((a, b) => (b.stage || 1) - (a.stage || 1));
    return r;
  }, [leads, q, fStage, fStatus, fFlag, sort]);

  const exportCSV = () => {
    const cols = ['created_at','name','phone','email','address','status','stage','timeline','condition',
      'property_type','beds','baths','sqft','year_built','occupancy','reason_selling','heard_about',
      'callback_requested','details_completed','notes'];
    const esc = (v) => '"' + (v == null ? '' : String(v).replace(/"/g, '""')) + '"';
    const rows = [cols.join(',')].concat(view.map(l => cols.map(c => esc(l[c])).join(',')));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'leads-' + new Date().toISOString().slice(0,10) + '.csv';
    a.click(); URL.revokeObjectURL(url);
  };

  if (checking) return <div className="a-wrap"><p>Loading…</p><style>{css}</style></div>;

  if (!session) {
    return (
      <div className="a-wrap a-center">
        <form className="a-login" onSubmit={login}>
          <h1>Admin sign in</h1>
          <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required />
          <input type="password" placeholder="Password" value={pw} onChange={e=>setPw(e.target.value)} required />
          <button type="submit">Sign in</button>
          {loginErr && <p className="a-err">{loginErr}</p>}
        </form>
        <style>{css}</style>
      </div>
    );
  }

  return (
    <div className="a-wrap">
      <div className="a-head">
        <h1>Leads <span className="a-count">{view.length}</span></h1>
        <div><span className="a-me">{session.user.email}</span><button className="a-logout" onClick={logout}>Sign out</button></div>
      </div>

      <div className="a-controls">
        <input className="a-search" placeholder="Search name, address, phone, email…" value={q} onChange={e=>setQ(e.target.value)} />
        <select value={fStatus} onChange={e=>setFStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map(s=><option key={s}>{s}</option>)}
        </select>
        <select value={fStage} onChange={e=>setFStage(e.target.value)}>
          <option value="all">All stages</option>
          {STAGES.map((s,i)=><option key={i} value={String(i+1)}>{i+1}. {s}</option>)}
        </select>
        <select value={fFlag} onChange={e=>setFFlag(e.target.value)}>
          <option value="all">All leads</option>
          <option value="details">Details completed</option>
          <option value="callback">Callback requested</option>
        </select>
        <select value={sort} onChange={e=>setSort(e.target.value)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="stage">Highest stage</option>
        </select>
        <button className="a-export" onClick={exportCSV}>Export CSV</button>
      </div>

      {loading ? <p>Loading leads…</p> : (
        <div className="a-list">
          {view.length === 0 && <p className="a-empty">No leads match.</p>}
          {view.map(l => {
            const status = l.status || 'New';
            return (
            <div className="a-lead" key={l.id}>
              <div className="a-lead-top">
                <div>
                  <div className="a-name">{l.name || '(no name)'}
                    <span className="a-badge" style={{background: STATUS_COLOR[status] + '18', color: STATUS_COLOR[status]}}>{status}</span>
                  </div>
                  <div className="a-meta">{l.address}</div>
                  <div className="a-meta">{l.phone}{l.phone && l.email ? ' · ' : ''}{l.email}</div>
                  <div className="a-meta a-dim">{new Date(l.created_at).toLocaleString()}
                    {l.callback_requested ? <span className="a-cb"> · ↩ Callback</span> : null}
                    {l.details_completed ? <span className="a-ok"> · details ✓</span> : null}
                  </div>
                </div>
                <select className="a-status" value={status} onChange={e=>setStatus(l.id, e.target.value)}>
                  {STATUSES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>

              <div className="a-stages">
                {STAGES.map((s, i) => {
                  const n = i + 1; const done = n <= (l.stage || 1);
                  return <button key={n} className={'a-stage'+(done?' on':'')} onClick={()=>setStage(l.id, n)}>{n}. {s}</button>;
                })}
              </div>

              {(l.property_type || l.condition || l.reason_selling || l.sqft) && (
                <div className="a-detail">
                  {l.property_type && <span>{l.property_type}</span>}
                  {l.beds && <span>{l.beds} bd</span>}{l.baths && <span>{l.baths} ba</span>}
                  {l.sqft && <span>{l.sqft} sqft</span>}
                  {l.condition && <span>{l.condition}</span>}
                  {l.occupancy && <span>{l.occupancy}</span>}
                  {l.reason_selling && <span>{l.reason_selling}</span>}
                  {l.foreclosure && l.foreclosure !== 'No' && <span className="a-flag">{l.foreclosure}</span>}
                </div>
              )}

              <div className="a-notes">
                <textarea placeholder="Notes… (call recap, offer details, next steps)"
                  value={noteDraft[l.id] ?? l.notes ?? ''}
                  onChange={e=>setNoteDraft(d=>({...d,[l.id]:e.target.value}))} rows={2} />
                <button onClick={()=>saveNote(l.id)}>Save note</button>
              </div>
            </div>
          );})}
        </div>
      )}
      <style>{css}</style>
    </div>
  );
}

const css = `
  .a-wrap { max-width: 980px; margin: 0 auto; padding: 28px 20px 60px; font-family: 'Jost',system-ui,sans-serif; color: #1c2b33; }
  .a-center { min-height: 80vh; display: flex; align-items: center; justify-content: center; }
  .a-login { width: 320px; background: #fff; border: 1px solid #e6e9ec; border-top: 4px solid #296190; border-radius: 12px; padding: 28px; box-shadow: 0 12px 32px rgba(20,40,60,.08); }
  .a-login h1 { font-family: 'Cormorant Garamond',serif; font-size: 26px; margin: 0 0 16px; }
  .a-login input { width: 100%; padding: 11px 12px; margin-bottom: 12px; border: 1px solid #d5dbdf; border-radius: 6px; font-size: 15px; box-sizing: border-box; }
  .a-login button { width: 100%; padding: 12px; background: #296190; color: #fff; border: 0; border-radius: 6px; font-size: 16px; font-weight: 600; cursor: pointer; }
  .a-err { color: #8a2020; font-size: 14px; margin: 10px 0 0; }
  .a-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .a-head h1 { font-family: 'Cormorant Garamond',serif; font-size: 30px; margin: 0; }
  .a-count { font-family: 'Jost',sans-serif; font-size: 14px; background: #eef1f3; color: #4a5a62; padding: 2px 10px; border-radius: 12px; vertical-align: middle; margin-left: 6px; }
  .a-me { font-size: 13px; color: #6a7a82; margin-right: 12px; }
  .a-logout { background: none; border: 1px solid #d5dbdf; border-radius: 6px; padding: 8px 14px; cursor: pointer; font-family: 'Jost',sans-serif; }
  .a-controls { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
  .a-controls input, .a-controls select { padding: 9px 11px; border: 1px solid #d5dbdf; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 14px; background: #fff; }
  .a-search { flex: 1; min-width: 220px; }
  .a-export { padding: 9px 16px; background: #296190; color: #fff; border: 0; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; }
  .a-export:hover { background: #21506f; }
  .a-empty { color: #6a7a82; }
  .a-lead { background: #fff; border: 1px solid #e6e9ec; border-radius: 10px; padding: 18px; margin-bottom: 14px; }
  .a-lead-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .a-name { font-size: 17px; font-weight: 600; }
  .a-badge { font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 12px; margin-left: 8px; vertical-align: middle; }
  .a-meta { font-size: 13px; color: #4a5a62; margin-top: 2px; }
  .a-dim { color: #8a9aa2; }
  .a-cb { color: #b26a00; font-weight: 600; }
  .a-ok { color: #1c5b34; }
  .a-status { padding: 7px 10px; border: 1px solid #d5dbdf; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 13px; background: #fff; }
  .a-stages { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
  .a-stage { border: 1px solid #d5dbdf; background: #fff; color: #4a5a62; border-radius: 6px; padding: 7px 11px; font-size: 12.5px; cursor: pointer; font-family: 'Jost',sans-serif; }
  .a-stage.on { background: #2f9e5f; border-color: #2f9e5f; color: #fff; }
  .a-detail { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12.5px; color: #4a5a62; padding: 10px 0; border-top: 1px solid #eef1f3; }
  .a-detail span { background: #f5f7f9; padding: 3px 9px; border-radius: 12px; }
  .a-flag { background: #fbeaea !important; color: #8a2020; font-weight: 600; }
  .a-notes { display: flex; gap: 8px; margin-top: 10px; }
  .a-notes textarea { flex: 1; padding: 9px 11px; border: 1px solid #d5dbdf; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 13.5px; resize: vertical; box-sizing: border-box; }
  .a-notes button { padding: 8px 14px; background: none; border: 1px solid #296190; color: #296190; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; align-self: flex-start; white-space: nowrap; }
  .a-notes button:hover { background: #296190; color: #fff; }
`;
