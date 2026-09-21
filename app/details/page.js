'use client';

import { useState, useEffect, useRef, Suspense } from 'react';

const ISSUE_OPTIONS = ['Roof','Foundation','Plumbing','Electrical','HVAC','Water damage / mold','Fire damage','Termites / pests'];
const WIZARD = ['Property','Condition','Situation','Financial','Contact'];
const TRACKER = [
  { t: 'Request your offer', d: 'Submitted' },
  { t: 'Discovery call', d: 'A quick conversation' },
  { t: 'Property visit', d: 'We assess the home' },
  { t: 'Investors compete', d: 'Offers come in' },
  { t: 'Choose & close', d: 'You pick the best' },
];
const PHONE = '+18584366585';
const PHONE_DISP = '(858) 436-6585';

function CallWidget({ id }) {
  const [open, setOpen] = useState(false);
  const [cbStatus, setCbStatus] = useState('idle');
  const requestCallback = async () => {
    setCbStatus('sending');
    try {
      await fetch('/api/lead', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, callback_requested: 'Requested ' + new Date().toLocaleString() }),
      });
      setCbStatus('done');
    } catch { setCbStatus('idle'); }
  };
  return (
    <div className="cw">
      {open && (
        <div className="cw-pop">
          <div className="cw-pop-head">Talk with us now</div>
          <a className="cw-opt" href={'tel:' + PHONE}>📞 Call {PHONE_DISP}</a>
          <a className="cw-opt" href={'sms:' + PHONE}>💬 Text us</a>
          {cbStatus === 'done'
            ? <div className="cw-opt cw-done">✓ Callback requested — we&rsquo;ll reach out shortly</div>
            : <button className="cw-opt cw-btn" onClick={requestCallback} disabled={!id || cbStatus==='sending'}>
                {cbStatus === 'sending' ? 'Requesting…' : '↩ Request a callback'}
              </button>}
        </div>
      )}
      <button className="cw-fab" onClick={() => setOpen(o => !o)} aria-label="Contact us">
        {open ? '✕' : 'Talk to us'}
      </button>
      <style>{`
        .cw { position: fixed; right: 20px; bottom: 20px; z-index: 100; }
        .cw-fab { background: #296190; color: #fff; border: 0; border-radius: 30px; padding: 14px 22px; font-family: 'Jost',sans-serif; font-size: 15px; font-weight: 600; cursor: pointer; box-shadow: 0 8px 24px rgba(20,40,60,.28); }
        .cw-fab:hover { background: #21506f; }
        .cw-pop { position: absolute; bottom: 60px; right: 0; width: 260px; background: #fff; border: 1px solid #e6e9ec; border-radius: 12px; box-shadow: 0 16px 40px rgba(20,40,60,.22); padding: 14px; }
        .cw-pop-head { font-family: 'Cormorant Garamond',serif; font-size: 18px; color: #1c2b33; margin-bottom: 10px; }
        .cw-opt { display: block; width: 100%; text-align: left; padding: 11px 12px; margin-bottom: 8px; border: 1px solid #d5dbdf; border-radius: 8px; background: #fff; color: #1c2b33; font-family: 'Jost',sans-serif; font-size: 14px; text-decoration: none; cursor: pointer; }
        .cw-opt:hover { border-color: #296190; color: #296190; }
        .cw-btn { text-align: left; }
        .cw-done { color: #1c5b34; border-color: #cfe6d8; background: #eef7f1; cursor: default; }
        .cw-done:hover { color: #1c5b34; border-color: #cfe6d8; }
      `}</style>
    </div>
  );
}

