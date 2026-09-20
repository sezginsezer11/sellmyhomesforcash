import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';

export async function POST(request) {
  try {
    const body = await request.json();

    // Honeypot: bots fill hidden fields. If "company" has a value, drop silently.
    if (body.company) {
      return NextResponse.json({ ok: true });
    }

    const name = (body.name || '').toString().trim().slice(0, 120);
    const phone = (body.phone || '').toString().trim().slice(0, 40);
    const email = (body.email || '').toString().trim().slice(0, 160);
    const address = (body.address || '').toString().trim().slice(0, 300);
    const timeline = (body.timeline || '').toString().trim().slice(0, 60);
    const condition = (body.condition || '').toString().trim().slice(0, 60);

    if (!name || (!phone && !email) || !address) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields.' },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.from('leads').insert({
      name,
      phone,
      email,
      address,
      timeline,
      condition,
      source: 'landing',
      user_agent: request.headers.get('user-agent') || '',
    });

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json(
        { ok: false, error: 'Could not save. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Lead route error:', e);
    return NextResponse.json(
      { ok: false, error: 'Something went wrong.' },
      { status: 500 }
    );
  }
}
