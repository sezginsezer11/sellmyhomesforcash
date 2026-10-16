'use client';

import { useState, useEffect } from 'react';
import { supabaseBrowser } from '../../lib/supabase-browser';
import OfferDashboard, { dashCss } from '../../components/OfferDashboard';

export default function MyOfferAccount() {
  const [state, setState] = useState('loading'); // loading | ok | empty | guest
  const [leads, setLeads] = useState([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) { if (alive) setState('guest'); return; }
      try {
        const res = await fetch('/api/lead?me=1', { headers: { Authorization: 'Bearer ' + token } });
        const j = await res.json();
        if (!alive) return;
        if (j.ok && j.leads && j.leads.length > 0) { setLeads(j.leads); setState('ok'); }
        else setState('empty');
      } catch { if (alive) setState('empty'); }
    };
    run();
    return () => { alive = false; };
  }, []);

  const signOut = async () => {
    await supabaseBrowser.auth.signOut();
    window.location.href = '/';
  };

  if (state === 'loading') {
    return <div className="mo-wrap mo-center"><p className="mo-dim">Loading your dashboard…</p><style>{dashCss}</style></div>;
  }

  if (state === 'guest') {
    if (typeof window !== 'undefined') window.location.href = '/login?next=/my-offer';
    return <div className="mo-wrap mo-center"><p className="mo-dim">Redirecting to sign in…</p><style>{dashCss}</style></div>;
  }

  if (state === 'empty') {
    return (
      <div className="mo-wrap mo-center">
        <div className="mo-card mo-narrow">
          <h1>No offer yet</h1>
          <p className="mo-dim">We don't see a property request on this account yet. Start your free cash offer and it'll show up here.</p>
          <a className="mo-btn" href="/get-offer">Get my cash offer</a>
          <p style={{ marginTop: 16 }}><button className="mo-signout" onClick={signOut}>Sign out</button></p>
        </div>
        <style>{dashCss}</style>
      </div>
    );
  }

  const d = leads[idx] || leads[0];
  return (
    <>
      {leads.length > 1 && (
        <div className="mo-wrap" style={{ paddingTop: 14, paddingBottom: 0 }}>
          <div className="mo-switch">
            <span>Your properties:</span>
            {leads.map((l, i) => (
              <button key={l.id || i} className={'mo-switch-btn' + (i === idx ? ' on' : '')} onClick={() => setIdx(i)}>
                {l.address ? l.address.split(',')[0] : 'Property ' + (i + 1)}
              </button>
            ))}
          </div>
          <style>{switchCss}</style>
        </div>
      )}
      <OfferDashboard d={d} onSignOut={signOut} />
    </>
  );
}

const switchCss = `
  .mo-switch { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-family: 'Jost',sans-serif; font-size: 13px; color: #6a7a82; }
  .mo-switch-btn { background: #f5f7f9; border: 1px solid #e6e9ec; color: #4a5a62; border-radius: 14px; padding: 5px 12px; font-size: 13px; cursor: pointer; font-family: 'Jost',sans-serif; }
  .mo-switch-btn.on { background: #296190; border-color: #296190; color: #fff; }
`;