function Tracker({ stage }) {
  return (
    <div className="dt">
      <div className="dt-title">Your progress</div>
      <div className="dt-steps">
        {TRACKER.map((s, i) => {
          const n = i + 1;
          const done = n <= stage;
          return (
            <div key={n} className={'dt-step' + (done ? ' dt-done' : '')}>
              <div className="dt-badge">{done ? '✓' : n}</div>
              <div className="dt-txt"><div className="dt-t">{s.t}</div><div className="dt-d">{s.d}</div></div>
            </div>
          );
        })}
      </div>
      <style>{`
        .dt { margin-bottom: 26px; }
        .dt-title { font-family: 'Cormorant Garamond',serif; font-size: 22px; color: #1c2b33; margin-bottom: 14px; }
        .dt-steps { display: grid; grid-template-columns: repeat(5,1fr); gap: 10px; }
        .dt-step { background: #fff; border: 1.5px solid #d5dbdf; border-radius: 10px; padding: 14px 10px; text-align: center; }
        .dt-done { background: #eef7f1; border-color: #2f9e5f; }
        .dt-badge { width: 30px; height: 30px; border-radius: 50%; background: #eef1f3; color: #6a7a82; display: flex; align-items: center; justify-content: center; font-weight: 700; margin: 0 auto 8px; font-family: 'Cormorant Garamond',serif; font-size: 16px; }
        .dt-done .dt-badge { background: #2f9e5f; color: #fff; }
        .dt-t { font-size: 13px; font-weight: 600; color: #1c2b33; line-height: 1.25; }
        .dt-done .dt-t { color: #1c5b34; }
        .dt-d { font-size: 11px; color: #8a9aa2; margin-top: 3px; }
        @media (max-width: 700px) { .dt-steps { grid-template-columns: 1fr 1fr; } }
      `}</style>
    </div>
  );
}

