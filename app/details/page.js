'use client';

import { useState, useEffect, Suspense } from 'react';

const ISSUE_OPTIONS = [
  'Roof', 'Foundation', 'Plumbing', 'Electrical', 'HVAC',
  'Water damage / mold', 'Fire damage', 'Termites / pests',
];

function DetailsInner() {
  const [id, setId] = useState('');
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | sending | done | error
  const [errMsg, setErrMsg] = useState('');
  const [f, setF] = useState({
    property_type: '', beds: '', baths: '', sqft: '', year_built: '',
    condition_detail: '', recent_updates: '',
    occupancy: '', lease_status: '', reason_selling: '',
    mortgage_status: '', foreclosure: '', liens_taxes: '', probate: '',
    best_time: '', contact_pref: '', details_notes: '',
  });
  const [issues, setIssues] = useState([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get('id') || '';
    setId(pid);
    setReady(true);
  }, []);

  const up = (e) => setF((s) => ({ ...s, [e.target.name]: e.target.value }));
  const toggleIssue = (val) =>
    setIssues((cur) => cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val]);

  const save = async (e) => {
    if (e) e.preventDefault();
    setStatus('sending'); setErrMsg('');
    try {
      const res = await fetch('/api/lead', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...f, major_issues: issues.join(', ') }),
      });
      const data = await res.json();
      if (data.ok) setStatus('done');
      else { setStatus('error'); setErrMsg(data.error || 'Please try again.'); }
    } catch {
      setStatus('error'); setErrMsg('Network error. Please try again.');
    }
  };

  if (!ready) return null;

  // Missing/invalid id — still thank them; the lead itself was already saved.
  if (!id) {
    return (
      <div className="d-wrap"><div className="d-card d-done">
        <h1>Thank you — your request is in.</h1>
        <p>We&rsquo;ll be in touch shortly to talk through your home and next steps.</p>
        <a className="d-btn" href="/">Return home</a>
      </div></div>
    );
  }

  if (status === 'done') {
    return (
      <div className="d-wrap"><div className="d-card d-done">
        <h1>All set — thank you!</h1>
        <p>Your details are saved. We&rsquo;ll review your home and reach out shortly
        with next steps toward your competing cash offers.</p>
        <a className="d-btn" href="/">Return home</a>
      </div></div>
    );
  }

  return (
    <div className="d-wrap">
      <div className="d-card">
        <span className="d-eyebrow">Step 2 of 2 — optional</span>
        <h1>Tell us a bit more about your home</h1>
        <p className="d-sub">
          Your request is already submitted — this just helps us and our buyers
          prepare a stronger offer, so there&rsquo;s less to cover on our call.
          <strong> Every question is optional</strong> — skip anything you&rsquo;d
          rather discuss later.
        </p>

        <form onSubmit={save}>
          <h2 className="d-h2">Property</h2>
          <div className="d-grid">
            <div className="d-field">
              <label>Property type</label>
              <select name="property_type" value={f.property_type} onChange={up}>
                <option value="">Select…</option>
                <option>Single-family home</option>
                <option>Condo</option>
                <option>Townhome</option>
                <option>Multi-unit</option>
                <option>Mobile / manufactured</option>
                <option>Other</option>
              </select>
            </div>
            <div className="d-field">
              <label>Year built (approx.)</label>
              <input name="year_built" value={f.year_built} onChange={up} inputMode="numeric" />
            </div>
            <div className="d-field">
              <label>Bedrooms</label>
              <input name="beds" value={f.beds} onChange={up} inputMode="numeric" />
            </div>
            <div className="d-field">
              <label>Bathrooms</label>
              <input name="baths" value={f.baths} onChange={up} inputMode="numeric" />
            </div>
            <div className="d-field">
              <label>Approx. square footage</label>
              <input name="sqft" value={f.sqft} onChange={up} inputMode="numeric" />
            </div>
          </div>

          <h2 className="d-h2">Condition</h2>
          <div className="d-field">
            <label>Overall condition</label>
            <select name="condition_detail" value={f.condition_detail} onChange={up}>
              <option value="">Select…</option>
              <option>Move-in ready</option>
              <option>Needs minor work</option>
              <option>Needs major work</option>
              <option>Severe damage / not livable</option>
            </select>
          </div>
          <div className="d-field">
            <label>Any known issues? (select any that apply)</label>
            <div className="d-chips">
              {ISSUE_OPTIONS.map((opt) => (
                <button type="button" key={opt}
                  className={'d-chip' + (issues.includes(opt) ? ' d-chip-on' : '')}
                  onClick={() => toggleIssue(opt)}>{opt}</button>
              ))}
            </div>
          </div>
          <div className="d-field">
            <label>Any recent updates or renovations?</label>
            <input name="recent_updates" value={f.recent_updates} onChange={up}
              placeholder="e.g. new roof 2022, kitchen remodel" />
          </div>

          <h2 className="d-h2">Situation &amp; timing</h2>
          <div className="d-grid">
            <div className="d-field">
              <label>Is the property occupied?</label>
              <select name="occupancy" value={f.occupancy} onChange={up}>
                <option value="">Select…</option>
                <option>Owner-occupied</option>
                <option>Tenant-occupied</option>
                <option>Vacant</option>
              </select>
            </div>
            <div className="d-field">
              <label>If tenant-occupied, lease status</label>
              <input name="lease_status" value={f.lease_status} onChange={up}
                placeholder="e.g. month-to-month, lease ends June" />
            </div>
            <div className="d-field d-full">
              <label>Reason for selling</label>
              <select name="reason_selling" value={f.reason_selling} onChange={up}>
                <option value="">Select…</option>
                <option>Relocating / moving</option>
                <option>Inherited / probate</option>
                <option>Facing foreclosure</option>
                <option>Tired of being a landlord</option>
                <option>Divorce</option>
                <option>Downsizing</option>
                <option>Financial reasons</option>
                <option>Property needs too much work</option>
                <option>Other</option>
              </select>
            </div>
          </div>

          <h2 className="d-h2">Financial &amp; legal <span className="d-optional">— all optional</span></h2>
          <p className="d-note">These help us tailor offers, but you&rsquo;re welcome to
          skip them and discuss on the call instead.</p>
          <div className="d-grid">
            <div className="d-field">
              <label>Approx. mortgage balance</label>
              <input name="mortgage_status" value={f.mortgage_status} onChange={up}
                placeholder="e.g. paid off, ~$300k" />
            </div>
            <div className="d-field">
              <label>Behind on payments / facing foreclosure?</label>
              <select name="foreclosure" value={f.foreclosure} onChange={up}>
                <option value="">Select…</option>
                <option>No</option>
                <option>Behind on payments</option>
                <option>In foreclosure</option>
                <option>Prefer not to say</option>
              </select>
            </div>
            <div className="d-field">
              <label>Any liens or back taxes?</label>
              <select name="liens_taxes" value={f.liens_taxes} onChange={up}>
                <option value="">Select…</option>
                <option>No</option>
                <option>Yes</option>
                <option>Not sure</option>
                <option>Prefer not to say</option>
              </select>
            </div>
            <div className="d-field">
              <label>Is the property in probate?</label>
              <select name="probate" value={f.probate} onChange={up}>
                <option value="">Select…</option>
                <option>No</option>
                <option>Yes</option>
                <option>Not sure</option>
              </select>
            </div>
          </div>

          <h2 className="d-h2">How to reach you</h2>
          <div className="d-grid">
            <div className="d-field">
              <label>Best time to reach you</label>
              <select name="best_time" value={f.best_time} onChange={up}>
                <option value="">Select…</option>
                <option>Morning</option>
                <option>Afternoon</option>
                <option>Evening</option>
                <option>Anytime</option>
              </select>
            </div>
            <div className="d-field">
              <label>Preferred contact method</label>
              <select name="contact_pref" value={f.contact_pref} onChange={up}>
                <option value="">Select…</option>
                <option>Call</option>
                <option>Text</option>
                <option>Email</option>
              </select>
            </div>
          </div>
          <div className="d-field">
            <label>Anything else we should know?</label>
            <textarea name="details_notes" value={f.details_notes} onChange={up} rows={3} />
          </div>

          {status === 'error' && <p className="d-err" role="alert">{errMsg}</p>}

          <div className="d-actions">
            <button type="submit" className="d-btn" disabled={status === 'sending'}>
              {status === 'sending' ? 'Saving…' : 'Save my details'}
            </button>
            <a className="d-skip" href="/">Skip for now</a>
          </div>
        </form>
      </div>

      <style>{`
        .d-wrap { min-height: 100vh; background: #f5f7f9; padding: 40px 16px; font-family: 'Jost', system-ui, sans-serif; color: #1c2b33; }
        .d-card { max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #e6e9ec; border-top: 4px solid #296190; border-radius: 12px; padding: 32px; box-shadow: 0 12px 32px rgba(20,40,60,.08); }
        .d-eyebrow { display: inline-block; text-transform: uppercase; letter-spacing: 2px; font-size: 11px; font-weight: 600; color: #296190; margin-bottom: 10px; }
        .d-card h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 30px; line-height: 1.2; margin: 0 0 10px; color: #1c2b33; }
        .d-sub { color: #4a5a62; font-size: 15.5px; line-height: 1.7; margin: 0 0 8px; }
        .d-h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; color: #1c2b33; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #eef1f3; }
        .d-optional { font-family: 'Jost', sans-serif; font-size: 13px; color: #6a7a82; font-weight: 400; }
        .d-note { font-size: 13.5px; color: #6a7a82; margin: -6px 0 12px; }
        .d-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .d-field { margin-bottom: 14px; }
        .d-full { grid-column: 1 / -1; }
        .d-field label { display: block; font-size: 13px; font-weight: 500; color: #4a5a62; margin-bottom: 5px; }
        .d-field input, .d-field select, .d-field textarea { width: 100%; padding: 11px 12px; border: 1px solid #d5dbdf; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 15px; color: #1c2b33; background: #fff; box-sizing: border-box; }
        .d-field input:focus, .d-field select:focus, .d-field textarea:focus { outline: none; border-color: #296190; box-shadow: 0 0 0 3px rgba(41,97,144,.18); }
        .d-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .d-chip { padding: 8px 14px; border: 1px solid #d5dbdf; border-radius: 20px; background: #fff; font-family: 'Jost', sans-serif; font-size: 14px; color: #4a5a62; cursor: pointer; transition: all .15s; }
        .d-chip-on { background: #296190; border-color: #296190; color: #fff; }
        .d-actions { display: flex; align-items: center; gap: 18px; margin-top: 22px; }
        .d-btn { display: inline-block; padding: 14px 26px; background: #296190; color: #fff; border: 0; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 16px; font-weight: 600; cursor: pointer; text-decoration: none; transition: background .2s; }
        .d-btn:hover { background: #21506f; }
        .d-btn:disabled { opacity: .6; cursor: default; }
        .d-skip { color: #6a7a82; font-size: 15px; text-decoration: underline; text-underline-offset: 3px; }
        .d-skip:hover { color: #296190; }
        .d-err { background: #fbeaea; color: #8a2020; padding: 10px 12px; border-radius: 6px; font-size: 14px; margin: 12px 0 0; }
        .d-done { text-align: center; }
        .d-done h1 { margin-bottom: 12px; }
        .d-done p { color: #4a5a62; font-size: 16px; line-height: 1.7; margin: 0 auto 22px; max-width: 460px; }
        @media (max-width: 620px) { .d-grid { grid-template-columns: 1fr; } .d-card { padding: 22px; } }
      `}</style>
    </div>
  );
}

export default function DetailsPage() {
  return (
    <Suspense fallback={null}>
      <DetailsInner />
    </Suspense>
  );
}
