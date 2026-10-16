'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '../../lib/supabase-browser';

const CHECKLIST = [
  'Zero Fees to Sell Your House',
  'Highest Off-Market Price',
  'Sell As-Is. No Cleanup. No Repairs.',
  'No Closing Costs',
  'No Realtors',
  'No Repairs',
];

function GetOfferInner() {
  const params = useSearchParams();
  const [leadId, setLeadId] = useState('');
  const [address, setAddress] = useState('');
  const [facts, setFacts] = useState({ property_type: '', sqft: '', beds: '', baths: '', year_built: '' });
  const [c, setC] = useState({ name: '', phone: '', email: '', heard_about: '', company: '' });

  // step: 'details' -> 'contact' -> 'account'
  const [step, setStep] = useState('details');
  const [status, setStatus] = useState('idle');
  const [errMsg, setErrMsg] = useState('');

  const [leadToken, setLeadToken] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [acctStatus, setAcctStatus] = useState('idle');
  const [acctErr, setAcctErr] = useState('');

  useEffect(() => {
    const idFromUrl = params.get('id') || sessionStorage.getItem('smhc_lead_id') || '';
    setLeadId(idFromUrl);
    const a = sessionStorage.getItem('smhc_address') || '';
    setAddress(a);
    try {
      const f = JSON.parse(sessionStorage.getItem('smhc_facts') || '{}');
      setFacts((s) => ({ ...s, ...f }));
    } catch {}
    if (!a && !idFromUrl) window.location.href = '/'; // nothing to work with
  }, [params]);

  const upC = (e) => setC({ ...c, [e.target.name]: e.target.value });
  const upF = (e) => setFacts({ ...facts, [e.target.name]: e.target.value });
  const noEnter = (e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault(); };

  // Save helper — PATCH onto the existing lead.
  const patchLead = async (fields) => {
    if (!leadId) return;
    try {
      await fetch('/api/lead', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: leadId, ...fields }),
      });
    } catch {}
  };

  // STEP A: confirm details -> save facts, go to contact.
  const nextFromDetails = async (e) => {
    e.preventDefault();
    setStatus('saving');
    await patchLead({
      property_type: facts.property_type, sqft: facts.sqft,
      beds: facts.beds, baths: facts.baths, year_built: facts.year_built,
    });
    setStatus('idle');
    setStep('contact');
    window.scrollTo(0, 0);
  };

  // STEP B: contact -> submit the lead.
  const submitContact = async (e) => {
    e.preventDefault();
    if (c.company) return; // honeypot
    if (!c.name || (!c.phone && !c.email)) {
      setStatus('error'); setErrMsg('Please add your name and a phone or email.'); return;
    }
    setStatus('sending'); setErrMsg('');
    await patchLead({
      name: c.name, phone: c.phone, email: c.email,
      heard_about: c.heard_about, submitted: true,
    });
    // Grab the access token for this lead so the dashboard link works after.
    try {
      const r = await fetch('/api/lead?id=' + encodeURIComponent(leadId));
      await r.json();
    } catch {}
    sessionStorage.removeItem('smhc_address');
    sessionStorage.removeItem('smhc_facts');
    setStatus('idle');
    // Offer account creation if we have an email; otherwise finish.
    if (c.email) { setStep('account'); window.scrollTo(0, 0); }
    else goToDetailsPage();
  };

  const goToDetailsPage = () => {
    window.location.href = '/details?id=' + encodeURIComponent(leadId) + '&resume=1';
  };

  const createAccount = async (e) => {
    e.preventDefault();
    setAcctErr('');
    if (pw.length < 6) { setAcctErr('Password must be at least 6 characters.'); return; }
    if (pw !== pw2) { setAcctErr('Passwords do not match.'); return; }
    setAcctStatus('working');
    try {
      const { data, error } = await supabaseBrowser.auth.signUp({ email: c.email, password: pw });
      if (error) {
        if (/already|registered|exists/i.test(error.message)) {
          setAcctErr('An account with this email already exists. You can log in to track your offer.');
          setAcctStatus('exists'); return;
        }
        setAcctErr(error.message); setAcctStatus('idle'); return;
      }
      const token = data?.session?.access_token;
      if (token) {
        await fetch('/api/lead', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ action: 'claim', id: leadId }),
        });
      }
      setAcctStatus('done');
      setTimeout(goToDetailsPage, 900);
    } catch {
      setAcctErr('Something went wrong. Please try again.'); setAcctStatus('idle');
    }
  };

  const gotFacts = facts.sqft || facts.beds || facts.baths || facts.year_built || facts.property_type;

  // Progress indicator (3 steps)
  const steps = [
    { key: 'details', label: 'Property' },
    { key: 'contact', label: 'Your info' },
    { key: 'account', label: 'Account' },
  ];
  const stepNum = step === 'details' ? 0 : step === 'contact' ? 1 : 2;

  return (
    <div className="g-wrap">
      <header className="g-header">
        <div className="g-header-in">
          <a className="g-logo" href="/">Cash&nbsp;Home&nbsp;Offer</a>
          <a className="g-phone" href="tel:+18584366585">(858) 436-6585</a>
        </div>
      </header>

      <div className="g-grid">
        <div className="g-card">
          {/* progress */}
          <div className="g-steps">
            {steps.map((s, i) => (
              <div key={s.key} className={'g-pstep' + (i <= stepNum ? ' on' : '') + (i === stepNum ? ' cur' : '')}>
                <span className="g-pdot">{i < stepNum ? '✓' : i + 1}</span>
                <span className="g-plabel">{s.label}</span>
              </div>
            ))}
          </div>

          {step === 'details' && (
          <>
          <h1>Confirm your property details</h1>
          {address && <p className="g-addr">📍 {address}</p>}
          <form onSubmit={nextFromDetails} onKeyDown={noEnter}>
            <div className="g-facts">
              <div className="g-facts-head">We found these details — edit if needed:</div>
              <div className="g-row">
                <div className="g-field"><label>Property type</label>
                  <input name="property_type" value={facts.property_type} onChange={upF} /></div>
                <div className="g-field"><label>Year built</label>
                  <input name="year_built" value={facts.year_built} onChange={upF} /></div>
                <div className="g-field"><label>Beds</label>
                  <input name="beds" value={facts.beds} onChange={upF} /></div>
                <div className="g-field"><label>Baths</label>
                  <input name="baths" value={facts.baths} onChange={upF} /></div>
                <div className="g-field g-full"><label>Square feet</label>
                  <input name="sqft" value={facts.sqft} onChange={upF} /></div>
              </div>
            </div>
            <button type="submit" className="g-btn" disabled={status === 'saving'}>
              {status === 'saving' ? 'Saving…' : 'Next'}
            </button>
          </form>
          </>
          )}

          {step === 'contact' && (
          <>
          <h1>Where should we send the offer?</h1>
          {address && <p className="g-addr">📍 {address}</p>}
          <form onSubmit={submitContact} onKeyDown={noEnter}>
            <div className="g-row">
              <div className="g-field">
                <label>Name <span className="g-req">(Required)</span></label>
                <input name="name" value={c.name} onChange={upC} autoComplete="name" />
              </div>
              <div className="g-field">
                <label>Phone <span className="g-req">(Required)</span></label>
                <input name="phone" value={c.phone} onChange={upC} type="tel" autoComplete="tel" />
              </div>
            </div>
            <div className="g-field">
              <label>Email Address</label>
              <input name="email" value={c.email} onChange={upC} type="email" autoComplete="email" />
            </div>
            <div className="g-field">
              <label>How did you hear about us?</label>
              <select name="heard_about" value={c.heard_about} onChange={upC}>
                <option value="">Select…</option>
                <option>Google search</option>
                <option>Referral</option>
                <option>Social media</option>
                <option>Mailer / postcard</option>
                <option>Drove by a sign</option>
                <option>Other</option>
              </select>
            </div>

            {/* honeypot */}
            <input type="text" name="company" value={c.company} onChange={upC}
              tabIndex="-1" autoComplete="off" aria-hidden="true"
              style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }} />

            {status === 'error' && <p className="g-err" role="alert">{errMsg}</p>}
            <div className="g-btn-row">
              <button type="button" className="g-back" onClick={() => { setStep('details'); window.scrollTo(0,0); }}>← Back</button>
              <button type="submit" className="g-btn g-btn-grow" disabled={status === 'sending'}>
                {status === 'sending' ? 'Submitting…' : 'Submit'}
              </button>
            </div>
            <p className="g-tos">By submitting, you agree to be contacted by phone,
            text, or email about your offer. No obligation.</p>
          </form>
          </>
          )}

          {step === 'account' && (
          <>
          <h1>Create your account</h1>
          <p className="g-addr">Your request is in! Set a password to track your offer,
            see updates, and view your offer details anytime. (Optional.)</p>

          {acctStatus === 'done' ? (
            <div className="g-done">
              <div className="g-done-check">✓</div>
              <p>Account created! Taking you to a few quick questions…</p>
            </div>
          ) : (
          <form onSubmit={createAccount} onKeyDown={noEnter}>
            <div className="g-field">
              <label>Email</label>
              <input value={c.email} readOnly className="g-readonly" />
            </div>
            <div className="g-field">
              <label>Create a password <span className="g-req">(6+ characters)</span></label>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="g-field">
              <label>Confirm password</label>
              <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
            </div>

            {acctErr && <p className="g-err" role="alert">{acctErr}</p>}

            {acctStatus === 'exists' ? (
              <a className="g-btn g-btn-link" href="/login?next=/my-offer">Log in to track your offer</a>
            ) : (
              <button type="submit" className="g-btn" disabled={acctStatus === 'working'}>
                {acctStatus === 'working' ? 'Creating…' : 'Create account & continue'}
              </button>
            )}

            <button type="button" className="g-skip" onClick={goToDetailsPage}>
              Skip for now
            </button>
          </form>
          )}
          </>
          )}
        </div>

        <div className="g-side">
          <h2>San Diego&rsquo;s Trusted Cash Buyer Network</h2>
          <ul className="g-check">
            {CHECKLIST.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>

      <style>{css}</style>
    </div>
  );
}

