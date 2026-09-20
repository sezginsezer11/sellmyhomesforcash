'use client';

import { useState } from 'react';

function LeadForm({ idPrefix, form, update, submit, status, errMsg }) {
  return (
    <form className="smhc-form" onSubmit={submit} noValidate>
      <div className="smhc-field">
        <label htmlFor={`${idPrefix}-name`}>Full name</label>
        <input id={`${idPrefix}-name`} name="name" value={form.name}
          onChange={update} required autoComplete="name" />
      </div>
      <div className="smhc-field">
        <label htmlFor={`${idPrefix}-phone`}>Phone</label>
        <input id={`${idPrefix}-phone`} name="phone" value={form.phone}
          onChange={update} type="tel" autoComplete="tel" />
      </div>
      <div className="smhc-field">
        <label htmlFor={`${idPrefix}-email`}>Email</label>
        <input id={`${idPrefix}-email`} name="email" value={form.email}
          onChange={update} type="email" autoComplete="email" />
      </div>
      <div className="smhc-field">
        <label htmlFor={`${idPrefix}-address`}>Property address</label>
        <input id={`${idPrefix}-address`} name="address" value={form.address}
          onChange={update} required autoComplete="street-address" />
      </div>
      <div className="smhc-row">
        <div className="smhc-field">
          <label htmlFor={`${idPrefix}-timeline`}>Timeline</label>
          <select id={`${idPrefix}-timeline`} name="timeline"
            value={form.timeline} onChange={update}>
            <option value="">Select…</option>
            <option>ASAP</option>
            <option>1–3 months</option>
            <option>3–6 months</option>
            <option>Just exploring</option>
          </select>
        </div>
        <div className="smhc-field">
          <label htmlFor={`${idPrefix}-condition`}>Condition</label>
          <select id={`${idPrefix}-condition`} name="condition"
            value={form.condition} onChange={update}>
            <option value="">Select…</option>
            <option>Move-in ready</option>
            <option>Needs some work</option>
            <option>Major repairs</option>
          </select>
        </div>
      </div>
      <input type="text" name="company" value={form.company} onChange={update}
        tabIndex="-1" autoComplete="off" aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }} />
      <button type="submit" className="smhc-cta" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : 'Get My Cash Offer'}
      </button>
      {status === 'ok' && (
        <p className="smhc-note smhc-note-ok" role="status">
          Thank you — your request is in. We&rsquo;ll reach out shortly with your offer.
        </p>
      )}
      {status === 'error' && (
        <p className="smhc-note smhc-note-err" role="alert">{errMsg}</p>
      )}
      <p className="smhc-fineprint">
        No obligation. Your information stays private and is never sold.
      </p>
    </form>
  );
}

