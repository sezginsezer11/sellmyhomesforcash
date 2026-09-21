'use client';

import { useState, useEffect, useRef, Suspense } from 'react';

const ISSUE_OPTIONS = [
  'Roof', 'Foundation', 'Plumbing', 'Electrical', 'HVAC',
  'Water damage / mold', 'Fire damage', 'Termites / pests',
];

const STEPS = ['Property', 'Condition', 'Situation', 'Financial', 'Contact'];

function DetailsInner() {
  const [id, setId] = useState('');
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState('idle'); // idle | saving | done | error
  const [errMsg, setErrMsg] = useState('');
  const [f, setF] = useState({
    property_type: '', beds: '', baths: '', sqft: '', year_built: '',
    condition_detail: '', recent_updates: '',
    occupancy: '', lease_status: '', reason_selling: '',
    mortgage_status: '', foreclosure: '', liens_taxes: '', probate: '',
    best_time: '', contact_pref: '', details_notes: '',
  });
  const [issues, setIssues] = useState([]);
  const saveTimer = useRef(null);

  // Load id + prefill saved (non-sensitive) answers on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get('id') || '';
    setId(pid);
    if (pid) {
      fetch('/api/lead?id=' + encodeURIComponent(pid))
        .then((r) => r.json())
        .then((res) => {
          if (res.ok && res.data) {
            const d = res.data;
            setF((s) => {
              const next = { ...s };
              for (const k of Object.keys(s)) {
                if (d[k] != null && d[k] !== '') next[k] = d[k];
              }
              return next;
            });
            if (d.major_issues) setIssues(d.major_issues.split(', ').filter(Boolean));
          }
          setReady(true);
        })
        .catch(() => setReady(true));
    } else {
      setReady(true);
    }
  }, []);

  // Auto-save (debounced) whenever answers change and we have an id.
  const autosave = (nextF, nextIssues) => {
    if (!id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch('/api/lead', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id, ...nextF,
          major_issues: (nextIssues ?? issues).join(', '),
        }),
      }).catch(() => {});
    }, 800);
  };

  const up = (e) => {
    const nf = { ...f, [e.target.name]: e.target.value };
    setF(nf);
    autosave(nf, issues);
  };
  const toggleIssue = (val) => {
    const ni = issues.includes(val) ? issues.filter((x) => x !== val) : [...issues, val];
    setIssues(ni);
    autosave(f, ni);
  };

  // Save on step change too (so nothing is lost between steps).
  const goNext = () => { autosave(f, issues); setStep((s) => Math.min(s + 1, STEPS.length - 1)); window.scrollTo(0, 0); };
  const goBack = () => { setStep((s) => Math.max(s - 1, 0)); window.scrollTo(0, 0); };

  // Prevent Enter from submitting; allow newlines in textarea.
  const noEnterSubmit = (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  };

  const finalize = async () => {
    if (!id) { setStatus('done'); return; }
    setStatus('saving'); setErrMsg('');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      const res = await fetch('/api/lead', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...f, major_issues: issues.join(', '), finalize: true }),
      });
      const data = await res.json();
      if (data.ok) setStatus('done');
      else { setStatus('error'); setErrMsg(data.error || 'Please try again.'); }
    } catch {
      setStatus('error'); setErrMsg('Network error. Please try again.');
    }
  };

  if (!ready) return null;

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

  const pct = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <div className="d-wrap">
      <div className="d-card">
        <span className="d-eyebrow">Step {step + 1} of {STEPS.length} — optional</span>
        <h1>Tell us a bit more about your home</h1>
        <p className="d-sub">
          Your request is already submitted — this just helps us prepare a stronger
          offer. <strong>Everything is optional</strong>, saves as you go, and you
          can skip anything.
        </p>

        <div className="d-progress"><div className="d-progress-bar" style={{ width: pct + '%' }} /></div>
        <div className="d-steplabel">{STEPS[step]}</div>

        {/* onKeyDown guard stops accidental Enter submits across the whole form */}
        <div onKeyDown={noEnterSubmit}>

          {step === 0 && (
            <div className="d-stepbody">
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
                <div className="d-field d-full">
                  <label>Approx. square footage</label>
                  <input name="sqft" value={f.sqft} onChange={up} inputMode="numeric" />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="d-stepbody">
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
            </div>
          )}

          {step === 2 && (
            <div className="d-stepbody">
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
                    placeholder="e.g. month-to-month" />
                </div>
                <div className="d-field d-full">
                  <label>Reason for selling</label>
                  <select name="reason_selling" value={f.reason_selling} onChange={up}>
                    <option value="">Select…</option>
                    <option>I want to cash out</option>
                    <option>I want to move to another home</option>
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
            </div>
          )}

          {step === 3 && (
            <div className="d-stepbody">
              <p className="d-note">These help us tailor offers, but you&rsquo;re welcome
              to skip them and discuss on the call instead.</p>
              <div className="d-grid">
                <div className="d-field">
                  <label>Approx. mortgage balance</label>
                  <input name="mortgage_status" value={f.mortgage_status} onChange={up}
                    placeholder="e.g. paid off, ~$300k" />
                </div>
                <div className="d-field">
                  <label>Behind on payments / foreclosure?</label>
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
            </div>
          )}

          {step === 4 && (
            <div className="d-stepbody">
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
            </div>
          )}

        </div>

        {status === 'error' && <p className="d-err" role="alert">{errMsg}</p>}

        <div className="d-actions">
          {step > 0 && <button type="button" className="d-back" onClick={goBack}>Back</button>}
          <div className="d-actions-right">
            {step < STEPS.length - 1 && (
              <>
                <button type="button" className="d-skiplink" onClick={goNext}>Skip</button>
                <button type="button" className="d-btn" onClick={goNext}>Next</button>
              </>
            )}
            {step === STEPS.length - 1 && (
              <button type="button" className="d-btn" onClick={finalize} disabled={status === 'saving'}>
                {status === 'saving' ? 'Saving…' : 'Save my details'}
              </button>
            )}
          </div>
        </div>

        <div className="d-skiprow">
          <a className="d-skip" href="/">Skip for now</a>
          <span className="d-autosave">Your answers save automatically</span>
        </div>
      </div>

      <style>{`
        .d-wrap { min-height: 100vh; background: #f5f7f9; padding: 40px 16px; font-family: 'Jost', system-ui, sans-serif; color: #1c2b33; }
        .d-card { max-width: 640px; margin: 0 auto; background: #fff; border: 1px solid #e6e9ec; border-top: 4px solid #296190; border-radius: 12px; padding: 32px; box-shadow: 0 12px 32px rgba(20,40,60,.08); }
        .d-eyebrow { display: inline-block; text-transform: uppercase; letter-spacing: 2px; font-size: 11px; font-weight: 600; color: #296190; margin-bottom: 10px; }
        .d-card h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 28px; line-height: 1.2; margin: 0 0 10px; color: #1c2b33; }
        .d-sub { color: #4a5a62; font-size: 15px; line-height: 1.7; margin: 0 0 18px; }
        .d-progress { height: 6px; background: #e6e9ec; border-radius: 4px; overflow: hidden; margin-bottom: 8px; }
        .d-progress-bar { height: 100%; background: #296190; border-radius: 4px; transition: width .3s ease; }
        .d-steplabel { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; color: #1c2b33; margin: 10px 0 16px; }
        .d-stepbody { min-height: 180px; }
        .d-note { font-size: 13.5px; color: #6a7a82; margin: 0 0 14px; }
        .d-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .d-field { margin-bottom: 14px; }
        .d-full { grid-column: 1 / -1; }
        .d-field label { display: block; font-size: 13px; font-weight: 500; color: #4a5a62; margin-bottom: 5px; }
        .d-field input, .d-field select, .d-field textarea { width: 100%; padding: 11px 12px; border: 1px solid #d5dbdf; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 15px; color: #1c2b33; background: #fff; box-sizing: border-box; }
        .d-field input:focus, .d-field select:focus, .d-field textarea:focus { outline: none; border-color: #296190; box-shadow: 0 0 0 3px rgba(41,97,144,.18); }
        .d-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .d-chip { padding: 8px 14px; border: 1px solid #d5dbdf; border-radius: 20px; background: #fff; font-family: 'Jost', sans-serif; font-size: 14px; color: #4a5a62; cursor: pointer; transition: all .15s; }
        .d-chip-on { background: #296190; border-color: #296190; color: #fff; }
        .d-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 22px; gap: 12px; }
        .d-actions-right { display: flex; align-items: center; gap: 16px; margin-left: auto; }
        .d-btn { display: inline-block; padding: 13px 30px; background: #296190; color: #fff; border: 0; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 16px; font-weight: 600; cursor: pointer; text-decoration: none; transition: background .2s; }
        .d-btn:hover { background: #21506f; }
        .d-btn:disabled { opacity: .6; cursor: default; }
        .d-back { background: none; border: 1px solid #d5dbdf; color: #4a5a62; padding: 12px 22px; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 15px; cursor: pointer; }
        .d-back:hover { border-color: #296190; color: #296190; }
        .d-skiplink { background: none; border: 0; color: #6a7a82; font-family: 'Jost', sans-serif; font-size: 15px; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
        .d-skiplink:hover { color: #296190; }
        .d-err { background: #fbeaea; color: #8a2020; padding: 10px 12px; border-radius: 6px; font-size: 14px; margin: 12px 0 0; }
        .d-skiprow { display: flex; align-items: center; justify-content: space-between; margin-top: 20px; padding-top: 16px; border-top: 1px solid #eef1f3; }
        .d-skip { color: #6a7a82; font-size: 14px; text-decoration: underline; text-underline-offset: 3px; }
        .d-skip:hover { color: #296190; }
        .d-autosave { font-size: 12.5px; color: #8a9aa2; }
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
