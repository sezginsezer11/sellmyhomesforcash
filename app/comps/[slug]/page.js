'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';

const LAKE = '#344a57';
const GOLD = '#c9a96e';

const toNum = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n !== 0 ? n : null;
};
const fmtFull = (v) => { const n = toNum(v); return n ? '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : ''; };
const fmtNum = (v) => { const n = toNum(v); return n ? n.toLocaleString('en-US') : (v || ''); };
const fmtPpsf = (v) => { if (!v) return ''; const s = String(v); return s.startsWith('$') ? s : '$' + s; };

// Group a status string into a bucket.
const GROUPS = [
  { key: 'active', label: 'Active', match: (s) => s.includes('active') },
  { key: 'pending', label: 'Pending', match: (s) => s.includes('pend') || s.includes('contingent') || s.includes('under contract') },
  { key: 'sold', label: 'Sold', match: (s) => s.includes('close') || s.includes('sold') },
  { key: 'canceled', label: 'Canceled', match: (s) => s.includes('cancel') },
  { key: 'expired', label: 'Expired', match: (s) => s.includes('expir') },
  { key: 'withdrawn', label: 'Withdrawn', match: (s) => s.includes('withdraw') },
];
const groupOf = (status) => {
  const s = (status || '').toLowerCase();
  const g = GROUPS.find((gr) => gr.match(s));
  return g ? g.key : 'other';
};
const statusClass = (s) => {
  const k = groupOf(s);
  return k === 'sold' ? 'st-closed' : k === 'active' ? 'st-active' : k === 'pending' ? 'st-pending' : 'st-other';
};

export default function PublicComps() {
  const { slug } = useParams();
  const [state, setState] = useState('loading');
  const [report, setReport] = useState(null);
  const [comps, setComps] = useState([]);
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState({});

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

  const priceOf = (c) => (groupOf(c.status) === 'sold' ? c.close_price : (c.current_price || c.orig_list_price)) || c.close_price || c.current_price || c.orig_list_price || '';
  const ppsfOf = (c) => (groupOf(c.status) === 'sold' ? (c.sold_ppsf || c.price_ppsf) : c.price_ppsf) || c.sold_ppsf || c.price_ppsf || '';

  // Which groups actually exist, in order, with their comps.
  const grouped = useMemo(() => {
    const out = [];
    for (const g of GROUPS) {
      const rows = comps.filter((c) => groupOf(c.status) === g.key);
      if (rows.length) out.push({ ...g, rows });
    }
    const others = comps.filter((c) => groupOf(c.status) === 'other');
    if (others.length) out.push({ key: 'other', label: 'Other', rows: others });
    return out;
  }, [comps]);

  const statsFor = (rows) => {
    const prices = rows.map(priceOf).map(toNum).filter(Boolean);
    const ppsfs = rows.map(ppsfOf).map(toNum).filter(Boolean);
    const avg = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
    return { avgPrice: avg(prices), avgPpsf: avg(ppsfs), count: rows.length };
  };

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

  const visibleGroups = filter === 'all' ? grouped : grouped.filter((g) => g.key === filter);

  const Card = (c) => {
    const open = !!expanded[c.id];
    return (
      <article className={'cp-card' + (c.starred ? ' cp-star' : '') + (open ? ' cp-open' : '')} key={c.id}
        onClick={() => setExpanded((e) => ({ ...e, [c.id]: !e[c.id] }))}>
        <div className="cp-cardimg" style={(c.photo_override || c.photo_url) ? { backgroundImage: `url(${c.photo_override || c.photo_url})` } : {}}>
          {!(c.photo_override || c.photo_url) && <span className="cp-cardaddr-ph">{c.address}</span>}
          {c.starred && <span className="cp-starbadge" title="Top comparable">★ Top comp</span>}
          {c.status && <span className={'cp-badge ' + statusClass(c.status)}>{c.status}</span>}
        </div>
        <div className="cp-cardbody">
          <h3>{c.address}</h3>
          <div className="cp-price">{fmtFull(priceOf(c))}</div>
          <div className="cp-stats">
            <div><span className="cp-sl">Beds</span><span className="cp-sv">{c.beds || '—'}</span></div>
            <div><span className="cp-sl">Baths</span><span className="cp-sv">{c.baths || '—'}</span></div>
            <div><span className="cp-sl">Sq Ft</span><span className="cp-sv">{fmtNum(c.living_area) || '—'}</span></div>
            <div><span className="cp-sl">$/SF</span><span className="cp-sv">{fmtPpsf(ppsfOf(c)) || '—'}</span></div>
          </div>
          {open && (
            <div className="cp-detail">
              <div className="cp-detailgrid">
                {c.mls_number && <div><span>MLS #</span><b>{c.mls_number}</b></div>}
                {c.year_built && <div><span>Year Built</span><b>{c.year_built}</b></div>}
                {c.lot_size_sqft && <div><span>Lot Sqft</span><b>{fmtNum(c.lot_size_sqft)}</b></div>}
                {c.sub_type && <div><span>Type</span><b>{c.sub_type}</b></div>}
                {c.close_date && <div><span>Close Date</span><b>{c.close_date}</b></div>}
                {c.orig_list_price && <div><span>Orig List</span><b>{fmtFull(c.orig_list_price)}</b></div>}
                {c.days_on_market && <div><span>Days on Market</span><b>{c.days_on_market}</b></div>}
                {c.postal_code && <div><span>Zip</span><b>{c.postal_code}</b></div>}
              </div>
              {c.my_notes && <p className="cp-detailnotes"><strong>Agent notes:</strong> {c.my_notes}</p>}
              {c.public_remarks && <p className="cp-detailremarks">{c.public_remarks}</p>}
            </div>
          )}
          {!open && c.my_notes && <p className="cp-notes">{c.my_notes}</p>}
          <button className="cp-toggle">{open ? 'Show less ▲' : 'View details ▼'}</button>
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

      {/* Filter buttons — only groups that exist */}
      <div className="cp-filters">
        <button className={'cp-fbtn' + (filter === 'all' ? ' on' : '')} onClick={() => setFilter('all')}>All <span>{comps.length}</span></button>
        {grouped.map((g) => (
          <button key={g.key} className={'cp-fbtn' + (filter === g.key ? ' on' : '')} onClick={() => setFilter(g.key)}>
            {g.label} <span>{g.rows.length}</span>
          </button>
        ))}
      </div>

      {/* Grouped sections */}
      {visibleGroups.map((g) => {
        const st = statsFor(g.rows);
        return (
          <section className="cp-group" key={g.key}>
            <div className="cp-grouphead">
              <h2>{g.label}</h2>
              <div className="cp-groupstats">
                <div><span className="cp-gsl">Properties</span><span className="cp-gsv">{st.count}</span></div>
                {st.avgPrice && <div><span className="cp-gsl">Avg {g.key === 'sold' ? 'Sold' : 'List'} Price</span><span className="cp-gsv">{'$' + st.avgPrice.toLocaleString('en-US')}</span></div>}
                {st.avgPpsf && <div><span className="cp-gsl">Avg $/SqFt</span><span className="cp-gsv">{'$' + st.avgPpsf.toLocaleString('en-US')}</span></div>}
              </div>
            </div>
            <div className="cp-cards">
              {g.rows.map((c) => Card(c))}
            </div>
          </section>
        );
      })}

      {/* Comparison table */}
      <section className="cp-section">
        <div className="cp-sechead"><span className="cp-secnum">✦</span><h2>Quick Comparison</h2></div>
        <div className="cp-tablecard">
          <h3 className="cp-tabletitle">Compare All {comps.length} {comps.length === 1 ? 'Property' : 'Properties'}</h3>
          <p className="cp-tablesub">Side-by-side breakdown of key metrics</p>
          <div className="cp-tablewrap">
            <table className="cp-table">
              <thead>
                <tr>
                  <th></th><th>Property</th><th>MLS #</th><th className="cp-r">Price</th>
                  <th className="cp-r">Beds</th><th className="cp-r">Baths</th>
                  <th className="cp-r">Sq Ft</th><th className="cp-r">$/SF</th>
                  <th className="cp-r">Close Date</th><th className="cp-r">DOM</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {comps.length === 0 && <tr><td colSpan={11} className="cp-empty">No comparable properties listed yet.</td></tr>}
                {comps.map((c) => (
                  <tr key={c.id} className={c.starred ? 'cp-trstar' : ''}>
                    <td className="cp-trstarcell">{c.starred ? '★' : ''}</td>
                    <td className="cp-addr">{c.address}</td>
                    <td className="cp-mls">{c.mls_number}</td>
                    <td className="cp-r">{fmtFull(priceOf(c))}</td>
                    <td className="cp-r">{c.beds}</td>
                    <td className="cp-r">{c.baths}</td>
                    <td className="cp-r">{fmtNum(c.living_area)}</td>
                    <td className="cp-r">{fmtPpsf(ppsfOf(c))}</td>
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

const css = `
  .cp-wrap { max-width: 1200px; margin: 0 auto; padding: 0 20px 70px; font-family: 'Jost',system-ui,sans-serif; color: #26333b; background: #faf9f7; }
  .cp-center { min-height: 80vh; display: flex; align-items: center; justify-content: center; }
  .cp-dim { color: #7a8891; }
  .cp-errcard { background: #fff; border: 1px solid #e6e9ec; border-radius: 14px; padding: 32px; text-align: center; max-width: 420px; }
  .cp-errcard h1 { font-family: 'Cormorant Garamond',serif; font-size: 28px; margin: 0 0 10px; }
  .cp-top { display: flex; align-items: center; justify-content: space-between; padding: 22px 0; border-bottom: 1px solid #ece8e1; flex-wrap: wrap; gap: 6px; }
  .cp-brand { font-family: 'Cormorant Garamond',serif; font-size: 21px; font-weight: 600; color: ${LAKE}; letter-spacing: .02em; }
  .cp-agent { font-size: 13px; color: #7a8891; }
  .cp-hero { padding: 44px 0 26px; text-align: center; }
  .cp-eyebrow { font-size: 12px; letter-spacing: .22em; text-transform: uppercase; color: ${GOLD}; font-weight: 600; margin: 0 0 12px; }
  .cp-hero h1 { font-family: 'Cormorant Garamond',serif; font-size: 44px; font-weight: 600; margin: 0 0 8px; color: ${LAKE}; line-height: 1.1; }
  .cp-sub { font-size: 17px; color: #4a5a62; margin: 0 0 6px; font-style: italic; }
  .cp-subject { font-size: 15px; color: #4a5a62; margin: 10px 0 0; }
  .cp-intro { font-size: 15.5px; color: #4a5a62; line-height: 1.7; margin: 18px auto 0; max-width: 720px; }
  .cp-filters { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin: 18px 0 8px; }
  .cp-fbtn { background: #fff; border: 1px solid #e0dbd2; color: ${LAKE}; border-radius: 30px; padding: 9px 18px; font-family: 'Jost',sans-serif; font-size: 14px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; }
  .cp-fbtn span { background: #f0ece4; color: #7a8891; font-size: 12px; padding: 1px 8px; border-radius: 10px; }
  .cp-fbtn.on { background: ${LAKE}; color: #fff; border-color: ${LAKE}; }
  .cp-fbtn.on span { background: rgba(255,255,255,.22); color: #fff; }
  .cp-group { margin-top: 34px; }
  .cp-grouphead { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; border-bottom: 2px solid ${GOLD}; padding-bottom: 12px; }
  .cp-grouphead h2 { font-family: 'Cormorant Garamond',serif; font-size: 30px; font-weight: 500; margin: 0; color: ${LAKE}; }
  .cp-groupstats { display: flex; gap: 26px; }
  .cp-groupstats > div { display: flex; flex-direction: column; text-align: right; }
  .cp-gsl { font-size: 10.5px; letter-spacing: .07em; text-transform: uppercase; color: #9aa4ab; }
  .cp-gsv { font-size: 18px; font-weight: 600; color: ${LAKE}; }
  .cp-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .cp-card { background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 10px 30px rgba(52,74,87,.08); border: 1px solid #eee9e1; cursor: pointer; transition: box-shadow .15s, transform .15s; }
  .cp-card:hover { box-shadow: 0 14px 40px rgba(52,74,87,.14); transform: translateY(-2px); }
  .cp-card.cp-star { border: 2px solid ${GOLD}; }
  .cp-cardimg { position: relative; height: 210px; background: ${LAKE}; background-size: cover; background-position: center; display: flex; align-items: center; justify-content: center; }
  .cp-cardaddr-ph { font-family: 'Cormorant Garamond',serif; font-size: 23px; color: rgba(255,255,255,.55); text-align: center; padding: 0 20px; }
  .cp-badge { position: absolute; top: 12px; left: 12px; background: rgba(255,255,255,.95); color: ${LAKE}; font-size: 10.5px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; padding: 5px 10px; border-radius: 4px; }
  .cp-badge.st-closed { background: ${LAKE}; color: #fff; }
  .cp-badge.st-active { background: #2f7d4f; color: #fff; }
  .cp-badge.st-pending { background: ${GOLD}; color: #fff; }
  .cp-starbadge { position: absolute; top: 12px; right: 12px; background: ${GOLD}; color: #fff; font-size: 10.5px; font-weight: 600; letter-spacing: .04em; padding: 5px 10px; border-radius: 4px; }
  .cp-cardbody { padding: 20px 22px 22px; }
  .cp-cardbody h3 { font-family: 'Cormorant Garamond',serif; font-size: 22px; font-weight: 600; margin: 0 0 4px; color: ${LAKE}; }
  .cp-price { font-size: 19px; font-weight: 600; color: #26333b; margin-bottom: 14px; }
  .cp-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 14px 0; border-top: 1px solid #f0ece4; border-bottom: 1px solid #f0ece4; }
  .cp-stats > div { display: flex; flex-direction: column; gap: 3px; }
  .cp-sl { font-size: 10px; letter-spacing: .07em; text-transform: uppercase; color: #9aa4ab; }
  .cp-sv { font-size: 16px; font-weight: 600; color: #26333b; }
  .cp-notes { font-size: 13px; color: #5a6a72; line-height: 1.55; margin: 14px 0 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .cp-detail { margin-top: 14px; }
  .cp-detailgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
  .cp-detailgrid > div { display: flex; justify-content: space-between; font-size: 13px; border-bottom: 1px solid #f4f0e9; padding: 4px 0; }
  .cp-detailgrid span { color: #9aa4ab; }
  .cp-detailgrid b { color: #26333b; font-weight: 600; }
  .cp-detailnotes { font-size: 13.5px; color: #3a4a52; line-height: 1.6; margin: 14px 0 0; }
  .cp-detailremarks { font-size: 13px; color: #5a6a72; line-height: 1.65; margin: 12px 0 0; }
  .cp-toggle { background: none; border: 0; color: ${GOLD}; font-family: 'Jost',sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; margin-top: 14px; padding: 0; }
  .cp-section { margin-top: 44px; }
  .cp-sechead { display: flex; align-items: center; gap: 16px; margin-bottom: 22px; }
  .cp-secnum { width: 44px; height: 44px; border: 1.5px solid ${GOLD}; border-radius: 50%; color: ${GOLD}; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
  .cp-sechead h2 { font-family: 'Cormorant Garamond',serif; font-size: 32px; font-weight: 500; margin: 0; color: ${LAKE}; }
  .cp-sechead::after { content: ''; flex: 1; height: 1px; background: #e6e2da; }
  .cp-tablecard { background: #fff; border-radius: 12px; padding: 30px; box-shadow: 0 10px 30px rgba(52,74,87,.06); border: 1px solid #eee9e1; }
  .cp-tabletitle { font-family: 'Cormorant Garamond',serif; font-size: 28px; font-weight: 500; margin: 0 0 4px; color: ${LAKE}; }
  .cp-tablesub { color: #9aa4ab; font-size: 14px; margin: 0 0 20px; }
  .cp-tablewrap { overflow-x: auto; }
  .cp-table { border-collapse: collapse; width: 100%; font-size: 14px; }
  .cp-table th { background: ${LAKE}; color: #fff; text-align: left; padding: 13px 14px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; white-space: nowrap; }
  .cp-table th.cp-r, .cp-table td.cp-r { text-align: right; }
  .cp-table td { border-bottom: 1px solid #f0ece4; padding: 14px; white-space: nowrap; color: #3a4a52; font-variant-numeric: tabular-nums; }
  .cp-trstar { background: #fffdf4; }
  .cp-trstarcell { color: ${GOLD}; text-align: center; padding: 0 !important; width: 24px; }
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
  @media (max-width: 920px) { .cp-cards { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 640px) {
    .cp-hero h1 { font-size: 32px; }
    .cp-cards { grid-template-columns: 1fr; }
    .cp-grouphead { flex-direction: column; align-items: flex-start; }
    .cp-groupstats { gap: 18px; }
    .cp-groupstats > div { text-align: left; }
    .cp-tablecard { padding: 16px; }
  }
`;
