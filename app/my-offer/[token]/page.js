'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const STEPS = ['Reviewing', 'Offer Prepared', 'Offer Sent', 'In Escrow', 'Closed'];

const money = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
};

export default function MyOfferPage() {
  const { token } = useParams();
  const [state, setState] = useState('loading'); // loading | ok | error
  const [d, setD] = useState({});

  useEffect(() => {
    let alive = true;
    fetch('/api/lead?token=' + encodeURIComponent(token))
      .then(r => r.json())
      .then(res => {
        if (!alive) return;
        if (res.ok && res.data) { setD(res.data); setState('ok'); }
        else setState('error');
      })
      .catch(() => alive && setState('error'));
    return () => { alive = false; };
  }, [token]);

  if (state === 'loading') {
    return <div className="mo-wrap mo-center"><p className="mo-dim">Loading your offer…</p><style>{css}</style></div>;
  }

  if (state === 'error') {
    return (
      <div className="mo-wrap mo-center">
        <div className="mo-card mo-narrow">
          <h1>We couldn't find this offer</h1>
          <p className="mo-dim">This link may be incorrect or expired. Please use the private link we sent you, or call us and we'll resend it.</p>
          <a className="mo-btn" href="tel:8584366585">Call (858) 436-6585</a>
        </div>
        <style>{css}</style>
      </div>
    );
  }

  const status = d.client_status || 'Reviewing';
  const stepIdx = Math.max(0, STEPS.indexOf(status));
  const offer = money(d.offer_amount);
  const closing = money(d.est_closing_costs);
  const net = money(d.estimated_net);
  const propBits = [
    d.property_type, d.beds && d.beds + ' bd', d.baths && d.baths + ' ba',
    d.sqft && Number(d.sqft).toLocaleString() + ' sqft', d.year_built && 'Built ' + d.year_built,
  ].filter(Boolean);

  return (
    <div className="mo-wrap">
      <header className="mo-top">
        <div className="mo-brand">Sell My Homes For Cash</div>
        <div className="mo-agent">Sez Sezer · (858) 436-6585</div>
      </header>

      <section className="mo-hero">
        <p className="mo-eyebrow">Your cash offer status</p>
        <h1>{d.name ? 'Hi ' + d.name.split(' ')[0] + ',' : 'Welcome'}</h1>
        <p className="mo-sub">{d.address || 'Your property'}</p>
        {propBits.length > 0 && <div className="mo-chips">{propBits.map((b, i) => <span key={i}>{b}</span>)}</div>}
      </section>

      {/* Progress tracker */}
      <section className="mo-card">
        <h2>Where things stand</h2>
        <div className="mo-track">
          {STEPS.map((s, i) => {
            const done = i < stepIdx, here = i === stepIdx;
            return (
              <div key={s} className={'mo-step' + (done ? ' done' : '') + (here ? ' here' : '')}>
                <div className="mo-dot">{done ? '✓' : i + 1}</div>
                <div className="mo-step-label">{s}</div>
              </div>
            );
          })}
        </div>
        <p className="mo-status-line">
          Current status: <strong>{status}</strong>
        </p>
      </section>

      {/* Offer */}
      <section className="mo-card mo-offer">
        <h2>Your offer</h2>
        {offer ? (
          <>
            <div className="mo-offer-amount">{offer}</div>
            <p className="mo-offer-tag">Cash offer for your home</p>
            {d.offer_details && <p className="mo-offer-details">{d.offer_details}</p>}
          </>
        ) : (
          <p className="mo-dim">Your offer is being prepared. We'll update this page as soon as it's ready — usually within 24–48 hours.</p>
        )}
      </section>

      {/* Costs */}
      <section className="mo-card">
        <h2>Your estimated costs</h2>
        <div className="mo-rows">
          <div className="mo-row"><span>Agent commission</span><span className="mo-free">$0 — covered</span></div>
          <div className="mo-row"><span>Closing costs{closing ? ' (est. ' + closing + ')' : ''}</span><span className="mo-free">$0 — covered</span></div>
          <div className="mo-row"><span>Repairs &amp; cleanup</span><span className="mo-free">$0 — sell as-is</span></div>
          <div className="mo-row mo-row-total"><span>Your total out-of-pocket</span><span className="mo-free">$0</span></div>
        </div>
        <p className="mo-note">With a cash sale through our investor network, the buyer covers closing costs and commissions. You sell as-is — no repairs, no cleaning, no fees.</p>
      </section>

      {/* Net proceeds */}
      {net && (
        <section className="mo-card mo-net">
          <p className="mo-net-label">Your estimated net proceeds</p>
          <div className="mo-net-amount">{net}</div>
          <p className="mo-note">Estimated amount you'd walk away with at closing. Final figure confirmed in your closing statement.</p>
        </section>
      )}

      <section className="mo-card mo-cta">
        <h2>Questions about your offer?</h2>
        <p className="mo-dim">I'm here to walk you through every step.</p>
        <div className="mo-cta-row">
          <a className="mo-btn" href="tel:8584366585">Call (858) 436-6585</a>
          <a className="mo-btn mo-btn-ghost" href="mailto:sez@carmelvalley.com">Email Sez</a>
        </div>
      </section>

      <footer className="mo-footer">
        Sez Sezer · Keller Williams Realty · DRE# 01988197 · San Diego, California
      </footer>

      <style>{css}</style>
    </div>
  );
}

