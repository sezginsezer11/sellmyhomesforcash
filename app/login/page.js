'use client';

import { useState, useEffect, Suspense } from 'react';
import { supabaseBrowser } from '../../lib/supabase-browser';

function LoginInner() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [mode, setMode] = useState('login'); // login | reset
  const [status, setStatus] = useState('idle');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [next, setNext] = useState('/my-offer');

  useEffect(() => {
    // already logged in? go straight to dashboard
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (data.session) window.location.href = '/my-offer';
    });
    const p = new URLSearchParams(window.location.search).get('next');
    if (p && p.startsWith('/')) setNext(p);
  }, []);

  const login = async (e) => {
    e.preventDefault(); setErr(''); setMsg(''); setStatus('working');
    const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password: pw });
    if (error) { setErr(error.message); setStatus('idle'); return; }
    window.location.href = next;
  };

  const sendReset = async (e) => {
    e.preventDefault(); setErr(''); setMsg(''); setStatus('working');
    const redirectTo = window.location.origin + '/login';
    const { error } = await supabaseBrowser.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) { setErr(error.message); setStatus('idle'); return; }
    setMsg('Check your email for a password reset link.'); setStatus('idle');
  };

  return (
    <div className="l-wrap">
      <header className="l-header">
        <div className="l-header-in">
          <a className="l-logo" href="/">Cash&nbsp;Home&nbsp;Offer</a>
          <a className="l-phone" href="tel:+18584366585">(858) 436-6585</a>
        </div>
      </header>

      <div className="l-center">
        <div className="l-card">
          <h1>{mode === 'login' ? 'Seller sign in' : 'Reset your password'}</h1>
          <p className="l-sub">
            {mode === 'login'
              ? 'Sign in to track your offer and see your dashboard.'
              : "Enter your email and we'll send you a reset link."}
          </p>

          <form onSubmit={mode === 'login' ? login : sendReset}>
            <div className="l-field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete="email" required />
            </div>
            {mode === 'login' && (
              <div className="l-field">
                <label>Password</label>
                <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
                  autoComplete="current-password" required />
              </div>
            )}

            {err && <p className="l-err" role="alert">{err}</p>}
            {msg && <p className="l-msg">{msg}</p>}

            <button type="submit" className="l-btn" disabled={status === 'working'}>
              {status === 'working' ? 'Please wait…' : (mode === 'login' ? 'Sign in' : 'Send reset link')}
            </button>
          </form>

          {mode === 'login' ? (
            <div className="l-links">
              <button className="l-textbtn" onClick={() => { setMode('reset'); setErr(''); setMsg(''); }}>
                Forgot password?
              </button>
              <span className="l-sep">·</span>
              <a className="l-textbtn" href="/get-offer">Need an offer? Start here</a>
            </div>
          ) : (
            <div className="l-links">
              <button className="l-textbtn" onClick={() => { setMode('login'); setErr(''); setMsg(''); }}>
                ← Back to sign in
              </button>
            </div>
          )}
        </div>
        <p className="l-agent"><a href="/admin">Agent login</a></p>
      </div>

      <style>{css}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="l-wrap"><div className="l-center"><p>Loading…</p></div><style>{css}</style></div>}>
      <LoginInner />
    </Suspense>
  );
}

const css = `
  .l-wrap { min-height: 100vh; background: #f5f7f9; font-family: 'Jost',system-ui,sans-serif; color: #1c2b33; }
  .l-header { background: #fff; border-bottom: 1px solid #e6e9ec; }
  .l-header-in { max-width: 1080px; margin: 0 auto; padding: 0 20px; height: 64px; display: flex; align-items: center; justify-content: space-between; }
  .l-logo { font-family: 'Cormorant Garamond',serif; font-weight: 700; font-size: 22px; color: #296190; text-decoration: none; }
  .l-phone { background: #296190; color: #fff; text-decoration: none; font-weight: 500; padding: 9px 18px; border-radius: 6px; }
  .l-center { max-width: 440px; margin: 0 auto; padding: 48px 20px; }
  .l-card { background: #fff; border: 1px solid #e6e9ec; border-top: 4px solid #296190; border-radius: 12px; padding: 32px; box-shadow: 0 12px 32px rgba(20,40,60,.08); }
  .l-card h1 { font-family: 'Cormorant Garamond',serif; font-size: 28px; margin: 0 0 6px; }
  .l-sub { color: #6a7a82; font-size: 14.5px; margin: 0 0 22px; line-height: 1.5; }
  .l-field { margin-bottom: 16px; }
  .l-field label { display: block; font-size: 13px; font-weight: 500; color: #4a5a62; margin-bottom: 5px; }
  .l-field input { width: 100%; padding: 12px 13px; border: 1px solid #d5dbdf; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 15px; box-sizing: border-box; }
  .l-field input:focus { outline: none; border-color: #296190; box-shadow: 0 0 0 3px rgba(41,97,144,.18); }
  .l-btn { width: 100%; padding: 14px; background: #296190; color: #fff; border: 0; border-radius: 6px; font-family: 'Jost',sans-serif; font-size: 16px; font-weight: 600; cursor: pointer; margin-top: 4px; }
  .l-btn:hover { background: #21506f; }
  .l-btn:disabled { opacity: .6; cursor: default; }
  .l-err { background: #fbeaea; color: #8a2020; padding: 10px 12px; border-radius: 6px; font-size: 14px; margin: 0 0 12px; }
  .l-msg { background: #eef7f1; color: #1c5b34; padding: 10px 12px; border-radius: 6px; font-size: 14px; margin: 0 0 12px; }
  .l-links { margin-top: 18px; text-align: center; display: flex; gap: 8px; justify-content: center; align-items: center; flex-wrap: wrap; }
  .l-textbtn { background: none; border: 0; color: #296190; font-family: 'Jost',sans-serif; font-size: 14px; cursor: pointer; text-decoration: none; padding: 0; }
  .l-textbtn:hover { text-decoration: underline; }
  .l-sep { color: #c5ccd1; }
  .l-agent { text-align: center; margin-top: 18px; }
  .l-agent a { color: #9aa8b0; font-size: 13px; text-decoration: none; }
  .l-agent a:hover { color: #296190; text-decoration: underline; }
`;