export default function Home() {
  const [form, setForm] = useState({
    name: '', phone: '', email: '', address: '',
    timeline: '', condition: '', company: '',
  });
  const [status, setStatus] = useState('idle');
  const [errMsg, setErrMsg] = useState('');

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setStatus('sending'); setErrMsg('');
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.ok) { setStatus('ok'); }
      else { setStatus('error'); setErrMsg(data.error || 'Please try again.'); }
    } catch {
      setStatus('error'); setErrMsg('Network error. Please try again.');
    }
  };

  const formProps = { form, update, submit, status, errMsg };

  return (
    <div id="smhc-wrap">
      <header className="smhc-header">
        <div className="smhc-container smhc-header-inner">
          <span className="smhc-logo">Cash&nbsp;Home&nbsp;Offer</span>
          <a className="smhc-phone" href="tel:+10000000000">(000) 000-0000</a>
        </div>
      </header>

      <section className="smhc-hero">
        <div className="smhc-container smhc-hero-grid">
          <div className="smhc-hero-copy">
            <span className="smhc-eyebrow">A simpler way to sell</span>
            <h1>Sell Your Home Fast For Cash — As-Is, No Repairs</h1>
            <p className="smhc-sub">
              Skip the showings, the repairs, and the agent fees. We connect you
              with vetted cash buyers so you can get a fair, no-obligation offer
              and close on the timeline that works for you.
            </p>
            <ul className="smhc-hero-list">
              <li>No fees or commissions</li>
              <li>Sell as-is — zero repairs or cleanup</li>
              <li>Connect with vetted cash buyers in our network</li>
            </ul>
          </div>
          <div className="smhc-hero-card">
            <h2 className="smhc-card-title">Get Your Free Cash Offer</h2>
            <LeadForm idPrefix="hero" {...formProps} />
          </div>
        </div>
      </section>

      <section className="smhc-trust">
        <div className="smhc-container smhc-trust-grid">
          <div className="smhc-trust-item">
            <span className="smhc-trust-num">Fast</span>
            <span className="smhc-trust-label">Offers in as little as 24 hours</span>
          </div>
          <div className="smhc-trust-item">
            <span className="smhc-trust-num">As-Is</span>
            <span className="smhc-trust-label">No repairs, no cleaning, no staging</span>
          </div>
          <div className="smhc-trust-item">
            <span className="smhc-trust-num">$0</span>
            <span className="smhc-trust-label">No commissions or hidden fees</span>
          </div>
        </div>
      </section>

      <section className="smhc-section" id="how-it-works">
        <div className="smhc-container">
          <span className="smhc-eyebrow smhc-eyebrow-dark">Simple &amp; transparent</span>
          <h2 className="smhc-h2">How It Works</h2>
          <div className="smhc-steps">
            <div className="smhc-step">
              <span className="smhc-step-num">1</span>
              <h3>Tell us about your home</h3>
              <p>Share a few details about your property and your timeline. It takes about two minutes.</p>
            </div>
            <div className="smhc-step">
              <span className="smhc-step-num">2</span>
              <h3>Get matched with cash buyers</h3>
              <p>We connect you with vetted cash buyers in our network, who present a fair, no-obligation offer — often within 24 hours.</p>
            </div>
            <div className="smhc-step">
              <span className="smhc-step-num">3</span>
              <h3>Choose your offer &amp; close</h3>
              <p>Review the offer, pick the closing date that suits you, and sell direct to the buyer. No repairs, no showings, no surprises.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="smhc-section smhc-section-alt" id="compare">
        <div className="smhc-container">
          <span className="smhc-eyebrow smhc-eyebrow-dark">See the difference</span>
          <h2 className="smhc-h2">Cash Offer vs. Traditional Sale</h2>
          <div className="smhc-table-wrap">
            <table className="smhc-table">
              <thead>
                <tr>
                  <th scope="col">&nbsp;</th>
                  <th scope="col" className="smhc-th-hi">Cash Offer</th>
                  <th scope="col">Traditional Sale</th>
                </tr>
              </thead>
              <tbody>
                <tr><th scope="row">Commissions &amp; fees</th><td className="smhc-hi">None</td><td>Up to 6% + fees</td></tr>
                <tr><th scope="row">Repairs</th><td className="smhc-hi">Sell fully as-is</td><td>Often required</td></tr>
                <tr><th scope="row">Showings &amp; open houses</th><td className="smhc-hi">None</td><td>Ongoing</td></tr>
                <tr><th scope="row">Time to close</th><td className="smhc-hi">As few as 7 days</td><td>2–3 months</td></tr>
                <tr><th scope="row">Closing date</th><td className="smhc-hi">You choose</td><td>Buyer-driven</td></tr>
                <tr><th scope="row">Risk of falling through</th><td className="smhc-hi">Minimal</td><td>Financing-dependent</td></tr>
              </tbody>
            </table>
          </div>
          <p className="smhc-disclaimer">
            A cash offer is typically below full retail market value in exchange
            for speed, certainty, and selling as-is. We&rsquo;ll always explain how
            your offer is calculated so you can decide what&rsquo;s right for you.
          </p>
        </div>
      </section>

      <section className="smhc-section" id="faq">
        <div className="smhc-container smhc-faq-container">
          <span className="smhc-eyebrow smhc-eyebrow-dark">Good to know</span>
          <h2 className="smhc-h2">Frequently Asked Questions</h2>

          <details className="smhc-faq">
            <summary>How fast can I sell my house for cash in San Diego?</summary>
            <div className="smhc-faq-body">
              <p>Most San Diego homeowners are matched with a cash buyer and receive
              an offer within 24 hours, and can close in as little as 7 days.
              Because these are cash buyers with no lender, appraisal, or financing
              contingency, the timeline moves far faster than a traditional sale.
              If you need more time, you pick a later closing date.</p>
            </div>
          </details>

          <details className="smhc-faq">
            <summary>Do I need to make repairs before selling my house?</summary>
            <div className="smhc-faq-body">
              <p>No. You sell completely as-is. There&rsquo;s no cleaning, staging, or
              contractor work required, and no inspections to pass. Whether the
              home needs cosmetic updates or major repairs, you can leave behind
              anything you don&rsquo;t want to take with you.</p>
            </div>
          </details>

          <details className="smhc-faq">
            <summary>How do you determine the cash offer for my house?</summary>
            <div className="smhc-faq-body">
              <p>Cash buyers in our network base their offer on your home&rsquo;s location,
              size, and condition, along with recent comparable sales in your San
              Diego neighborhood, minus the cost of any work needed to bring it to
              market. You&rsquo;ll see how the number was reached so you can decide with
              full information.</p>
            </div>
          </details>

          <details className="smhc-faq">
            <summary>Are there any fees or commissions when selling my house?</summary>
            <div className="smhc-faq-body">
              <p>There are no agent commissions and no listing fees to work with our
              service. You also skip the typical costs of preparing a home for
              market — repairs, staging, and months of carrying costs. Any standard
              closing costs are explained up front so there are no surprises.</p>
            </div>
          </details>

          <details className="smhc-faq">
            <summary>Why choose a cash home buyer instead of listing with a real estate agent?</summary>
            <div className="smhc-faq-body">
              <p>A traditional listing can be the right choice when you have time
              and a move-in-ready home, and it often brings a higher sale price. A
              cash sale trades some of that price for speed, certainty, and
              convenience — no showings, no repairs, no financing that can fall
              through. It tends to make the most sense when you need to sell
              quickly or the home needs work. We can help you weigh both paths.</p>
            </div>
          </details>

          <details className="smhc-faq">
            <summary>What types of properties can be sold this way?</summary>
            <div className="smhc-faq-body">
              <p>Cash buyers in our network purchase a wide range of properties —
              single-family homes, townhomes, condos, multi-unit buildings, and
              more — in nearly any condition. Inherited homes, rentals with tenants,
              properties facing foreclosure, and homes needing major repairs are all
              welcome.</p>
            </div>
          </details>

          <details className="smhc-faq">
            <summary>Are cash buyers available throughout San Diego County?</summary>
            <div className="smhc-faq-body">
              <p>Yes. Our network of cash buyers covers San Diego County, from the
              coast to inland communities. If your property is in the county, we&rsquo;d
              be glad to connect you for a no-obligation cash offer.</p>
            </div>
          </details>

          <details className="smhc-faq">
            <summary>How does the cash home buying process work?</summary>
            <div className="smhc-faq-body">
              <p>It&rsquo;s three simple steps: share a few details about your home and
              timeline, get matched with a cash buyer who presents a fair offer
              (often within 24 hours), and if you accept, choose your closing date.
              There are no showings, no repairs, and no obligation at any point.</p>
            </div>
          </details>

          <details className="smhc-faq">
            <summary>Is there any obligation to accept your offer?</summary>
            <div className="smhc-faq-body">
              <p>None at all. Requesting an offer is free and there&rsquo;s no pressure
              to accept any offer from a buyer in our network. If it&rsquo;s not the right
              fit, we&rsquo;re happy to point you toward other options that may serve you
              better.</p>
            </div>
          </details>

          <details className="smhc-faq">
            <summary>How much is my home worth?</summary>
            <div className="smhc-faq-body">
              <p>The best way to find out is to request a free, no-obligation offer.
              We&rsquo;ll connect you with cash buyers who review your home&rsquo;s details and
              recent comparable San Diego sales and share a fair figure — with no
              cost and no commitment.</p>
            </div>
          </details>
        </div>
      </section>

      <section className="smhc-contact" id="contact">
        <div className="smhc-container smhc-contact-grid">
          <div className="smhc-contact-copy">
            <h2>Ready for Your Cash Offer?</h2>
            <p>Tell us about your home and we&rsquo;ll connect you with vetted cash
            buyers for a fair, no-obligation offer — fast. No repairs, no
            showings, no agent fees.</p>
            <p className="smhc-contact-phone">
              Prefer to talk? <a href="tel:+10000000000">(000) 000-0000</a>
            </p>
          </div>
          <div className="smhc-contact-card">
            <LeadForm idPrefix="contact" {...formProps} />
          </div>
        </div>
      </section>

      <footer className="smhc-footer">
        <div className="smhc-container">
          <p className="smhc-foot-name">Cash Home Offer</p>
          <p className="smhc-foot-fine">
            [Business name / license placeholder] &middot; San Diego, California
          </p>
          <p className="smhc-foot-fine">
            This site is a lead-generation service that connects homeowners with
            independent, third-party cash buyers; it does not purchase homes
            directly. Cash offers are typically below full market value in exchange
            for speed and convenience. This is not a solicitation for a listing
            agreement. [Licensed real estate agent disclosure — placeholder,
            pending broker guidance.]
          </p>
          <p className="smhc-foot-fine">
            &copy; {new Date().getFullYear()} Cash Home Offer. All rights reserved.
          </p>
        </div>
      </footer>

      <style>{`
        #smhc-wrap { overflow-x: hidden; background: #ffffff; }
        .smhc-container { max-width: 1120px; margin: 0 auto; padding: 0 20px; }

        /* Header — white with bottom hairline */
        .smhc-header { background: #ffffff; position: sticky; top: 0; z-index: 50; border-bottom: 1px solid #e6e9ec; }
        .smhc-header-inner { display: flex; align-items: center; justify-content: space-between; height: 64px; }
        .smhc-logo { font-family: 'Cormorant Garamond', serif; font-weight: 700; font-size: 24px; color: #296190; letter-spacing: 0.3px; }
        .smhc-phone { background: #296190; color: #ffffff !important; text-decoration: none; font-weight: 500; padding: 9px 18px; border-radius: 6px; transition: background .2s; }
        .smhc-phone:hover { background: #21506f; color: #ffffff !important; }

        /* Hero — white background */
        .smhc-hero { background: #ffffff; padding: 56px 0 60px; }
        .smhc-hero-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 44px; align-items: center; }
        .smhc-hero-copy { color: #1c2b33; }
        .smhc-eyebrow { display: inline-block; text-transform: uppercase; letter-spacing: 2.5px; font-size: 12px; font-weight: 600; color: #296190; margin-bottom: 14px; }
        .smhc-hero-copy h1 { color: #1c2b33; font-size: clamp(32px, 5vw, 52px); line-height: 1.15; }
        .smhc-sub { color: #4a5a62; font-size: 18px; line-height: 1.7; letter-spacing: .2px; margin: 18px 0 22px; max-width: 520px; }
        .smhc-hero-list { list-style: none; padding: 0; margin: 0; color: #1c2b33; }
        .smhc-hero-list li { position: relative; padding-left: 30px; margin-bottom: 12px; font-size: 16px; }
        .smhc-hero-list li::before { content: "\\2713"; position: absolute; left: 0; top: 0; color: #296190; font-weight: 700; }

        /* Form cards — white with soft shadow + blue accent */
        .smhc-hero-card, .smhc-contact-card { background: #ffffff; border: 1px solid #e6e9ec; border-radius: 12px; padding: 26px; box-shadow: 0 12px 32px rgba(20,40,60,.10); border-top: 3px solid #296190; }
        .smhc-card-title { color: #1c2b33; font-size: 26px; text-align: center; margin-bottom: 16px; }

        /* Form fields — grey at rest, blue glow on focus (Facebook-style) */
        .smhc-form { display: block; }
        .smhc-field { margin-bottom: 14px; }
        .smhc-field label { display: block; font-size: 13px; font-weight: 500; color: #4a5a62; margin-bottom: 5px; letter-spacing: .2px; }
        .smhc-field input, .smhc-field select { width: 100%; padding: 12px 13px; border: 1px solid #d5dbdf; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 15px; color: #1c2b33; background: #fff; transition: border-color .15s, box-shadow .15s; }
        .smhc-field input:focus, .smhc-field select:focus { outline: none; border-color: #296190; box-shadow: 0 0 0 3px rgba(41,97,144,.18); }
        .smhc-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        /* CTA — solid blue, white text */
        .smhc-cta { width: 100%; margin-top: 8px; padding: 15px 20px; background: #296190; color: #fff; border: 0; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 17px; font-weight: 600; letter-spacing: .3px; cursor: pointer; transition: background .2s; }
        .smhc-cta:hover { background: #21506f; }
        .smhc-cta:disabled { opacity: .6; cursor: default; }
        .smhc-note { margin: 12px 0 0; padding: 10px 12px; border-radius: 6px; font-size: 14px; }
        .smhc-note-ok { background: #e7f4ec; color: #1c5b34; }
        .smhc-note-err { background: #fbeaea; color: #8a2020; }
        .smhc-fineprint { font-size: 12px; color: #6a7a82; text-align: center; margin: 12px 0 0; }

        /* Trust bar — light grey */
        .smhc-trust { background: #f5f7f9; border-top: 1px solid #e6e9ec; border-bottom: 1px solid #e6e9ec; }
        .smhc-trust-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; padding: 30px 20px; text-align: center; }
        .smhc-trust-num { display: block; font-family: 'Cormorant Garamond', serif; font-size: 34px; font-weight: 700; color: #296190; }
        .smhc-trust-label { display: block; font-size: 14px; color: #6a7a82; margin-top: 4px; }

        /* Sections — white, alt = light grey */
        .smhc-section { padding: 64px 0; background: #ffffff; }
        .smhc-section-alt { background: #f5f7f9; }
        .smhc-eyebrow-dark { color: #296190; }
        .smhc-h2 { font-size: clamp(28px, 4vw, 42px); color: #1c2b33; margin-bottom: 34px; }

        /* Steps — white cards, blue number badges */
        .smhc-steps { display: grid; grid-template-columns: repeat(3,1fr); gap: 24px; }
        .smhc-step { background: #ffffff; border: 1px solid #e6e9ec; border-radius: 10px; padding: 28px 24px; }
        .smhc-step-num { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 50%; background: #296190; color: #fff; font-family: 'Cormorant Garamond', serif; font-size: 22px; font-weight: 700; margin-bottom: 14px; }
        .smhc-step h3 { font-size: 23px; color: #1c2b33; }
        .smhc-step p { color: #6a7a82; font-size: 15px; margin: 0; }

        /* Comparison table — white, light header, blue-tinted winning column */
        .smhc-table-wrap { overflow-x: auto; border-radius: 10px; border: 1px solid #e6e9ec; }
        .smhc-table { width: 100%; border-collapse: collapse; background: #fff; min-width: 520px; }
        .smhc-table th, .smhc-table td { padding: 15px 18px; text-align: left; border-bottom: 1px solid #e6e9ec; font-size: 15px; }
        .smhc-table thead th { background: #f5f7f9; color: #4a5a62; font-weight: 500; letter-spacing: .2px; }
        .smhc-table thead th.smhc-th-hi { background: #296190; color: #ffffff; }
        .smhc-table tbody th { font-weight: 500; color: #1c2b33; }
        .smhc-table td.smhc-hi { background: #eaf1f7; font-weight: 600; color: #21506f; }
        .smhc-disclaimer { font-size: 13.5px; color: #6a7a82; margin-top: 18px; max-width: 760px; line-height: 1.7; }

        /* FAQ — white with blue + icon */
        .smhc-faq-container { max-width: 820px; }
        .smhc-faq { border: 1px solid #e6e9ec; border-radius: 8px; margin-bottom: 12px; background: #fff; overflow: hidden; }
        .smhc-faq summary { cursor: pointer; padding: 18px 52px 18px 20px; font-size: 17px; font-weight: 500; color: #1c2b33; position: relative; list-style: none; line-height: 1.7; letter-spacing: .2px; }
        .smhc-faq summary::-webkit-details-marker { display: none; }
        .smhc-faq summary::after { content: "+"; position: absolute; right: 20px; top: 50%; transform: translateY(-50%); font-size: 26px; font-weight: 300; color: #296190; transition: transform .25s; line-height: 1; }
        .smhc-faq[open] summary::after { transform: translateY(-50%) rotate(45deg); }
        .smhc-faq-body { padding: 0 20px 20px; }
        .smhc-faq-body p { margin: 0; color: #6a7a82; font-size: 15.5px; line-height: 1.8; }

        /* Contact — light grey (not dark), blue CTA carries the action */
        .smhc-contact { background: #f5f7f9; padding: 64px 0; border-top: 1px solid #e6e9ec; }
        .smhc-contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 44px; align-items: center; }
        .smhc-contact-copy h2 { color: #1c2b33; font-size: clamp(28px, 4vw, 42px); }
        .smhc-contact-copy p { color: #4a5a62; font-size: 17px; line-height: 1.75; }
        .smhc-contact-phone a { color: #296190 !important; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
        .smhc-contact-card { border-top-color: #296190; }

        /* Footer — clean white with top hairline */
        .smhc-footer { background: #ffffff; padding: 36px 0; border-top: 1px solid #e6e9ec; }
        .smhc-foot-name { font-family: 'Cormorant Garamond', serif; font-size: 22px; color: #296190; margin: 0 0 8px; }
        .smhc-foot-fine { color: #6a7a82; font-size: 13px; line-height: 1.7; margin: 0 0 8px; max-width: 720px; }

        @media (max-width: 860px) {
          .smhc-hero-grid, .smhc-contact-grid { grid-template-columns: 1fr; gap: 32px; }
          .smhc-steps { grid-template-columns: 1fr; }
          .smhc-trust-grid { grid-template-columns: 1fr; gap: 24px; }
          .smhc-hero { padding: 40px 0 48px; }
          .smhc-section { padding: 48px 0; }
        }
      `}</style>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [
            { '@type': 'WebSite', '@id': 'https://www.sellmyhomesforcash.com/#website', url: 'https://www.sellmyhomesforcash.com/', name: 'Cash Home Offer' },
            { '@type': 'WebPage', '@id': 'https://www.sellmyhomesforcash.com/#webpage', url: 'https://www.sellmyhomesforcash.com/', name: 'Sell My Home Fast For Cash | No Fees, No Repairs', isPartOf: { '@id': 'https://www.sellmyhomesforcash.com/#website' }, description: 'Get a fair, no-obligation cash offer on your home. Sell as-is with no repairs, no showings, and no agent fees.' },
            { '@type': 'FAQPage', '@id': 'https://www.sellmyhomesforcash.com/#faq', mainEntity: [
              { '@type': 'Question', name: 'How fast can I sell my house for cash in San Diego?', acceptedAnswer: { '@type': 'Answer', text: 'Most San Diego homeowners are matched with a cash buyer and receive an offer within 24 hours, and can close in as little as 7 days. These are cash buyers with no lender or financing contingency, so the timeline is far faster than a traditional sale.' } },
              { '@type': 'Question', name: 'Do I need to make repairs before selling my house?', acceptedAnswer: { '@type': 'Answer', text: 'No. You sell completely as-is with no cleaning, staging, contractor work, or inspections. Whether the home needs cosmetic updates or major repairs, you can leave behind anything you do not want to take.' } },
              { '@type': 'Question', name: 'How do you determine the cash offer for my house?', acceptedAnswer: { '@type': 'Answer', text: 'Cash buyers in our network base their offer on your home location, size, and condition, plus recent comparable San Diego sales, minus the cost of any work needed to bring it to market. You see how the number was reached.' } },
              { '@type': 'Question', name: 'Are there any fees or commissions when selling my house?', acceptedAnswer: { '@type': 'Answer', text: 'There are no agent commissions and no listing fees to work with our service. You also skip repairs, staging, and months of carrying costs. Any standard closing costs are explained up front.' } },
              { '@type': 'Question', name: 'Why choose a cash home buyer instead of listing with a real estate agent?', acceptedAnswer: { '@type': 'Answer', text: 'A traditional listing often brings a higher price when you have time and a move-in-ready home. A cash sale trades some price for speed, certainty, and convenience, which makes the most sense when you need to sell quickly or the home needs work.' } },
              { '@type': 'Question', name: 'What types of properties can be sold this way?', acceptedAnswer: { '@type': 'Answer', text: 'Cash buyers in our network purchase single-family homes, townhomes, condos, multi-unit buildings, and more, in nearly any condition, including inherited homes, rentals with tenants, and properties facing foreclosure.' } },
              { '@type': 'Question', name: 'Are cash buyers available throughout San Diego County?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Our network of cash buyers covers San Diego County, from the coast to inland communities, and we can connect you for a no-obligation cash offer on properties throughout the county.' } },
              { '@type': 'Question', name: 'How does the cash home buying process work?', acceptedAnswer: { '@type': 'Answer', text: 'Three steps: share details about your home and timeline, get matched with a cash buyer who presents a fair offer often within 24 hours, and if you accept, choose your closing date. No showings, no repairs, and no obligation.' } },
              { '@type': 'Question', name: 'Is there any obligation to accept your offer?', acceptedAnswer: { '@type': 'Answer', text: 'None. Requesting an offer is free with no pressure to accept any offer from a buyer in our network, and if it is not the right fit we can point you toward other options.' } },
              { '@type': 'Question', name: 'How much is my home worth?', acceptedAnswer: { '@type': 'Answer', text: 'The best way to find out is to request a free, no-obligation offer. We connect you with cash buyers who review your home details and recent comparable San Diego sales and share a fair figure.' } },
            ] },
          ],
        }) }}
      />
    </div>
  );
}
