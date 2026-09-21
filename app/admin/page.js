'use client';

import { useState, useEffect } from 'react';
import { supabaseBrowser } from '../../lib/supabase-browser';

const STAGES = ['Request', 'Discovery call', 'Property visit', 'Investors compete', 'Choose & close'];

export default function AdminPage() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
      if (data.session) loadLeads(data.session.access_token);
    });
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) loadLeads(s.access_token);
    });
    return () => sub.subscription.unsubscribe();
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

  const setStage = async (id, stage) => {
    const token = session?.access_token;
    if (!token) return;
    await fetch('/api/lead', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ id, stage }),
    });
    setLeads(ls => ls.map(l => l.id === id ? { ...l, stage } : l));
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
        <h1>Leads</h1>
        <div><span className="a-me">{session.user.email}</span><button className="a-logout" onClick={logout}>Sign out</button></div>
      </div>
      {loading ? <p>Loading leads…</p> : (
        <div className="a-list">
          {leads.length === 0 && <p>No leads yet.</p>}
          {leads.map(l => (
            <div className="a-lead" key={l.id}>
              <div className="a-lead-head">
                <div>
                  <div className="a-name">{l.name || '(no name)'}</div>
                  <div className="a-meta">{l.address} · {l.phone} · {l.email}</div>
                  <div className="a-meta">{new Date(l.created_at).toLocaleString()}
                    {l.callback_requested ? <span className="a-cb"> · ↩ Callback requested</span> : null}
                    {l.details_completed ? <span className="a-ok"> · details complete</span> : null}
                  </div>
                </div>
              </div>
              <div className="a-stages">
                {STAGES.map((s, i) => {
                  const n = i + 1; const done = n <= (l.stage || 1);
                  return <button key={n} className={'a-stage'+(done?' a-stage-on':'')} onClick={()=>setStage(l.id, n)}>{n}. {s}</button>;
                })}
              </div>
              {(l.property_type || l.condition_detail || l.reason_selling) && (
                <div className="a-detail">
                  {l.property_type && <span>{l.property_type}</span>}
                  {l.beds && <span>{l.beds} bd</span>}{l.baths && <span>{l.baths} ba</span>}
                  {l.condition_detail && <span>{l.condition_detail}</span>}
                  {l.occupancy && <span>{l.occupancy}</span>}
                  {l.reason_selling && <span>{l.reason_selling}</span>}
                  {l.foreclosure && l.foreclosure !== 'No' && <span className="a-flag">{l.foreclosure}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <style>{css}</style>
    </div>
  );
}

const css = `
  .a-wrap { max-width: 960px; margin: 0 auto; padding: 32px 20px; font-family: 'Jost',system-ui,sans-serif; color: #1c2b33; }
  .a-center { min-height: 80vh; display: flex; align-items: center; justify-content: center; }
  .a-login { width: 320px; background: #fff; border: 1px solid #e6e9ec; border-top: 4px solid #296190; border-radius: 12px; padding: 28px; box-shadow: 0 12px 32px rgba(20,40,60,.08); }
  .a-login h1 { font-family: 'Cormorant Garamond',serif; font-size: 26px; margin: 0 0 16px; }
  .a-login input { width: 100%; padding: 11px 12px; margin-bottom: 12px; border: 1px solid #d5dbdf; border-radius: 6px; font-size: 15px; box-sizing: border-box; }
  .a-login button { width: 100%; padding: 12px; background: #296190; color: #fff; border: 0; border-radius: 6px; font-size: 16px; font-weight: 600; cursor: pointer; }
  .a-err { color: #8a2020; font-size: 14px; margin: 10px 0 0; }
  .a-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .a-head h1 { font-family: 'Cormorant Garamond',serif; font-size: 30px; margin: 0; }
  .a-me { font-size: 13px; color: #6a7a82; margin-right: 12px; }
  .a-logout { background: none; border: 1px solid #d5dbdf; border-radius: 6px; padding: 8px 14px; cursor: pointer; font-family: 'Jost',sans-serif; }
  .a-lead { background: #fff; border: 1px solid #e6e9ec; border-radius: 10px; padding: 18px; margin-bottom: 14px; }
  .a-name { font-size: 17px; font-weight: 600; }
  .a-meta { font-size: 13px; color: #6a7a82; margin-top: 3px; }
  .a-cb { color: #b26a00; font-weight: 600; }
  .a-ok { color: #1c5b34; }
  .a-stages { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
  .a-stage { border: 1px solid #d5dbdf; background: #fff; color: #4a5a62; border-radius: 6px; padding: 7px 11px; font-size: 12.5px; cursor: pointer; font-family: 'Jost',sans-serif; }
  .a-stage-on { background: #2f9e5f; border-color: #2f9e5f; color: #fff; }
  .a-detail { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12.5px; color: #4a5a62; padding-top: 10px; border-top: 1px solid #eef1f3; }
  .a-detail span { background: #f5f7f9; padding: 3px 9px; border-radius: 12px; }
  .a-flag { background: #fbeaea !important; color: #8a2020; font-weight: 600; }
`;