function DetailsInner() {
  const [id, setId] = useState('');
  const [ready, setReady] = useState(false);
  const [view, setView] = useState('confirm'); // confirm | dashboard
  const [stage, setStage] = useState(1);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState('idle');
  const [errMsg, setErrMsg] = useState('');
  const [f, setF] = useState({
    property_type:'',beds:'',baths:'',sqft:'',year_built:'',condition_detail:'',recent_updates:'',
    occupancy:'',lease_status:'',reason_selling:'',mortgage_status:'',foreclosure:'',liens_taxes:'',
    probate:'',best_time:'',contact_pref:'',details_notes:'',
  });
  const [issues, setIssues] = useState([]);
  const saveTimer = useRef(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const pid = p.get('id') || '';
    setId(pid);
    // If arriving with a resume flag, skip the confirm screen.
    if (p.get('resume') === '1') setView('dashboard');
    if (pid) {
      fetch('/api/lead?id=' + encodeURIComponent(pid)).then(r => r.json()).then(res => {
        if (res.ok && res.data) {
          const d = res.data;
          if (d.stage) setStage(parseInt(d.stage, 10) || 1);
          setF(s => { const n = { ...s }; for (const k of Object.keys(s)) if (d[k] != null && d[k] !== '') n[k] = d[k]; return n; });
          if (d.major_issues) setIssues(d.major_issues.split(', ').filter(Boolean));
        }
        setReady(true);
      }).catch(() => setReady(true));
    } else setReady(true);
  }, []);

  const autosave = (nf, ni) => {
    if (!id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch('/api/lead', { method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ id, ...nf, major_issues: (ni ?? issues).join(', ') }) }).catch(()=>{});
    }, 800);
  };
  const up = (e) => { const nf = { ...f, [e.target.name]: e.target.value }; setF(nf); autosave(nf, issues); };
  const toggleIssue = (v) => { const ni = issues.includes(v) ? issues.filter(x=>x!==v) : [...issues, v]; setIssues(ni); autosave(f, ni); };
  const goNext = () => { autosave(f, issues); setStep(s => Math.min(s+1, WIZARD.length-1)); };
  const goBack = () => setStep(s => Math.max(s-1, 0));
  const noEnter = (e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault(); };

  const finalize = async () => {
    if (!id) { setStatus('done'); return; }
    setStatus('saving'); setErrMsg('');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      const res = await fetch('/api/lead', { method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ id, ...f, major_issues: issues.join(', '), finalize: true }) });
      const data = await res.json();
      if (data.ok) setStatus('done'); else { setStatus('error'); setErrMsg(data.error || 'Please try again.'); }
    } catch { setStatus('error'); setErrMsg('Network error. Please try again.'); }
  };

  if (!ready) return null;

  // No id — still confirm (lead was saved), centered.
  if (!id) {
    return (<div className="d-wrap"><div className="d-card d-center">
      <div className="d-check">✓</div>
      <h1>Thank you — your request is in.</h1>
      <p>We&rsquo;ll be in touch shortly to talk through your home and next steps.</p>
      <a className="d-btn" href="/">Return home</a>
    </div></div>);
  }

  // Centered confirmation with "Go to My Dashboard".
  if (view === 'confirm') {
    return (<div className="d-wrap"><div className="d-card d-center">
      <div className="d-check">✓</div>
      <h1>Your request is in!</h1>
      <p>Thanks — we&rsquo;ve received your request for a cash offer. Head to your
      dashboard to track your progress and add a few details that help us prepare
      stronger offers.</p>
      <button className="d-btn" onClick={() => setView('dashboard')}>Go to My Dashboard</button>
      <style>{centerCss}</style>
      <CallWidget id={id} />
    </div></div>);
  }

  const pct = Math.round(((step + 1) / WIZARD.length) * 100);

  return (
    <div className="d-wrap">
      <div className="d-card">
        <Tracker stage={stage} />

        {status === 'done' ? (
          <div className="d-saved">
            <div className="d-check d-check-sm">✓</div>
            <h2>Details saved — thank you!</h2>
            <p>We&rsquo;ll review your home and move you to the next step soon. You can
            close this page; your progress is saved.</p>
            <a className="d-btn" href="/">Return home</a>
          </div>
        ) : (
          <>
            <div className="d-divider" />
            <span className="d-eyebrow">Help us prepare your offers — optional</span>
            <h2 className="d-h1">Tell us about your home</h2>
            <p className="d-sub">Everything is optional and saves as you go. Step {step+1} of {WIZARD.length}.</p>
            <div className="d-progress"><div className="d-progress-bar" style={{ width: pct + '%' }} /></div>
            <div className="d-steplabel">{WIZARD[step]}</div>

            <div onKeyDown={noEnter}>
              {step === 0 && (<div className="d-grid">
                <div className="d-field"><label>Property type</label>
                  <select name="property_type" value={f.property_type} onChange={up}>
                    <option value="">Select…</option><option>Single-family home</option><option>Condo</option><option>Townhome</option><option>Multi-unit</option><option>Mobile / manufactured</option><option>Other</option>
                  </select></div>
                <div className="d-field"><label>Year built (approx.)</label><input name="year_built" value={f.year_built} onChange={up} inputMode="numeric" /></div>
                <div className="d-field"><label>Bedrooms</label><input name="beds" value={f.beds} onChange={up} inputMode="numeric" /></div>
                <div className="d-field"><label>Bathrooms</label><input name="baths" value={f.baths} onChange={up} inputMode="numeric" /></div>
                <div className="d-field d-full"><label>Approx. square footage</label><input name="sqft" value={f.sqft} onChange={up} inputMode="numeric" /></div>
              </div>)}
              {step === 1 && (<div>
                <div className="d-field"><label>Overall condition</label>
                  <select name="condition_detail" value={f.condition_detail} onChange={up}>
                    <option value="">Select…</option><option>Move-in ready</option><option>Needs minor work</option><option>Needs major work</option><option>Severe damage / not livable</option>
                  </select></div>
                <div className="d-field"><label>Any known issues?</label>
                  <div className="d-chips">{ISSUE_OPTIONS.map(o => (
                    <button type="button" key={o} className={'d-chip'+(issues.includes(o)?' d-chip-on':'')} onClick={()=>toggleIssue(o)}>{o}</button>
                  ))}</div></div>
                <div className="d-field"><label>Any recent updates or renovations?</label><input name="recent_updates" value={f.recent_updates} onChange={up} placeholder="e.g. new roof 2022" /></div>
              </div>)}
              {step === 2 && (<div className="d-grid">
                <div className="d-field"><label>Is the property occupied?</label>
                  <select name="occupancy" value={f.occupancy} onChange={up}><option value="">Select…</option><option>Owner-occupied</option><option>Tenant-occupied</option><option>Vacant</option></select></div>
                <div className="d-field"><label>If tenant-occupied, lease status</label><input name="lease_status" value={f.lease_status} onChange={up} placeholder="e.g. month-to-month" /></div>
                <div className="d-field d-full"><label>Reason for selling</label>
                  <select name="reason_selling" value={f.reason_selling} onChange={up}>
                    <option value="">Select…</option><option>I want to cash out</option><option>I want to move to another home</option><option>Relocating / moving</option><option>Inherited / probate</option><option>Facing foreclosure</option><option>Tired of being a landlord</option><option>Divorce</option><option>Downsizing</option><option>Financial reasons</option><option>Property needs too much work</option><option>Other</option>
                  </select></div>
              </div>)}
              {step === 3 && (<div>
                <p className="d-note">Optional — skip and discuss on the call if you prefer.</p>
                <div className="d-grid">
                  <div className="d-field"><label>Approx. mortgage balance</label><input name="mortgage_status" value={f.mortgage_status} onChange={up} placeholder="e.g. paid off, ~$300k" /></div>
                  <div className="d-field"><label>Behind on payments / foreclosure?</label><select name="foreclosure" value={f.foreclosure} onChange={up}><option value="">Select…</option><option>No</option><option>Behind on payments</option><option>In foreclosure</option><option>Prefer not to say</option></select></div>
                  <div className="d-field"><label>Any liens or back taxes?</label><select name="liens_taxes" value={f.liens_taxes} onChange={up}><option value="">Select…</option><option>No</option><option>Yes</option><option>Not sure</option><option>Prefer not to say</option></select></div>
                  <div className="d-field"><label>Is the property in probate?</label><select name="probate" value={f.probate} onChange={up}><option value="">Select…</option><option>No</option><option>Yes</option><option>Not sure</option></select></div>
                </div>
              </div>)}
              {step === 4 && (<div>
                <div className="d-grid">
                  <div className="d-field"><label>Best time to reach you</label><select name="best_time" value={f.best_time} onChange={up}><option value="">Select…</option><option>Morning</option><option>Afternoon</option><option>Evening</option><option>Anytime</option></select></div>
                  <div className="d-field"><label>Preferred contact method</label><select name="contact_pref" value={f.contact_pref} onChange={up}><option value="">Select…</option><option>Call</option><option>Text</option><option>Email</option></select></div>
                </div>
                <div className="d-field"><label>Anything else we should know?</label><textarea name="details_notes" value={f.details_notes} onChange={up} rows={3} /></div>
              </div>)}
            </div>

            {status === 'error' && <p className="d-err" role="alert">{errMsg}</p>}

            <div className="d-actions">
              {step > 0 && <button type="button" className="d-back" onClick={goBack}>Back</button>}
              <div className="d-actions-right">
                {step < WIZARD.length - 1 && (<>
                  <button type="button" className="d-skiplink" onClick={goNext}>Skip</button>
                  <button type="button" className="d-btn" onClick={goNext}>Next</button>
                </>)}
                {step === WIZARD.length - 1 && (
                  <button type="button" className="d-btn" onClick={finalize} disabled={status==='saving'}>{status==='saving'?'Saving…':'Save my details'}</button>
                )}
              </div>
            </div>
            <div className="d-skiprow"><a className="d-skip" href="/">Skip for now</a><span className="d-autosave">Answers save automatically</span></div>
          </>
        )}
      </div>
      <CallWidget id={id} />
      <style>{centerCss}</style>
    </div>
  );
}

