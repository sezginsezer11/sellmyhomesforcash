'use client';

import { useState } from 'react';

const DEF = {
  price: '465000', reno: '30000', arv: '575000',
  dp: '20', rate: '11', orig: '2', close: '2',
  months: '3', sell: '4', agent: '2', tax: '1.15', ins: '0.03',
};

function num(v) {
  const n = parseFloat((v || '').toString().replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}
function money(n) {
  const neg = n < 0;
  n = Math.round(Math.abs(n));
  return (neg ? '-$' : '$') + n.toLocaleString('en-US');
}

export default function FixFlipCalculator() {
  const [f, setF] = useState(DEF);
  const up = (e) => setF((s) => ({ ...s, [e.target.id]: e.target.value }));
  const reset = () => setF(DEF);

  const P = num(f.price), RENO = num(f.reno), ARV = num(f.arv);
  const DP = num(f.dp) / 100, RATE = num(f.rate) / 100, ORIG = num(f.orig) / 100, CLOSE = num(f.close) / 100;
  const MONTHS = num(f.months), SELL = num(f.sell) / 100, AGENT = num(f.agent) / 100, TAX = num(f.tax) / 100, INS = num(f.ins) / 100;

  const dp = DP * P, loan = P - dp;
  const origFee = loan * ORIG, closing = P * CLOSE;
  const agentFee = P * AGENT;
  const closingAll = closing + agentFee;              // closing + buyer's agent
  const moMort = loan * RATE / 12;
  const moTax = P * TAX / 12;                          // monthly property tax
  const moIns = P * INS;                               // insurance entered as monthly rate
  const moCarry = moMort + moTax + moIns;
  const carry = moMort * MONTHS;                       // Necat carrying = mortgage * months
  const sellExp = ARV * SELL;

  // Total expenses except downpayment (Necat I15/I17): origination + closing + agent + repairs + carrying
  const expNoDp = origFee + closingAll + RENO + carry;
  // All cash out of pocket = expenses + downpayment
  const totalCashOut = expNoDp + dp;
  const totalCost = P + expNoDp;                       // full project cost (purchase + expenses)
  const net = ARV - totalCost - sellExp;              // net profit after sale
  const roi = totalCashOut > 0 ? net / totalCashOut * 100 : 0;
  const neg = net < 0;

  // per-field dollar helpers
  const d_tax = moTax;          // monthly
  const d_ins = moIns;          // monthly

  return (
    <div className="ff-page">
      <header className="ff-header">
        <div className="ff-head-in">
          <a className="ff-logo" href="/">Cash&nbsp;Home&nbsp;Offer</a>
          <a className="ff-phone" href="tel:+18584366585">(858) 436-6585</a>
        </div>
      </header>

      <div className="ff-wrap">
        <div className="ff-intro">
          <span className="ff-eyebrow">Investor tool</span>
          <h1>Fix &amp; Flip Calculator</h1>
          <p>Estimate your net profit, cash needed, and return on a flip. Pre-filled
          with an example &mdash; replace the numbers with your deal.</p>
        </div>

        <div className="ff-grid">
          <div className="ff-card">
            <h2>Your Deal</h2>
            <p className="ff-sub">Enter the property and financing details.</p>

            <div className="ff-group ff-green">
              <div className="ff-group-label green">The Property</div>
              <div className="ff-field"><label htmlFor="price">Purchase Price</label>
                <div className="ff-inwrap"><span className="pre">$</span><input className="money" id="price" value={f.price} onChange={up} inputMode="decimal" /></div></div>
              <div className="ff-field"><label htmlFor="reno">Renovation Cost</label>
                <div className="ff-inwrap"><span className="pre">$</span><input className="money" id="reno" value={f.reno} onChange={up} inputMode="decimal" /></div></div>
              <div className="ff-field"><label htmlFor="arv">After Repair Value (ARV)</label>
                <div className="ff-inwrap"><span className="pre">$</span><input className="money" id="arv" value={f.arv} onChange={up} inputMode="decimal" /></div></div>
            </div>

            <div className="ff-group">
              <div className="ff-group-label">Financing</div>
              <div className="ff-two">
                <div className="ff-field"><label htmlFor="dp">Down Payment</label>
                  <div className="ff-inwrap"><input className="pct" id="dp" value={f.dp} onChange={up} inputMode="decimal" /><span className="suf">%</span></div>
                  <div className="ff-dollar">= {money(dp)}</div></div>
                <div className="ff-field"><label htmlFor="rate">Interest Rate</label>
                  <div className="ff-inwrap"><input className="pct" id="rate" value={f.rate} onChange={up} inputMode="decimal" /><span className="suf">%</span></div>
                  <div className="ff-dollar">= {money(moMort)}/mo</div></div>
              </div>
              <div className="ff-two">
                <div className="ff-field"><label htmlFor="orig">Origination Points</label>
                  <div className="ff-inwrap"><input className="pct" id="orig" value={f.orig} onChange={up} inputMode="decimal" /><span className="suf">%</span></div>
                  <div className="ff-dollar">= {money(origFee)}</div></div>
                <div className="ff-field"><label htmlFor="close">Closing Costs</label>
                  <div className="ff-inwrap"><input className="pct" id="close" value={f.close} onChange={up} inputMode="decimal" /><span className="suf">%</span></div>
                  <div className="ff-dollar">= {money(closing)}</div></div>
              </div>
            </div>

            <div className="ff-group">
              <div className="ff-group-label">Holding &amp; Sale</div>
              <div className="ff-two">
                <div className="ff-field"><label htmlFor="months">Turnaround (months)</label>
                  <div className="ff-inwrap"><input id="months" value={f.months} onChange={up} inputMode="decimal" /></div>
                  <div className="ff-dollar">= {money(carry)} total</div></div>
                <div className="ff-field"><label htmlFor="sell">Selling Costs</label>
                  <div className="ff-inwrap"><input className="pct" id="sell" value={f.sell} onChange={up} inputMode="decimal" /><span className="suf">%</span></div>
                  <div className="ff-dollar">= {money(sellExp)}</div></div>
              </div>
              <div className="ff-two">
                <div className="ff-field"><label htmlFor="agent">Buyer&rsquo;s Agent Fee</label>
                  <div className="ff-inwrap"><input className="pct" id="agent" value={f.agent} onChange={up} inputMode="decimal" /><span className="suf">%</span></div>
                  <div className="ff-dollar">= {money(agentFee)}</div></div>
                <div className="ff-field"><label htmlFor="tax">Property Tax (monthly)</label>
                  <div className="ff-inwrap"><input className="pct" id="tax" value={f.tax} onChange={up} inputMode="decimal" /><span className="suf">%</span></div>
                  <div className="ff-dollar">= {money(d_tax)}/mo</div></div>
              </div>
              <div className="ff-field ff-half"><label htmlFor="ins">Insurance (monthly)</label>
                <div className="ff-inwrap"><input className="pct" id="ins" value={f.ins} onChange={up} inputMode="decimal" /><span className="suf">%</span></div>
                <div className="ff-dollar">= {money(d_ins)}/mo</div></div>
            </div>

            <button className="ff-reset" type="button" onClick={reset}>Reset to example</button>
          </div>

          <div className="ff-card">
            <h2>Your Results</h2>
            <p className="ff-sub">Updates live as you type.</p>

            <div className={'ff-headline' + (neg ? ' neg' : '')}>
              <div className="ff-hl-lab">Net Profit After Sale</div>
              <div className="ff-hl-val">{money(net)}</div>
              <div className="ff-hl-roi">
                Return on cash invested: {totalCashOut > 0 ? roi.toFixed(1) : '0'}%
                &nbsp;&middot;&nbsp; Cash needed: {money(totalCashOut)}
              </div>
            </div>

            <div className="ff-metrics">
              <div className="ff-metric"><div className="m-lab">Downpayment</div><div className="m-val">{money(dp)}</div></div>
              <div className="ff-metric"><div className="m-lab">Closing Costs <span className="m-note">incl. agent</span></div><div className="m-val">{money(closingAll)}</div></div>
              <div className="ff-metric"><div className="m-lab">Repair Costs</div><div className="m-val">{money(RENO)}</div></div>
              <div className="ff-metric ff-metric-total"><div className="m-lab">Total Cost &amp; Expenses</div><div className="m-val">{money(totalCashOut)}</div></div>
            </div>

            <div className="ff-itemized">
              <div className="ff-item-head">Expenses breakdown <span>(excludes downpayment)</span></div>
              <div className="ff-line"><span className="l">Origination fee</span><span className="v">{money(origFee)}</span></div>
              <div className="ff-line"><span className="l">Closing costs</span><span className="v">{money(closing)}</span></div>
              <div className="ff-line"><span className="l">Buyer&rsquo;s agent fee</span><span className="v">{money(agentFee)}</span></div>
              <div className="ff-line"><span className="l">Repair costs</span><span className="v">{money(RENO)}</span></div>
              <div className="ff-line"><span className="l">Carrying cost ({MONTHS} mo)</span><span className="v">{money(carry)}</span></div>
              <div className="ff-line subtot"><span className="l">Total expenses</span><span className="v">{money(expNoDp)}</span></div>
              <div className="ff-line"><span className="l">+ Downpayment</span><span className="v">{money(dp)}</span></div>
              <div className="ff-line total"><span className="l">Total cash out of pocket</span><span className="v">{money(totalCashOut)}</span></div>
            </div>

            <div className="ff-sale">
              <div className="ff-line"><span className="l">After Repair Value</span><span className="v">{money(ARV)}</span></div>
              <div className="ff-line"><span className="l">&minus; Total project cost</span><span className="v">{money(totalCost)}</span></div>
              <div className="ff-line"><span className="l">&minus; Selling costs</span><span className="v">{money(sellExp)}</span></div>
              <div className="ff-line total"><span className="l">Net Profit</span><span className="v">{money(net)}</span></div>
            </div>
          </div>
        </div>

        <div className="ff-cta"><a href="/">Thinking of selling instead? Get a cash offer &rarr;</a></div>

        <p className="ff-disclaimer">This calculator is for estimation and educational
        purposes only and does not constitute financial, investment, tax, or legal
        advice. Actual costs, taxes, rates, and sale proceeds vary. Verify all figures
        independently before making any investment decision.</p>
      </div>

      <style>{`
        .ff-page { min-height: 100vh; background: #f5f7f9; font-family: 'Jost',system-ui,sans-serif; color: #1c2b33; line-height: 1.6; }
        .ff-header { background: #fff; border-bottom: 1px solid #e6e9ec; }
        .ff-head-in { max-width: 1080px; margin: 0 auto; padding: 0 20px; height: 64px; display: flex; align-items: center; justify-content: space-between; }
        .ff-logo { font-family: 'Cormorant Garamond',serif; font-weight: 700; font-size: 22px; color: #296190; text-decoration: none; }
        .ff-phone { background: #296190; color: #fff; text-decoration: none; font-weight: 500; padding: 9px 18px; border-radius: 6px; }
        .ff-wrap { max-width: 1080px; margin: 0 auto; padding: 34px 20px 70px; }
        .ff-intro { text-align: center; max-width: 680px; margin: 0 auto 30px; }
        .ff-eyebrow { text-transform: uppercase; letter-spacing: 2.5px; font-size: 12px; font-weight: 600; color: #296190; }
        .ff-intro h1 { font-family: 'Cormorant Garamond',serif; font-weight: 600; font-size: clamp(30px,5vw,46px); margin: 10px 0 10px; letter-spacing: -.5px; }
        .ff-intro p { color: #4a5a62; font-size: 17px; margin: 0; }
        .ff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; align-items: start; }
        .ff-card { background: #fff; border: 1px solid #e6e9ec; border-top: 4px solid #296190; border-radius: 12px; padding: 26px; box-shadow: 0 12px 32px rgba(20,40,60,.07); }
        .ff-card h2 { font-family: 'Cormorant Garamond',serif; font-size: 24px; margin: 0 0 4px; }
        .ff-sub { color: #4a5a62; font-size: 13.5px; margin: 0 0 18px; }
        .ff-group { margin-bottom: 22px; }
        .ff-green { background: #eef7f1; border: 1px solid #cfe6d8; border-radius: 10px; padding: 16px 16px 6px; }
        .ff-group-label { font-size: 11px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: #296190; margin-bottom: 10px; border-bottom: 1px solid #e6e9ec; padding-bottom: 6px; }
        .ff-group-label.green { color: #1c5b34; border-bottom-color: #cfe6d8; }
        .ff-field { margin-bottom: 13px; }
        .ff-field.ff-half { width: calc(50% - 6px); }
        .ff-field label { display: block; font-size: 13px; font-weight: 500; color: #4a5a62; margin-bottom: 5px; }
        .ff-inwrap { position: relative; }
        .ff-inwrap .pre { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #8a9aa2; font-size: 15px; pointer-events: none; }
        .ff-inwrap .suf { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: #8a9aa2; font-size: 15px; pointer-events: none; }
        .ff-field input { width: 100%; padding: 11px 12px; border: 1px solid #d5dbdf; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 15px; color: #1c2b33; background: #fff; box-sizing: border-box; }
        .ff-field input.money { padding-left: 26px; }
        .ff-field input.pct { padding-right: 28px; }
        .ff-field input:focus { outline: none; border-color: #296190; box-shadow: 0 0 0 3px rgba(41,97,144,.18); }
        .ff-dollar { font-size: 12px; color: #6a8574; margin-top: 5px; font-weight: 500; text-align: right; }
        .ff-two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .ff-reset { background: none; border: 1px solid #d5dbdf; color: #4a5a62; padding: 9px 16px; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 14px; cursor: pointer; margin-top: 4px; }
        .ff-reset:hover { border-color: #296190; color: #296190; }
        .ff-headline { background: #eef7f1; border: 1px solid #cfe6d8; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 18px; }
        .ff-headline.neg { background: #fbeaea; border-color: #f0cccc; }
        .ff-hl-lab { font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #4a5a62; }
        .ff-hl-val { font-family: 'Cormorant Garamond',serif; font-size: 44px; font-weight: 700; color: #1c5b34; line-height: 1.1; margin-top: 4px; }
        .ff-headline.neg .ff-hl-val { color: #8a2020; }
        .ff-hl-roi { font-size: 14px; color: #4a5a62; margin-top: 6px; }
        .ff-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
        .ff-metric { background: #f5f7f9; border-radius: 8px; padding: 13px 14px; }
        .ff-metric-total { background: #eef7f1; border: 1px solid #cfe6d8; }
        .ff-metric .m-lab { font-size: 12px; color: #4a5a62; }
        .ff-metric .m-note { color: #8a9aa2; font-size: 11px; }
        .ff-metric .m-val { font-size: 20px; font-weight: 500; margin-top: 2px; }
        .ff-metric-total .m-val { color: #1c5b34; }
        .ff-itemized { background: #fafbfc; border: 1px solid #eef1f3; border-radius: 10px; padding: 14px 16px; margin-bottom: 16px; }
        .ff-item-head { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #296190; margin-bottom: 8px; }
        .ff-item-head span { text-transform: none; letter-spacing: 0; font-weight: 400; color: #8a9aa2; }
        .ff-sale { border-top: 1px solid #e6e9ec; padding-top: 6px; }
        .ff-line { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 0; font-size: 14px; border-bottom: 1px solid #f0f2f4; }
        .ff-line:last-child { border-bottom: 0; }
        .ff-line .l { color: #4a5a62; }
        .ff-line .v { font-weight: 500; }
        .ff-line.subtot { font-weight: 600; color: #1c2b33; border-top: 1px solid #e6e9ec; margin-top: 2px; padding-top: 8px; }
        .ff-line.total { font-weight: 600; color: #1c2b33; border-top: 1.5px solid #cfe6d8; margin-top: 4px; padding-top: 10px; font-size: 15px; }
        .ff-disclaimer { color: #8a9aa2; font-size: 12px; line-height: 1.7; max-width: 900px; margin: 28px auto 0; text-align: center; }
        .ff-cta { text-align: center; margin-top: 30px; }
        .ff-cta a { display: inline-block; background: #296190; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; }
        .ff-cta a:hover { background: #21506f; }
        @media (max-width: 820px) { .ff-grid { grid-template-columns: 1fr; } .ff-field.ff-half { width: 100%; } }
      `}</style>
    </div>
  );
}
