'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const COLS = [
  { k: 'mls_number', label: 'MLS #' },
  { k: 'status', label: 'Status' },
  { k: 'sub_type', label: 'Sub Type' },
  { k: 'address', label: 'Address' },
  { k: 'postal_code', label: 'Zip' },
  { k: 'year_built', label: 'Year Built' },
  { k: 'beds', label: 'Beds' },
  { k: 'baths', label: 'Baths' },
  { k: 'living_area', label: 'Living Area' },
  { k: 'lot_size_sqft', label: 'Lot Sqft' },
  { k: 'sold_ppsf', label: 'Sold $/sf', money: true },
  { k: 'close_price', label: 'Close Price', money: true },
  { k: 'close_date', label: 'Close Date' },
  { k: 'orig_list_price', label: 'Orig List', money: true },
  { k: 'price_ppsf', label: '$/sqft', money: true },
  { k: 'days_on_market', label: 'DOM' },
  { k: 'my_notes', label: 'Notes' },
];

const fmtMoney = (v) => {
  if (v == null || v === '') return '';
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n === 0) return v;
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
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

  if (state === 'loading') return <div className="p-wrap p-center"><p className="p-dim">Loading…</p><style>{css}</style></div>;
  if (state === 'error') return (
    <div className="p-wrap p-center">
      <div className="p-card">
        <h1>Report not found</h1>
        <p className="p-dim">This comps report link may be incorrect or no longer available.</p>
        <a className="p-btn" href="tel:8584366585">Call (858) 436-6585</a>
      </div>
      <style>{css}</style>
    </div>
  );

  return (
    <div className="p-wrap">
      <header className="p-top">
        <div className="p-brand">Sell My Homes For Cash</div>
        <div className="p-agent">Sez Sezer · Keller Williams Realty · (858) 436-6585</div>
      </header>

      <section className="p-hero">
        <p className="p-eyebrow">Comparative Market Analysis</p>
        <h1>{report.title || report.subject_address}</h1>
        {report.client_name && <p className="p-sub">Prepared for {report.client_name}</p>}
        <p className="p-subject">Subject property: <strong>{report.subject_address}</strong></p>
        {report.intro && <p className="p-intro">{report.intro}</p>}
      </section>

      <section className="p-tablewrap">
        <table className="p-table">
          <thead>
            <tr>{COLS.map((c) => <th key={c.k}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {comps.length === 0 && <tr><td colSpan={COLS.length} className="p-empty">No comparable properties listed yet.</td></tr>}
            {comps.map((c) => (
              <tr key={c.id}>
                {COLS.map((col) => (
                  <td key={col.k} className={col.money ? 'p-num' : ''}>
                    {col.money ? fmtMoney(c[col.k]) : (c[col.k] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="p-cta">
        <h2>Questions about these comps?</h2>
        <p className="p-dim">I'm happy to walk you through the analysis.</p>
        <div className="p-cta-row">
          <a className="p-btn" href="tel:8584366585">Call (858) 436-6585</a>
          <a className="p-btn p-btn-ghost" href="mailto:sez@carmelvalley.com">Email Sez</a>
        </div>
      </section>

      <footer className="p-footer">
        Sez Sezer · Keller Williams Realty · DRE# 01988197 · San Diego, California<br/>
        Comparable data sourced from public records and MLS; figures are estimates for discussion and not a formal appraisal.
      </footer>

      <style>{css}</style>
    </div>
  );
}

const css = `
  .p-wrap { max-width: 1280px; margin: 0 auto; padding: 0 18px 60px; font-family: 'Jost',system-ui,sans-serif; color: #1c2b33; }
  .p-center { min-height: 80vh; display: flex; align-items: center; justify-content: center; }
  .p-dim { color: #6a7a82; }
  .p-card { background: #fff; border: 1px solid #e6e9ec; border-radius: 14px; padding: 30px; text-align: center; max-width: 420px; }
  .p-card h1 { font-family: 'Cormorant Garamond',serif; font-size: 26px; margin: 0 0 10px; }
  .p-top { display: flex; align-items: center; justify-content: space-between; padding: 18px 0; border-bottom: 1px solid #eef1f3; flex-wrap: wrap; gap: 6px; }
  .p-brand { font-family: 'Cormorant Garamond',serif; font-size: 20px; font-weight: 600; color: #296190; }
  .p-agent { font-size: 13px; color: #6a7a82; }
  .p-hero { padding: 32px 0 22px; }
  .p-eyebrow { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: #296190; font-weight: 600; margin: 0 0 8px; }
  .p-hero h1 { font-family: 'Cormorant Garamond',serif; font-size: 34px; margin: 0 0 6px; }
  .p-sub { font-size: 16px; color: #4a5a62; margin: 0 0 4px; }
  .p-subject { font-size: 15px; color: #4a5a62; margin: 8px 0 0; }
  .p-intro { font-size: 15px; color: #4a5a62; line-height: 1.6; margin: 14px 0 0; max-width: 760px; }
  .p-tablewrap { overflow-x: auto; border: 1px solid #e6e9ec; border-radius: 10px; background: #fff; box-shadow: 0 6px 20px rgba(20,40,60,.04); }
  .p-table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
  .p-table th { background: #296190; color: #fff; text-align: left; padding: 11px 12px; font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; white-space: nowrap; }
  .p-table td { border-bottom: 1px solid #f0f3f5; padding: 11px 12px; white-space: nowrap; }
  .p-table tr:nth-child(even) td { background: #fafcfd; }
  .p-num { text-align: right; font-variant-numeric: tabular-nums; }
  .p-empty { text-align: center; color: #6a7a82; padding: 28px; }
  .p-cta { text-align: center; margin-top: 30px; }
  .p-cta h2 { font-family: 'Cormorant Garamond',serif; font-size: 24px; margin: 0 0 6px; }
  .p-cta-row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 16px; }
  .p-btn { display: inline-block; background: #296190; color: #fff; text-decoration: none; padding: 13px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; }
  .p-btn:hover { background: #21506f; }
  .p-btn-ghost { background: #fff; color: #296190; border: 1px solid #296190; }
  .p-btn-ghost:hover { background: #296190; color: #fff; }
  .p-footer { text-align: center; font-size: 12px; color: #9aa8b0; padding: 28px 0 0; line-height: 1.7; }
`;