const centerCss = `
  .d-wrap { min-height: 100vh; background: #f5f7f9; padding: 40px 16px; font-family: 'Jost',system-ui,sans-serif; color: #1c2b33; }
  .d-card { max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #e6e9ec; border-top: 4px solid #296190; border-radius: 12px; padding: 32px; box-shadow: 0 12px 32px rgba(20,40,60,.08); }
  .d-center { text-align: center; max-width: 560px; padding: 44px 32px; }
  .d-check { width: 60px; height: 60px; border-radius: 50%; background: #eef7f1; color: #2f9e5f; font-size: 30px; display: flex; align-items: center; justify-content: center; margin: 0 auto 18px; }
  .d-check-sm { width: 46px; height: 46px; font-size: 24px; margin-bottom: 12px; }
  .d-center h1 { font-family: 'Cormorant Garamond',Georgia,serif; font-size: 32px; color: #1c2b33; margin: 0 0 12px; }
  .d-center p { color: #4a5a62; font-size: 16px; line-height: 1.7; margin: 0 auto 24px; max-width: 440px; }
  .d-divider { height: 1px; background: #eef1f3; margin: 4px 0 20px; }
  .d-eyebrow { display: inline-block; text-transform: uppercase; letter-spacing: 2px; font-size: 11px; font-weight: 600; color: #296190; margin-bottom: 8px; }
  .d-h1 { font-family: 'Cormorant Garamond',Georgia,serif; font-size: 26px; color: #1c2b33; margin: 0 0 8px; }
  .d-sub { color: #4a5a62; font-size: 15px; line-height: 1.6; margin: 0 0 16px; }
  .d-progress { height: 6px; background: #e6e9ec; border-radius: 4px; overflow: hidden; margin-bottom: 8px; }
  .d-progress-bar { height: 100%; background: #296190; border-radius: 4px; transition: width .3s ease; }
  .d-steplabel { font-family: 'Cormorant Garamond',Georgia,serif; font-size: 20px; color: #1c2b33; margin: 8px 0 16px; }
  .d-note { font-size: 13.5px; color: #6a7a82; margin: 0 0 14px; }
  .d-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .d-field { margin-bottom: 14px; }
  .d-full { grid-column: 1 / -1; }
  .d-field label { display: block; font-size: 13px; font-weight: 500; color: #4a5a62; margin-bottom: 5px; }
  .d-field input, .d-field select, .d-field textarea { width: 100%; padding: 11px 12px; border: 1px solid #d5dbdf; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 15px; color: #1c2b33; background: #fff; box-sizing: border-box; }
  .d-field input:focus, .d-field select:focus, .d-field textarea:focus { outline: none; border-color: #296190; box-shadow: 0 0 0 3px rgba(41,97,144,.18); }
  .d-chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .d-chip { padding: 8px 14px; border: 1px solid #d5dbdf; border-radius: 20px; background: #fff; font-family: 'Jost',sans-serif; font-size: 14px; color: #4a5a62; cursor: pointer; }
  .d-chip-on { background: #296190; border-color: #296190; color: #fff; }
  .d-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 20px; gap: 12px; }
  .d-actions-right { display: flex; align-items: center; gap: 16px; margin-left: auto; }
  .d-btn { display: inline-block; padding: 13px 30px; background: #296190; color: #fff; border: 0; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 16px; font-weight: 600; cursor: pointer; text-decoration: none; }
  .d-btn:hover { background: #21506f; }
  .d-btn:disabled { opacity: .6; cursor: default; }
  .d-back { background: none; border: 1px solid #d5dbdf; color: #4a5a62; padding: 12px 22px; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 15px; cursor: pointer; }
  .d-skiplink { background: none; border: 0; color: #6a7a82; font-family: 'Jost',sans-serif; font-size: 15px; cursor: pointer; text-decoration: underline; }
  .d-err { background: #fbeaea; color: #8a2020; padding: 10px 12px; border-radius: 6px; font-size: 14px; margin: 12px 0 0; }
  .d-skiprow { display: flex; align-items: center; justify-content: space-between; margin-top: 18px; padding-top: 14px; border-top: 1px solid #eef1f3; }
  .d-skip { color: #6a7a82; font-size: 14px; text-decoration: underline; }
  .d-autosave { font-size: 12.5px; color: #8a9aa2; }
  .d-saved { text-align: center; padding: 20px 0; }
  .d-saved h2 { font-family: 'Cormorant Garamond',Georgia,serif; font-size: 26px; margin: 0 0 10px; }
  .d-saved p { color: #4a5a62; font-size: 15.5px; line-height: 1.7; max-width: 440px; margin: 0 auto 20px; }
  @media (max-width: 620px) { .d-grid { grid-template-columns: 1fr; } .d-card { padding: 22px; } }
`;

export default function DetailsPage() {
  return (<Suspense fallback={null}><DetailsInner /></Suspense>);
}
