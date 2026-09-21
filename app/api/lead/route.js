import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';

// Only these fields may be written from the step-2 details page.
const DETAIL_FIELDS = [
  'property_type', 'beds', 'baths', 'sqft', 'year_built',
  'condition_detail', 'major_issues', 'recent_updates',
  'occupancy', 'lease_status', 'reason_selling',
  'mortgage_status', 'foreclosure', 'liens_taxes', 'probate',
  'best_time', 'contact_pref', 'details_notes',
];

// STEP 1 — create the lead, return its id so the details page can update it.
export async function POST(request) {
  try {
    const body = await request.json();

    if (body.company) return NextResponse.json({ ok: true }); // honeypot

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

    const { data, error } = await supabaseAdmin
      .from('leads')
      .insert({
        name, phone, email, address, timeline, condition,
        source: 'landing',
        user_agent: request.headers.get('user-agent') || '',
      })
      .select('id')
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json(
        { ok: false, error: 'Could not save. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('Lead route error:', e);
    return NextResponse.json(
      { ok: false, error: 'Something went wrong.' },
      { status: 500 }
    );
  }
}

// STEP 2 — update the same lead row with detail answers (all optional).
export async function PATCH(request) {
  try {
    const body = await request.json();
    const id = (body.id || '').toString();

    if (!/^[0-9a-f-]{20,40}$/i.test(id)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid request.' },
        { status: 400 }
      );
    }

    const update = {};
    for (const key of DETAIL_FIELDS) {
      if (body[key] != null && body[key] !== '') {
        update[key] = body[key].toString().trim().slice(0, 500);
      }
    }
    update.details_completed = true;

    const { error } = await supabaseAdmin
      .from('leads')
      .update(update)
      .eq('id', id);

    if (error) {
      console.error('Supabase detail update error:', error);
      return NextResponse.json(
        { ok: false, error: 'Could not save details.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Detail route error:', e);
    return NextResponse.json(
      { ok: false, error: 'Something went wrong.' },
      { status: 500 }
    );
  }
}