export default function GetOffer() {
  return (
    <Suspense fallback={<div className="g-wrap"><div className="g-grid"><div className="g-card"><p>Loading…</p></div></div><style>{css}</style></div>}>
      <GetOfferInner />
    </Suspense>
  );
}

const css = `
  .g-wrap { min-height: 100vh; background: #f5f7f9; font-family: 'Jost',system-ui,sans-serif; color: #1c2b33; }
  .g-header { background: #fff; border-bottom: 1px solid #e6e9ec; }
  .g-header-in { max-width: 1080px; margin: 0 auto; padding: 0 20px; height: 64px; display: flex; align-items: center; justify-content: space-between; }
  .g-logo { font-family: 'Cormorant Garamond',serif; font-weight: 700; font-size: 22px; color: #296190; text-decoration: none; }
  .g-phone { background: #296190; color: #fff; text-decoration: none; font-weight: 500; padding: 9px 18px; border-radius: 6px; }
  .g-grid { max-width: 1080px; margin: 0 auto; padding: 34px 20px 60px; display: grid; grid-template-columns: 1.3fr 0.7fr; gap: 34px; align-items: start; }
  .g-card { background: #fff; border: 1px solid #e6e9ec; border-top: 4px solid #296190; border-radius: 12px; padding: 30px; box-shadow: 0 12px 32px rgba(20,40,60,.08); }
  .g-steps { display: flex; gap: 6px; margin-bottom: 22px; }
  .g-pstep { display: flex; align-items: center; gap: 7px; flex: 1; font-size: 12.5px; color: #9aa8b0; }
  .g-pdot { width: 24px; height: 24px; border-radius: 50%; background: #eef1f3; color: #9aa8b0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0; }
  .g-pstep.on { color: #4a5a62; }
  .g-pstep.on .g-pdot { background: #2f9e5f; color: #fff; }
  .g-pstep.cur { color: #296190; font-weight: 600; }
  .g-pstep.cur .g-pdot { background: #296190; color: #fff; }
  .g-plabel { white-space: nowrap; }
  .g-card h1 { font-family: 'Cormorant Garamond',serif; font-size: 30px; margin: 0 0 8px; }
  .g-addr { color: #4a5a62; font-size: 15px; margin: 0 0 20px; line-height: 1.6; }
  .g-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .g-field { margin-bottom: 14px; }
  .g-full { grid-column: 1 / -1; }
  .g-field label { display: block; font-size: 13px; font-weight: 500; color: #4a5a62; margin-bottom: 5px; }
  .g-req { color: #296190; font-weight: 400; }
  .g-field input, .g-field select { width: 100%; padding: 12px 13px; border: 1px solid #d5dbdf; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 15px; color: #1c2b33; background: #fff; box-sizing: border-box; }
  .g-field input:focus, .g-field select:focus { outline: none; border-color: #296190; box-shadow: 0 0 0 3px rgba(41,97,144,.18); }
  .g-readonly { background: #f5f7f9 !important; color: #6a7a82 !important; }
  .g-facts { background: #f5f7f9; border: 1px solid #e6e9ec; border-radius: 8px; padding: 16px; margin: 8px 0 16px; }
  .g-facts-head { font-size: 13px; color: #296190; font-weight: 600; margin-bottom: 10px; }
  .g-btn { display: block; width: 100%; text-align: center; padding: 15px; background: #296190; color: #fff; border: 0; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 17px; font-weight: 600; cursor: pointer; margin-top: 6px; text-decoration: none; box-sizing: border-box; }
  .g-btn:hover { background: #21506f; }
  .g-btn:disabled { opacity: .6; cursor: default; }
  .g-btn-link { line-height: 1.2; }
  .g-btn-row { display: flex; gap: 10px; align-items: center; margin-top: 6px; }
  .g-btn-grow { flex: 1; margin-top: 0; }
  .g-back { background: none; border: 1px solid #d5dbdf; color: #4a5a62; border-radius: 6px; padding: 15px 18px; font-family: 'Jost',sans-serif; font-size: 15px; cursor: pointer; white-space: nowrap; }
  .g-back:hover { border-color: #296190; color: #296190; }
  .g-skip { display: block; width: 100%; background: none; border: 0; color: #6a7a82; font-family: 'Jost',sans-serif; font-size: 14px; cursor: pointer; margin-top: 14px; text-decoration: underline; }
  .g-skip:hover { color: #296190; }
  .g-err { background: #fbeaea; color: #8a2020; padding: 10px 12px; border-radius: 6px; font-size: 14px; margin: 0 0 12px; }
  .g-tos { font-size: 12px; color: #8a9aa2; text-align: center; margin: 12px 0 0; line-height: 1.6; }
  .g-done { text-align: center; padding: 20px 0; }
  .g-done-check { width: 54px; height: 54px; border-radius: 50%; background: #2f9e5f; color: #fff; font-size: 28px; line-height: 54px; margin: 0 auto 14px; }
  .g-done p { color: #1c5b34; font-size: 16px; }
  .g-side { padding-top: 8px; }
  .g-side h2 { font-family: 'Cormorant Garamond',serif; font-size: 26px; line-height: 1.25; margin: 0 0 18px; }
  .g-check { list-style: none; padding: 0; margin: 0; }
  .g-check li { position: relative; padding: 12px 0 12px 34px; border-bottom: 1px solid #e6e9ec; font-size: 15.5px; color: #1c2b33; }
  .g-check li::before { content: "\\2713"; position: absolute; left: 0; top: 12px; width: 22px; height: 22px; background: #296190; color: #fff; border-radius: 50%; font-size: 13px; text-align: center; line-height: 22px; }
  @media (max-width: 800px) { .g-grid { grid-template-columns: 1fr; } .g-side { order: -1; } }
  @media (max-width: 560px) { .g-row { grid-template-columns: 1fr; } }
`;
