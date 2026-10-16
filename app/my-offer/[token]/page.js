'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import OfferDashboard, { dashCss } from '../../../components/OfferDashboard';

export default function MyOfferByToken() {
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
    return <div className="mo-wrap mo-center"><p className="mo-dim">Loading your offer…</p><style>{dashCss}</style></div>;
  }
  if (state === 'error') {
    return (
      <div className="mo-wrap mo-center">
        <div className="mo-card mo-narrow">
          <h1>We couldn't find this offer</h1>
          <p className="mo-dim">This link may be incorrect or expired. Please use the private link we sent you, or call us and we'll resend it.</p>
          <a className="mo-btn" href="tel:8584366585">Call (858) 436-6585</a>
        </div>
        <style>{dashCss}</style>
      </div>
    );
  }
  return <OfferDashboard d={d} />;
}
