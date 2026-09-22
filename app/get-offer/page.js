'use client';

import { useState, useEffect } from 'react';

const CHECKLIST = [
  'Zero Fees to Sell Your House',
  'Highest Off-Market Price',
  'Sell As-Is. No Cleanup. No Repairs.',
  'No Closing Costs',
  'No Realtors',
  'No Repairs',
];

export default function GetOffer() {
  const [address, setAddress] = useState('');
  const [facts, setFacts] = useState({ property_type: '', sqft: '', beds: '', baths: '', year_built: '' });
  const [c, setC] = useState({ name: '', phone: '', email: '', heard_about: '', company: '' });
  const [status, setStatus] = useState('idle');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    const a = sessionStorage.getItem('smhc_address') || '';
    setAddress(a);
    try {
      const f = JSON.parse(sessionStorage.getItem('smhc_facts') || '{}');
      setFacts((s) => ({ ...s, ...f }));
    } catch {}
    if (!a) window.location.href = '/'; // no address -> start over
  }, []);

  const upC = (e) => setC({ ...c, [e.target.name]: e.target.value });
  const upF = (e) => setFacts({ ...facts, [e.target.name]: e.target.value });
  const noEnter = (e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault(); };

  const submit = async (e) => {
    e.preventDefault();
    if (c.company) return; // honeypot
    if (!c.name || (!c.phone && !c.email)) {
      setStatus('error'); setErrMsg('Please add your name and a phone or email.'); return;
    }
    setStatus('sending'); setErrMsg('');
    try {
      const res = await fetch('/api/lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: c.name, phone: c.phone, email: c.email, address,
          heard_about: c.heard_about,
          property_type: facts.property_type, sqft: facts.sqft,
          beds: facts.beds, baths: facts.baths, year_built: facts.year_built,
          redfin_pulled: true,
        }),
      });
      const data = await res.json();
      if (data.ok && data.id) {
        sessionStorage.removeItem('smhc_address');
        sessionStorage.removeItem('smhc_facts');
        window.location.href = '/details?id=' + encodeURIComponent(data.id) + '&resume=1';
      } else { setStatus('error'); setErrMsg(data.error || 'Please try again.'); }
    } catch { setStatus('error'); setErrMsg('Network error. Please try again.'); }
  };

  const gotFacts = facts.sqft || facts.beds || facts.baths || facts.year_built || facts.property_type;

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
          <h1>Where should we send the offer?</h1>
          {address && <p className="g-addr">📍 {address}</p>}

          <form onSubmit={submit} onKeyDown={noEnter}>
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

            {gotFacts && (
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
            )}

            {/* honeypot */}
            <input type="text" name="company" value={c.company} onChange={upC}
              tabIndex="-1" autoComplete="off" aria-hidden="true"
              style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }} />

            {status === 'error' && <p className="g-err" role="alert">{errMsg}</p>}
            <button type="submit" className="g-btn" disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Send'}
            </button>
            <p className="g-tos">By submitting, you agree to be contacted by phone,
            text, or email about your offer. No obligation.</p>
          </form>
        </div>

        <div className="g-side">
          <h2>San Diego&rsquo;s Trusted Cash Buyer Network</h2>
          <ul className="g-check">
            {CHECKLIST.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>

      <style>{`
        .g-wrap { min-height: 100vh; background: #f5f7f9; font-family: 'Jost',system-ui,sans-serif; color: #1c2b33; }
        .g-header { background: #fff; border-bottom: 1px solid #e6e9ec; }
        .g-header-in { max-width: 1080px; margin: 0 auto; padding: 0 20px; height: 64px; display: flex; align-items: center; justify-content: space-between; }
        .g-logo { font-family: 'Cormorant Garamond',serif; font-weight: 700; font-size: 22px; color: #296190; text-decoration: none; }
        .g-phone { background: #296190; color: #fff; text-decoration: none; font-weight: 500; padding: 9px 18px; border-radius: 6px; }
        .g-grid { max-width: 1080px; margin: 0 auto; padding: 34px 20px 60px; display: grid; grid-template-columns: 1.3fr 0.7fr; gap: 34px; align-items: start; }
        .g-card { background: #fff; border: 1px solid #e6e9ec; border-top: 4px solid #296190; border-radius: 12px; padding: 30px; box-shadow: 0 12px 32px rgba(20,40,60,.08); }
        .g-card h1 { font-family: 'Cormorant Garamond',serif; font-size: 30px; margin: 0 0 8px; }
        .g-addr { color: #4a5a62; font-size: 15px; margin: 0 0 20px; }
        .g-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .g-field { margin-bottom: 14px; }
        .g-full { grid-column: 1 / -1; }
        .g-field label { display: block; font-size: 13px; font-weight: 500; color: #4a5a62; margin-bottom: 5px; }
        .g-req { color: #296190; font-weight: 400; }
        .g-field input, .g-field select { width: 100%; padding: 12px 13px; border: 1px solid #d5dbdf; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 15px; color: #1c2b33; background: #fff; box-sizing: border-box; }
        .g-field input:focus, .g-field select:focus { outline: none; border-color: #296190; box-shadow: 0 0 0 3px rgba(41,97,144,.18); }
        .g-facts { background: #f5f7f9; border: 1px solid #e6e9ec; border-radius: 8px; padding: 16px; margin: 8px 0 16px; }
        .g-facts-head { font-size: 13px; color: #296190; font-weight: 600; margin-bottom: 10px; }
        .g-btn { width: 100%; padding: 15px; background: #296190; color: #fff; border: 0; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 17px; font-weight: 600; cursor: pointer; margin-top: 6px; }
        .g-btn:hover { background: #21506f; }
        .g-btn:disabled { opacity: .6; cursor: default; }
        .g-err { background: #fbeaea; color: #8a2020; padding: 10px 12px; border-radius: 6px; font-size: 14px; margin: 0 0 12px; }
        .g-tos { font-size: 12px; color: #8a9aa2; text-align: center; margin: 12px 0 0; line-height: 1.6; }
        .g-side { padding-top: 8px; }
        .g-side h2 { font-family: 'Cormorant Garamond',serif; font-size: 26px; line-height: 1.25; margin: 0 0 18px; }
        .g-check { list-style: none; padding: 0; margin: 0; }
        .g-check li { position: relative; padding: 12px 0 12px 34px; border-bottom: 1px solid #e6e9ec; font-size: 15.5px; color: #1c2b33; }
        .g-check li::before { content: "\\2713"; position: absolute; left: 0; top: 12px; width: 22px; height: 22px; background: #296190; color: #fff; border-radius: 50%; font-size: 13px; text-align: center; line-height: 22px; }
        @media (max-width: 800px) { .g-grid { grid-template-columns: 1fr; } .g-side { order: -1; } }
        @media (max-width: 560px) { .g-row { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
