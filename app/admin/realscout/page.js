'use client';

import { useState, useEffect } from 'react';
import { supabaseBrowser } from '../../../lib/supabase-browser';

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '—');

// RealScout prefixes its own auto-generated behaviour tags with "RealScout ",
// which is just noise once they're all in one column.
const SHOWN_TAGS = 2;
const tagLabel = (t) => t.replace(/^RealScout /, '');

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState('last_active_at');
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  const loadAccount = async () => {
    setAccountLoading(true);
    try {
      const res = await fetch('/api/realscout?action=me', { headers: { Authorization: 'Bearer ' + token() } });
      setAccount(await res.json());
    } catch { setAccount({ ok: false, error: 'network_error' }); }
    setAccountLoading(false);
  };
  useEffect(() => { loadAccount(); }, []);

  const loadContacts = async (reset) => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ action: 'contacts', sort, order: 'DESC', limit: '50' });
      if (name.trim()) params.set('name', name.trim());
      if (tag.trim()) params.set('tag', tag.trim());
      if (!reset && cursor) params.set('cursor', cursor);
      const res = await fetch('/api/realscout?' + params.toString(), { headers: { Authorization: 'Bearer ' + token() } });
      const j = await res.json();
      if (!j.ok) { setError(j); if (reset) setContacts([]); setLoading(false); return; }
      setContacts((prev) => (reset ? j.contacts : [...prev, ...j.contacts]));
      setHasMore(j.hasMore); setCursor(j.nextCursor);
    } catch { setError({ error: 'network_error' }); }
    setLoading(false);
  };

  useEffect(() => {
    if (account?.ok) loadContacts(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.ok, sort]);

  const runSearch = (e) => { if (e) e.preventDefault(); loadContacts(true); };

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

      <form className="r-filters" onSubmit={runSearch}>
        <input placeholder="Name…" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Tag…" value={tag} onChange={(e) => setTag(e.target.value)} />
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="last_active_at">Sort: Last active</option>
          <option value="created_at">Sort: Created</option>
          <option value="scout_score">Sort: Scout Score</option>
        </select>
        <button type="submit" className="r-searchbtn" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
      </form>

      {error && <p className="r-err">{error.status === 429 ? 'Rate limited — try again shortly.' : 'Could not load contacts.'}</p>}

      <div className="r-tablewrap">
        <table className="r-table">
          <thead>
            <tr>
              <th className="r-name">Name</th><th>Email</th><th>Phone</th><th>Tags</th>
              <th className="r-r">Scout Score</th><th>Last active</th><th>Created</th><th></th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id}>
                <td className="r-name">{[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}</td>
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
                <td>{fmtDate(c.created_at)}</td>
                <td>{c.realscout_url && <a className="r-link" href={c.realscout_url} target="_blank" rel="noopener">View ↗</a>}</td>
              </tr>
            ))}
            {!loading && contacts.length === 0 && !error && (
              <tr><td colSpan={8} className="r-dim">No contacts found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <button className="r-loadmore" onClick={() => loadContacts(false)} disabled={loading}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
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
  .r-table td.r-tags { white-space: normal; max-width: 240px; color: #46535a; }
  .r-more { color: #8b979d; }
  /* Keep the person visible while scrolling the rest sideways. */
  .r-table .r-name { position: sticky; left: 0; z-index: 1; background: #fff; }
  .r-table th.r-name { background: #f7f9fa; z-index: 2; }

  .r-loadmore { margin-top: 14px; padding: 8px 18px; border: 1px solid #d3dade; border-radius: 8px; background: #fff; cursor: pointer; font-size: 14px; }
  .r-loadmore:disabled { opacity: .6; cursor: default; }
`;
