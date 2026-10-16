'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const fmtMoney = (v) => {
  if (v == null || v === '') return '';
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n === 0) return typeof v === 'string' ? v : '';
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(2).replace(/\.00$/, '') + 'M';
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
};
const fmtFull = (v) => {
  if (v == null || v === '') return '';
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n === 0) return typeof v === 'string' ? v : '';
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
};
const fmtNum = (v) => {
  if (v == null || v === '') return '';
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n.toLocaleString('en-US') : v;
};
const statusClass = (s) => {
  const t = (s || '').toLowerCase();
  if (t.includes('close') || t.includes('sold')) return 'st-closed';
  if (t.includes('pend')) return 'st-pending';
  if (t.includes('active')) return 'st-active';
  return '';
};

export default function PublicComps() {
  const { slug } = useParams();
  const [state, setState] = useState('loading');
  const [report, setReport] = useState(null);
  const [comps, setComps] = useState([]);

  useEffect(() => {
    let alive = true;
    fetch('/api/comps?slug=' + encodeURIComponent(slug))
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.ok) { setReport(j.report); setComps(j.comps || []); setState('ok'); }
        else setState('error');
      })
      .catch(() => alive && setState('error'));
    return () => { alive = false; };
  }, [slug]);

  if (state === 'loading') return <div className="cp-wrap cp-center"><p className="cp-dim">Loading…</p><style>{css}</style></div>;
  if (state === 'error') return (
    <div className="cp-wrap cp-center">
      <div className="cp-errcard">
        <h1>Report not found</h1>
        <p className="cp-dim">This comps report link may be incorrect or no longer available.</p>
        <a className="cp-btn" href="tel:8584366585">Call (858) 436-6585</a>
      </div>
      <style>{css}</style>
    </div>
  );

  // Price preference: close price (sold) else current/orig list.
  const priceOf = (c) => c.close_price || c.current_price || c.orig_list_price || '';
  const ppsfOf = (c) => c.sold_ppsf || c.price_ppsf || '';

  return (
    <div className="cp-wrap">
      {/* Header */}
      <header className="cp-top">
        <div className="cp-brand">Keller Williams Realty</div>
        <div className="cp-agent">Sez Sezer · DRE #01988197 · (858) 436-6585</div>
      </header>

      {/* Hero */}
      <section className="cp-hero">
        <p className="cp-eyebrow">Comparative Market Analysis</p>
        <h1>{report.title || report.subject_address}</h1>
        {report.client_name && <p className="cp-sub">Prepared for {report.client_name}</p>}
        <p className="cp-subject">Subject property · <strong>{report.subject_address}</strong></p>
        {report.intro && <p className="cp-intro">{report.intro}</p>}
      </section>

      {/* Featured Listings — cards */}
      <section className="cp-section">
        <div className="cp-sechead"><span className="cp-secnum">1</span><h2>Featured Listings</h2></div>
        <div className="cp-cards">
          {comps.map((c) => (
            <article className="cp-card" key={c.id}>
              <div className="cp-cardimg" style={c.photo_url ? { backgroundImage: `url(${c.photo_url})` } : {}}>
                {!c.photo_url && <span className="cp-cardaddr-ph">{c.address}</span>}
                {c.status && <span className={'cp-badge ' + statusClass(c.status)}>{c.status}</span>}
              </div>
              <div className="cp-cardbody">
                <h3>{c.address}</h3>
                <div className="cp-price">{fmtFull(priceOf(c))}</div>
                <div className="cp-stats">
                  <div><span className="cp-sl">Beds</span><span className="cp-sv">{c.beds || '—'}</span></div>
                  <div><span className="cp-sl">Baths</span><span className="cp-sv">{c.baths || '—'}</span></div>
                  <div><span className="cp-sl">Sq Ft</span><span className="cp-sv">{fmtNum(c.living_area) || '—'}</span></div>
                  <div><span className="cp-sl">$/SF</span><span className="cp-sv">{ppsfOf(c) ? (String(ppsfOf(c)).startsWith('$') ? ppsfOf(c) : '$' + ppsfOf(c)) : '—'}</span></div>
                </div>
                {c.my_notes && <p className="cp-notes">{c.my_notes}</p>}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Quick Comparison — table */}
      <section className="cp-section">
        <div className="cp-sechead"><span className="cp-secnum">2</span><h2>Quick Comparison</h2></div>
        <div className="cp-tablecard">
          <h3 className="cp-tabletitle">Compare All {comps.length} {comps.length === 1 ? 'Property' : 'Properties'}</h3>
          <p className="cp-tablesub">Side-by-side breakdown of key metrics</p>
          <div className="cp-tablewrap">
            <table className="cp-table">
              <thead>
                <tr>
                  <th>Property</th><th>MLS #</th><th className="cp-r">Close / List</th>
                  <th className="cp-r">Beds</th><th className="cp-r">Baths</th>
                  <th className="cp-r">Sq Ft</th><th className="cp-r">$/SF</th>
                  <th className="cp-r">Close Date</th><th className="cp-r">DOM</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {comps.length === 0 && <tr><td colSpan={10} className="cp-empty">No comparable properties listed yet.</td></tr>}
                {comps.map((c) => (
                  <tr key={c.id}>
                    <td className="cp-addr">{c.address}</td>
                    <td className="cp-mls">{c.mls_number}</td>
                    <td className="cp-r">{fmtFull(priceOf(c))}</td>
                    <td className="cp-r">{c.beds}</td>
                    <td className="cp-r">{c.baths}</td>
                    <td className="cp-r">{fmtNum(c.living_area)}</td>
                    <td className="cp-r">{ppsfOf(c) ? (String(ppsfOf(c)).startsWith('$') ? ppsfOf(c) : '$' + ppsfOf(c)) : ''}</td>
                    <td className="cp-r">{c.close_date}</td>
                    <td className="cp-r">{c.days_on_market}</td>
                    <td><span className={'cp-status ' + statusClass(c.status)}>{c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cp-ctasec">
        <h2>Questions about these comps?</h2>
        <p>I'm happy to walk you through the full analysis and what it means for your home.</p>
        <div className="cp-cta-row">
          <a className="cp-btn" href="tel:8584366585">Call (858) 436-6585</a>
          <a className="cp-btn cp-btn-ghost" href="mailto:sez@carmelvalley.com">Email Sez</a>
        </div>
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

const LAKE = '#344a57';
const GOLD = '#c9a96e';

const css = `
  .cp-wrap { max-width: 1200px; margin: 0 auto; padding: 0 20px 70px; font-family: 'Jost',system-ui,sans-serif; color: #26333b; background: #faf9f7; }
  .cp-center { min-height: 80vh; display: flex; align-items: center; justify-content: center; }
  .cp-dim { color: #7a8891; }
  .cp-errcard { background: #fff; border: 1px solid #e6e9ec; border-radius: 14px; padding: 32px; text-align: center; max-width: 420px; }
  .cp-errcard h1 { font-family: 'Cormorant Garamond',serif; font-size: 28px; margin: 0 0 10px; }
  .cp-top { display: flex; align-items: center; justify-content: space-between; padding: 22px 0; border-bottom: 1px solid #ece8e1; flex-wrap: wrap; gap: 6px; }
  .cp-brand { font-family: 'Cormorant Garamond',serif; font-size: 21px; font-weight: 600; color: ${LAKE}; letter-spacing: .02em; }
  .cp-agent { font-size: 13px; color: #7a8891; }
  .cp-hero { padding: 44px 0 30px; text-align: center; }
  .cp-eyebrow { font-size: 12px; letter-spacing: .22em; text-transform: uppercase; color: ${GOLD}; font-weight: 600; margin: 0 0 12px; }
  .cp-hero h1 { font-family: 'Cormorant Garamond',serif; font-size: 44px; font-weight: 600; margin: 0 0 8px; color: ${LAKE}; line-height: 1.1; }
  .cp-sub { font-size: 17px; color: #4a5a62; margin: 0 0 6px; font-style: italic; }
  .cp-subject { font-size: 15px; color: #4a5a62; margin: 10px 0 0; }
  .cp-intro { font-size: 15.5px; color: #4a5a62; line-height: 1.7; margin: 18px auto 0; max-width: 720px; }
  .cp-section { margin-top: 40px; }
  .cp-sechead { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
  .cp-secnum { width: 44px; height: 44px; border: 1.5px solid ${GOLD}; border-radius: 50%; color: ${GOLD}; display: flex; align-items: center; justify-content: center; font-family: 'Cormorant Garamond',serif; font-size: 18px; flex-shrink: 0; }
  .cp-sechead h2 { font-family: 'Cormorant Garamond',serif; font-size: 34px; font-weight: 500; margin: 0; color: ${LAKE}; }
  .cp-sechead::after { content: ''; flex: 1; height: 1px; background: #e6e2da; }
  .cp-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 26px; }
  .cp-card { background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 10px 30px rgba(52,74,87,.08); border: 1px solid #eee9e1; }
  .cp-cardimg { position: relative; height: 240px; background: ${LAKE}; background-size: cover; background-position: center; display: flex; align-items: center; justify-content: center; }
  .cp-cardaddr-ph { font-family: 'Cormorant Garamond',serif; font-size: 26px; color: rgba(255,255,255,.55); text-align: center; padding: 0 20px; }
  .cp-badge { position: absolute; top: 14px; left: 14px; background: rgba(255,255,255,.95); color: ${LAKE}; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; padding: 5px 11px; border-radius: 4px; }
  .cp-badge.st-closed { background: ${LAKE}; color: #fff; }
  .cp-badge.st-active { background: #2f7d4f; color: #fff; }
  .cp-badge.st-pending { background: ${GOLD}; color: #fff; }
  .cp-cardbody { padding: 22px 24px 24px; }
  .cp-cardbody h3 { font-family: 'Cormorant Garamond',serif; font-size: 24px; font-weight: 600; margin: 0 0 4px; color: ${LAKE}; }
  .cp-price { font-size: 20px; font-weight: 600; color: #26333b; margin-bottom: 16px; }
  .cp-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; padding: 16px 0; border-top: 1px solid #f0ece4; border-bottom: 1px solid #f0ece4; }
  .cp-stats > div { display: flex; flex-direction: column; gap: 3px; }
  .cp-sl { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: #9aa4ab; }
  .cp-sv { font-size: 17px; font-weight: 600; color: #26333b; }
  .cp-notes { font-size: 13.5px; color: #5a6a72; line-height: 1.6; margin: 16px 0 0; }
  .cp-tablecard { background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 10px 30px rgba(52,74,87,.06); border: 1px solid #eee9e1; }
  .cp-tabletitle { font-family: 'Cormorant Garamond',serif; font-size: 30px; font-weight: 500; margin: 0 0 4px; color: ${LAKE}; }
  .cp-tablesub { color: #9aa4ab; font-size: 14px; margin: 0 0 22px; }
  .cp-tablewrap { overflow-x: auto; }
  .cp-table { border-collapse: collapse; width: 100%; font-size: 14px; }
  .cp-table th { background: ${LAKE}; color: #fff; text-align: left; padding: 14px 16px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; white-space: nowrap; }
  .cp-table th:first-child { border-radius: 6px 0 0 6px; }
  .cp-table th:last-child { border-radius: 0 6px 6px 0; }
  .cp-table th.cp-r, .cp-table td.cp-r { text-align: right; }
  .cp-table td { border-bottom: 1px solid #f0ece4; padding: 15px 16px; white-space: nowrap; color: #3a4a52; font-variant-numeric: tabular-nums; }
  .cp-addr { font-weight: 600; color: ${LAKE} !important; }
  .cp-mls { color: #9aa4ab !important; font-size: 13px; }
  .cp-status { font-weight: 600; }
  .cp-status.st-closed { color: ${LAKE}; }
  .cp-status.st-active { color: #2f7d4f; }
  .cp-status.st-pending { color: ${GOLD}; }
  .cp-empty { text-align: center; color: #9aa4ab; padding: 30px; }
  .cp-ctasec { background: ${LAKE}; border-radius: 14px; padding: 44px 30px; text-align: center; margin-top: 44px; color: #fff; }
  .cp-ctasec h2 { font-family: 'Cormorant Garamond',serif; font-size: 30px; font-weight: 500; margin: 0 0 8px; }
  .cp-ctasec p { color: rgba(255,255,255,.82); margin: 0 auto; max-width: 480px; font-size: 15px; }
  .cp-cta-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 22px; }
  .cp-btn { display: inline-block; background: #fff; color: ${LAKE}; text-decoration: none; padding: 14px 26px; border-radius: 7px; font-size: 15px; font-weight: 600; }
  .cp-btn:hover { background: #f0ece4; }
  .cp-btn-ghost { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.6); }
  .cp-btn-ghost:hover { background: rgba(255,255,255,.12); }
  .cp-footer { text-align: center; font-size: 13px; color: #7a8891; padding: 34px 0 0; line-height: 1.8; }
  .cp-footer strong { color: ${LAKE}; }
  .cp-disc { font-size: 11.5px; color: #a8b0b6; }
  @media (max-width: 640px) {
    .cp-hero h1 { font-size: 32px; }
    .cp-sechead h2 { font-size: 26px; }
    .cp-cards { grid-template-columns: 1fr; }
    .cp-tablecard { padding: 18px; }
  }
`;