const css = `
  .mo-wrap { max-width: 720px; margin: 0 auto; padding: 0 18px 60px; font-family: 'Jost',system-ui,sans-serif; color: #1c2b33; }
  .mo-center { min-height: 80vh; display: flex; align-items: center; justify-content: center; }
  .mo-dim { color: #6a7a82; }
  .mo-top { display: flex; align-items: center; justify-content: space-between; padding: 18px 0; border-bottom: 1px solid #eef1f3; flex-wrap: wrap; gap: 6px; }
  .mo-brand { font-family: 'Cormorant Garamond',serif; font-size: 20px; font-weight: 600; color: #296190; }
  .mo-agent { font-size: 13px; color: #6a7a82; }
  .mo-hero { padding: 34px 0 20px; }
  .mo-eyebrow { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: #296190; font-weight: 600; margin: 0 0 8px; }
  .mo-hero h1 { font-family: 'Cormorant Garamond',serif; font-size: 36px; margin: 0 0 6px; }
  .mo-sub { font-size: 16px; color: #4a5a62; margin: 0; }
  .mo-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
  .mo-chips span { background: #f5f7f9; color: #4a5a62; font-size: 13px; padding: 4px 11px; border-radius: 14px; }
  .mo-card { background: #fff; border: 1px solid #e6e9ec; border-radius: 14px; padding: 24px; margin-bottom: 16px; box-shadow: 0 6px 20px rgba(20,40,60,.04); }
  .mo-narrow { max-width: 420px; text-align: center; }
  .mo-card h1 { font-family: 'Cormorant Garamond',serif; font-size: 26px; margin: 0 0 10px; }
  .mo-card h2 { font-family: 'Cormorant Garamond',serif; font-size: 22px; margin: 0 0 18px; }
  .mo-track { display: flex; justify-content: space-between; position: relative; gap: 4px; }
  .mo-track::before { content: ''; position: absolute; top: 15px; left: 8%; right: 8%; height: 2px; background: #e6e9ec; z-index: 0; }
  .mo-step { position: relative; z-index: 1; text-align: center; flex: 1; }
  .mo-dot { width: 32px; height: 32px; border-radius: 50%; background: #fff; border: 2px solid #d5dbdf; color: #9aa8b0; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; margin: 0 auto 8px; }
  .mo-step.done .mo-dot { background: #2f9e5f; border-color: #2f9e5f; color: #fff; }
  .mo-step.here .mo-dot { background: #296190; border-color: #296190; color: #fff; box-shadow: 0 0 0 4px rgba(41,97,144,.15); }
  .mo-step-label { font-size: 11.5px; color: #6a7a82; line-height: 1.3; }
  .mo-step.done .mo-step-label, .mo-step.here .mo-step-label { color: #1c2b33; font-weight: 600; }
  .mo-status-line { margin: 20px 0 0; font-size: 15px; color: #4a5a62; text-align: center; }
  .mo-offer { text-align: center; }
  .mo-offer-amount { font-family: 'Cormorant Garamond',serif; font-size: 52px; font-weight: 600; color: #1c5b34; line-height: 1.1; }
  .mo-offer-tag { color: #6a7a82; font-size: 14px; margin: 4px 0 0; }
  .mo-offer-details { margin: 16px auto 0; max-width: 480px; font-size: 14.5px; color: #4a5a62; line-height: 1.6; }
  .mo-rows { display: flex; flex-direction: column; gap: 2px; }
  .mo-row { display: flex; justify-content: space-between; padding: 11px 0; border-bottom: 1px solid #f0f3f5; font-size: 15px; }
  .mo-row span:first-child { color: #4a5a62; }
  .mo-free { color: #1c5b34; font-weight: 600; }
  .mo-row-total { border-bottom: 0; border-top: 2px solid #e6e9ec; margin-top: 4px; padding-top: 14px; font-weight: 600; font-size: 16px; }
  .mo-row-total span:first-child { color: #1c2b33; }
  .mo-note { font-size: 13px; color: #6a7a82; line-height: 1.6; margin: 16px 0 0; }
  .mo-net { background: #eef7f1; border-color: #bcdcc8; text-align: center; }
  .mo-net-label { font-size: 13px; letter-spacing: .1em; text-transform: uppercase; color: #1c5b34; font-weight: 600; margin: 0 0 6px; }
  .mo-net-amount { font-family: 'Cormorant Garamond',serif; font-size: 46px; font-weight: 600; color: #1c5b34; line-height: 1.1; }
  .mo-cta { text-align: center; }
  .mo-cta-row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 16px; }
  .mo-btn { display: inline-block; background: #296190; color: #fff; text-decoration: none; padding: 13px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; }
  .mo-btn:hover { background: #21506f; }
  .mo-btn-ghost { background: #fff; color: #296190; border: 1px solid #296190; }
  .mo-btn-ghost:hover { background: #296190; color: #fff; }
  .mo-footer { text-align: center; font-size: 12px; color: #9aa8b0; padding: 24px 0 0; }
  @media (max-width: 520px) {
    .mo-hero h1 { font-size: 30px; }
    .mo-offer-amount { font-size: 42px; }
    .mo-step-label { font-size: 10px; }
  }
`;
