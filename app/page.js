'use client';

import { useState, useRef, useEffect } from 'react';

export default function Home() {
  const [q, setQ] = useState('');
  const [sugg, setSugg] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selUrl, setSelUrl] = useState('');
  const timer = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const onType = (e) => {
    const val = e.target.value;
    setQ(val); setSelUrl('');
    if (timer.current) clearTimeout(timer.current);
    if (val.trim().length < 3) { setSugg([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch('/api/property?q=' + encodeURIComponent(val.trim()));
        const d = await r.json();
        setSugg(d.suggestions || []);
        setOpen((d.suggestions || []).length > 0);
      } catch { setSugg([]); setOpen(false); }
    }, 300);
  };

  const pick = (s) => { setQ(s.label); setSelUrl(s.url); setSugg([]); setOpen(false); };

  const submit = async (e) => {
    e.preventDefault();
    const addr = q.trim();
    if (!addr) { return; }
    setBusy(true);
    let facts = {};
    try {
      if (selUrl) {
        const r = await fetch('/api/property', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: selUrl }),
        });
        const d = await r.json();
        facts = d.facts || {};
      }
    } catch {}
    sessionStorage.setItem('smhc_address', addr);
    sessionStorage.setItem('smhc_facts', JSON.stringify(facts));
    window.location.href = '/get-offer';
  };

  const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); if (open && sugg[0]) pick(sugg[0]); else submit(e); } };

  return (
    <div id="h-wrap"><span id="top"></span>
      <header className="h-header">
        <div className="h-container h-header-in">
          <span className="h-logo">Cash&nbsp;Home&nbsp;Offer</span>
          <a className="h-phone" href="tel:+18584366585">(858) 436-6585</a>
        </div>
      </header>

      <section className="h-hero">
        <div className="h-hero-inner">
          <span className="h-eyebrow">A simpler way to sell</span>
          <h1>Sell Your House Fast to San Diego&rsquo;s Trusted Cash Buyers</h1>
          <p className="h-sub">Enter your address to receive competing, no-obligation
          cash offers &mdash; sell as-is, no repairs, no fees.</p>

          <form className="h-form" onSubmit={submit} autoComplete="off">
            <div className="h-ac" ref={boxRef}>
              <input
                type="text"
                placeholder="Enter your home address"
                value={q}
                onChange={onType}
                onKeyDown={onKey}
                onFocus={() => { if (sugg.length) setOpen(true); }}
                aria-label="Home address"
              />
              {open && (
                <ul className="h-suggest">
                  {sugg.map((s, i) => (
                    <li key={i} onClick={() => pick(s)}>{s.label}</li>
                  ))}
                </ul>
              )}
            </div>
            <button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Get My Offer'}</button>
          </form>
          <p className="h-fine">No obligation. Your information stays private and is never sold.</p>

          <ul className="h-trust">
            <li>Competing cash offers</li>
            <li>Sell as-is, any condition</li>
            <li>No fees or commissions</li>
          </ul>
        </div>
      </section>

      <section className="smhc-photoband" aria-label="Sell your house fast for cash in San Diego">
        <img src="/sell-my-house-fast-for-cash-san-diego.jpg"
          alt="Sell your house fast for cash in San Diego" loading="lazy" />
      </section>

      <section className="smhc-trust">
        <div className="smhc-container smhc-trust-grid">
          <div className="smhc-trust-item">
            <span className="smhc-trust-num">Fast</span>
            <span className="smhc-trust-label">Offers in about 48 hours</span>
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
          <p className="smhc-section-intro">
            Instead of a single take-it-or-leave-it offer, we bring your home to
            a network of vetted cash buyers who compete for it — so you can
            compare real offers and choose what works best for you. It&rsquo;s free to
            you, with no obligation at any step.
          </p>
          <div className="smhc-steps smhc-steps-5">
            <div className="smhc-step">
              <span className="smhc-step-num">1</span>
              <h3>Request your offer</h3>
              <p>Share a few details about your property and your timeline. It takes about two minutes, with no obligation.</p>
            </div>
            <div className="smhc-step">
              <span className="smhc-step-num">2</span>
              <h3>Discovery call</h3>
              <p>We&rsquo;ll have a friendly conversation to understand your home, your timing, and what matters most to you in a sale.</p>
            </div>
            <div className="smhc-step">
              <span className="smhc-step-num">3</span>
              <h3>Quick property visit</h3>
              <p>We visit and assess the home in person — no staging, no cleaning, no prep. Just as it is today.</p>
            </div>
            <div className="smhc-step">
              <span className="smhc-step-num">4</span>
              <h3>Investors compete</h3>
              <p>Your home goes to our network of vetted cash buyers, who compete and put their best offers forward.</p>
            </div>
            <div className="smhc-step">
              <span className="smhc-step-num">5</span>
              <h3>Review offers &amp; choose</h3>
              <p>We present the offers side by side. You pick the one that fits best on price, timing, and terms — or list with Sez if that serves you better.</p>
            </div>
          </div>
          <p className="smhc-freenote">
            <strong>Free to you, and always your choice.</strong> There are no fees
            or commissions out of your pocket — the buyer covers closing costs and
            commissions. All terms stay negotiable, and you&rsquo;re never obligated to
            accept any offer.
          </p>
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
                <tr><th scope="row">Time to close</th><td className="smhc-hi">As little as 10–14 days</td><td>2–3 months</td></tr>
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
              an offer within 48 hours, and can close in as little as 10–14 days.
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
              <p>There are no agent commissions and no listing fees, and it&rsquo;s free
              to you as the seller — the buyer covers the costs, including standard
              closing costs. You also skip the typical costs of preparing a home for
              market: repairs, staging, and months of carrying costs. Everything is
              explained up front so there are no surprises.</p>
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
              single-family homes, townhomes, condos, and multi-unit buildings — in
              <strong>any condition</strong>, including homes needing major repairs
              or with fire or other serious damage. This works especially well for
              inherited and probate homes, properties facing foreclosure, and
              tired landlords with tenant-occupied rentals. You never clean, repair,
              or fix anything.</p>
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
              (typically within 48 hours), and if you accept, choose your closing date.
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

      <section className="smhc-section smhc-section-alt" id="about">
        <div className="smhc-container smhc-about">
          <span className="smhc-eyebrow smhc-eyebrow-dark">Who&rsquo;s behind this</span>
          <h2 className="smhc-h2">A Local Professional You Can Trust</h2>
          <p>
            This service is run by <strong>Sez Sezer</strong>, a San Diego real
            estate professional. Rather than handing you a single take-it-or-leave-it
            offer, Sez brings your home to a curated network of 10&ndash;20 vetted cash
            buyers and lets them compete — then helps you compare the offers and
            choose what&rsquo;s right for you. The goal is simple: make selling fast,
            straightforward, and free of pressure, whether you&rsquo;re dealing with an
            inherited property, a difficult tenant situation, a looming deadline, or
            simply want to skip the repairs and showings of a traditional sale.
          </p>
          <p className="smhc-about-cred">
            Sez Sezer &middot; Keller Williams Realty &middot; DRE#&nbsp;01988197
          </p>
        </div>
      </section>

      <section className="smhc-contact" id="contact">
        <div className="smhc-container smhc-contact-cta">
          <h2>Ready for Your Cash Offer?</h2>
          <p>Enter your address to get competing, no-obligation cash offers from
          our vetted buyer network — fast. No repairs, no showings, no agent fees.</p>
          <div className="smhc-cta-row">
            <a href="#top" className="smhc-cta-btn"
              onClick={(e)=>{e.preventDefault();window.scrollTo({top:0,behavior:'smooth'});}}>
              Get My Offer
            </a>
            <span className="smhc-cta-or">or call <a href="tel:+18584366585">(858) 436-6585</a></span>
          </div>
        </div>
      </section>

      <footer className="smhc-footer">
        <div className="smhc-container">
          <p className="smhc-foot-name">Cash Home Offer</p>
          <p className="smhc-foot-fine">
            Sez Sezer &middot; Keller Williams Realty &middot; DRE#&nbsp;01988197 &middot; San Diego, California &middot; <a href="tel:+18584366585">(858) 436-6585</a>
          </p>
          <p className="smhc-foot-fine">
            This site is a lead-generation service that connects homeowners with
            independent, third-party cash buyers; it does not purchase homes
            directly. Cash offers are typically below full market value in exchange
            for speed and convenience. This is not a solicitation for a listing
            agreement.
          </p>
          <p className="smhc-foot-fine">
            &copy; {new Date().getFullYear()} Cash Home Offer. All rights reserved.
          </p>
        </div>
      </footer>

      <style>{`
        #h-wrap { min-height: 100vh; background: #ffffff; font-family: 'Jost',system-ui,sans-serif; color: #1c2b33; }
        .h-container, .h-hero-inner { max-width: 900px; margin: 0 auto; padding: 0 20px; }
        .h-header { border-bottom: 1px solid #e6e9ec; }
        .h-header-in { display: flex; align-items: center; justify-content: space-between; height: 64px; max-width: 1120px; }
        .h-logo { font-family: 'Cormorant Garamond',serif; font-weight: 700; font-size: 24px; color: #296190; }
        .h-phone { background: #296190; color: #fff; text-decoration: none; font-weight: 500; padding: 9px 18px; border-radius: 6px; }
        .h-phone:hover { background: #21506f; }
        .h-hero { min-height: calc(100vh - 64px); display: flex; align-items: center; background: linear-gradient(180deg,#ffffff 0%,#f5f7f9 100%); }
        .h-hero-inner { text-align: center; padding-top: 40px; padding-bottom: 60px; }
        .h-eyebrow { display: inline-block; text-transform: uppercase; letter-spacing: 2.5px; font-size: 12px; font-weight: 600; color: #296190; margin-bottom: 16px; }
        .h-hero h1 { font-family: 'Cormorant Garamond',serif; font-weight: 600; font-size: clamp(34px,6vw,60px); line-height: 1.1; color: #1c2b33; margin: 0 0 18px; letter-spacing: -0.5px; }
        .h-sub { font-size: 19px; line-height: 1.65; color: #4a5a62; max-width: 560px; margin: 0 auto 30px; }
        .h-form { display: flex; gap: 10px; max-width: 620px; margin: 0 auto; }
        .h-form input { flex: 1; padding: 17px 18px; border: 1.5px solid #d5dbdf; border-radius: 8px; font-family: 'Jost',sans-serif; font-size: 17px; color: #1c2b33; }
        .h-form input:focus { outline: none; border-color: #296190; box-shadow: 0 0 0 3px rgba(41,97,144,.18); }
        .h-form button { padding: 17px 30px; background: #296190; color: #fff; border: 0; border-radius: 8px; font-family: 'Jost',sans-serif; font-size: 17px; font-weight: 600; cursor: pointer; white-space: nowrap; }
        .h-form button:hover { background: #21506f; }
        .h-form button:disabled { opacity: .6; cursor: default; }
        .h-ac { position: relative; flex: 1; }
        .h-ac input { width: 100%; box-sizing: border-box; }
        .h-suggest { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: #fff; border: 1px solid #e6e9ec; border-radius: 8px; box-shadow: 0 12px 32px rgba(20,40,60,.18); list-style: none; margin: 0; padding: 6px; z-index: 50; text-align: left; }
        .h-suggest li { padding: 11px 12px; border-radius: 6px; cursor: pointer; font-size: 15px; color: #1c2b33; }
        .h-suggest li:hover { background: #f0f4f7; color: #296190; }
        .h-fine { font-size: 13px; color: #8a9aa2; margin: 14px 0 0; }
        .h-trust { list-style: none; display: flex; gap: 26px; justify-content: center; flex-wrap: wrap; padding: 0; margin: 34px 0 0; }
        .h-trust li { position: relative; padding-left: 26px; font-size: 15px; color: #1c2b33; }
        .h-trust li::before { content: "\\2713"; position: absolute; left: 0; color: #296190; font-weight: 700; }
        /* Google autocomplete dropdown above everything */
        .pac-container { z-index: 10000; border-radius: 8px; margin-top: 4px; box-shadow: 0 12px 32px rgba(20,40,60,.18); border: 1px solid #e6e9ec; font-family: 'Jost',sans-serif; }
        @media (max-width: 600px) { .h-form { flex-direction: column; } .h-form button { width: 100%; } }
      

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

        /* Photo band — full-width image strip below hero */
        .smhc-photoband { width: 100%; line-height: 0; }
        .smhc-photoband img { width: 100%; height: auto; max-height: 460px; object-fit: cover; display: block; }
        @media (max-width: 860px) { .smhc-photoband img { max-height: 260px; } }

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
        .smhc-steps-5 { grid-template-columns: repeat(5,1fr); gap: 16px; }
        .smhc-section-intro { max-width: 720px; margin: -18px 0 30px; color: #4a5a62; font-size: 17px; line-height: 1.75; }
        .smhc-freenote { margin: 26px 0 0; padding: 16px 20px; background: #eaf1f7; border-left: 3px solid #296190; border-radius: 6px; color: #21506f; font-size: 15px; line-height: 1.7; }
        .smhc-freenote strong { color: #1c2b33; }
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

        /* About section */
        .smhc-about { max-width: 780px; }
        .smhc-about p { color: #4a5a62; font-size: 17px; line-height: 1.8; margin: 0 0 16px; }
        .smhc-about-cred { font-size: 15px !important; color: #21506f !important; font-weight: 500; border-top: 1px solid #d8ddd9; padding-top: 16px; }

        /* Contact — light grey (not dark), blue CTA carries the action */
        .smhc-contact { background: #f5f7f9; padding: 64px 0; border-top: 1px solid #e6e9ec; }
        .smhc-contact-cta { text-align: center; max-width: 640px; }
        .smhc-contact-cta h2 { color: #1c2b33; font-size: clamp(28px, 4vw, 42px); margin-bottom: 12px; }
        .smhc-contact-cta p { color: #4a5a62; font-size: 17px; line-height: 1.75; margin: 0 auto 24px; }
        .smhc-cta-row { display: flex; align-items: center; justify-content: center; gap: 18px; flex-wrap: wrap; }
        .smhc-cta-btn { display: inline-block; background: #296190; color: #fff; text-decoration: none; padding: 15px 34px; border-radius: 8px; font-size: 17px; font-weight: 600; }
        .smhc-cta-btn:hover { background: #21506f; color: #fff; }
        .smhc-cta-or { color: #4a5a62; font-size: 15px; }
        .smhc-cta-or a { color: #296190; font-weight: 600; }

        /* Footer — clean white with top hairline */
        .smhc-footer { background: #ffffff; padding: 36px 0; border-top: 1px solid #e6e9ec; }
        .smhc-foot-name { font-family: 'Cormorant Garamond', serif; font-size: 22px; color: #296190; margin: 0 0 8px; }
        .smhc-foot-fine { color: #6a7a82; font-size: 13px; line-height: 1.7; margin: 0 0 8px; max-width: 720px; }
        .smhc-foot-fine a { color: #296190; text-decoration: none; }
        .smhc-foot-fine a:hover { text-decoration: underline; }

        @media (max-width: 1040px) and (min-width: 861px) {
          .smhc-steps-5 { grid-template-columns: repeat(3,1fr); }
        }
        @media (max-width: 860px) {
          .smhc-hero-grid { grid-template-columns: 1fr; gap: 32px; }
          .smhc-steps { grid-template-columns: 1fr; }
          .smhc-steps-5 { grid-template-columns: 1fr; }
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
            { '@type': 'ProfessionalService', '@id': 'https://www.sellmyhomesforcash.com/#business', name: 'Cash Home Offer — Sell My House Fast San Diego', url: 'https://www.sellmyhomesforcash.com/', telephone: '+1-858-436-6585', areaServed: { '@type': 'AdministrativeArea', name: 'San Diego County, California' }, description: 'A lead-generation service connecting San Diego homeowners with a network of vetted cash buyers who compete to make offers. Sell as-is, any condition, with no fees to the seller.', founder: { '@id': 'https://www.sellmyhomesforcash.com/#sez' } },
            { '@type': 'Person', '@id': 'https://www.sellmyhomesforcash.com/#sez', name: 'Sez Sezer', jobTitle: 'Real Estate Professional', telephone: '+1-858-436-6585', memberOf: { '@type': 'Organization', name: 'Keller Williams Realty' }, identifier: { '@type': 'PropertyValue', propertyID: 'California DRE License', value: '01988197' } },
            { '@type': 'WebPage', '@id': 'https://www.sellmyhomesforcash.com/#webpage', url: 'https://www.sellmyhomesforcash.com/', name: 'Sell My Home Fast For Cash | No Fees, No Repairs', isPartOf: { '@id': 'https://www.sellmyhomesforcash.com/#website' }, description: 'Get a fair, no-obligation cash offer on your home. Sell as-is with no repairs, no showings, and no agent fees.' },
            { '@type': 'FAQPage', '@id': 'https://www.sellmyhomesforcash.com/#faq', mainEntity: [
              { '@type': 'Question', name: 'How fast can I sell my house for cash in San Diego?', acceptedAnswer: { '@type': 'Answer', text: 'Most San Diego homeowners are matched with a cash buyer and receive an offer within 48 hours, and can close in as little as 10–14 days. These are cash buyers with no lender or financing contingency, so the timeline is far faster than a traditional sale.' } },
              { '@type': 'Question', name: 'Do I need to make repairs before selling my house?', acceptedAnswer: { '@type': 'Answer', text: 'No. You sell completely as-is with no cleaning, staging, contractor work, or inspections. Whether the home needs cosmetic updates or major repairs, you can leave behind anything you do not want to take.' } },
              { '@type': 'Question', name: 'How do you determine the cash offer for my house?', acceptedAnswer: { '@type': 'Answer', text: 'Cash buyers in our network base their offer on your home location, size, and condition, plus recent comparable San Diego sales, minus the cost of any work needed to bring it to market. You see how the number was reached.' } },
              { '@type': 'Question', name: 'Are there any fees or commissions when selling my house?', acceptedAnswer: { '@type': 'Answer', text: 'There are no agent commissions and no listing fees, and it is free to you as the seller — the buyer covers the costs, including standard closing costs. You also skip repairs, staging, and carrying costs.' } },
              { '@type': 'Question', name: 'Why choose a cash home buyer instead of listing with a real estate agent?', acceptedAnswer: { '@type': 'Answer', text: 'A traditional listing often brings a higher price when you have time and a move-in-ready home. A cash sale trades some price for speed, certainty, and convenience, which makes the most sense when you need to sell quickly or the home needs work.' } },
              { '@type': 'Question', name: 'What types of properties can be sold this way?', acceptedAnswer: { '@type': 'Answer', text: 'Cash buyers in our network purchase single-family homes, townhomes, condos, and multi-unit buildings in any condition, including homes with major or fire damage. It works well for inherited and probate homes, foreclosures, and tenant-occupied rentals.' } },
              { '@type': 'Question', name: 'Are cash buyers available throughout San Diego County?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Our network of cash buyers covers San Diego County, from the coast to inland communities, and we can connect you for a no-obligation cash offer on properties throughout the county.' } },
              { '@type': 'Question', name: 'How does the cash home buying process work?', acceptedAnswer: { '@type': 'Answer', text: 'Three steps: share details about your home and timeline, get matched with a cash buyer who presents a fair offer typically within 48 hours, and if you accept, choose your closing date. No showings, no repairs, and no obligation.' } },
              { '@type': 'Question', name: 'Is there any obligation to accept your offer?', acceptedAnswer: { '@type': 'Answer', text: 'None. Requesting an offer is free with no pressure to accept any offer from a buyer in our network, and if it is not the right fit we can point you toward other options.' } },
              { '@type': 'Question', name: 'How much is my home worth?', acceptedAnswer: { '@type': 'Answer', text: 'The best way to find out is to request a free, no-obligation offer. We connect you with cash buyers who review your home details and recent comparable San Diego sales and share a fair figure.' } },
            ] },
          ],
        }) }}
      />
    </div>
  );
}
