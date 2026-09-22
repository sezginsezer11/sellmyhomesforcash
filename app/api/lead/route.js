import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';

const DETAIL_FIELDS = [
  'property_type', 'beds', 'baths', 'sqft', 'year_built',
  'condition_detail', 'major_issues', 'recent_updates',
  'occupancy', 'lease_status', 'reason_selling',
  'mortgage_status', 'foreclosure', 'liens_taxes', 'probate',
  'best_time', 'contact_pref', 'details_notes',
];
const SENSITIVE = ['mortgage_status', 'foreclosure', 'liens_taxes'];
// Public prefill/read: non-sensitive detail fields + stage (for the tracker).
const PREFILL_FIELDS = DETAIL_FIELDS.filter((f) => !SENSITIVE.includes(f)).concat(['stage']);

function validId(id) { return /^[0-9a-f-]{20,40}$/i.test(id || ''); }

// Verify the caller is a logged-in Supabase user (admin). Returns user or null.
async function requireUser(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// STEP 1 — create the lead.
export async function POST(request) {
  try {
    const body = await request.json();
    if (body.company) return NextResponse.json({ ok: true });

    const name = (body.name || '').toString().trim().slice(0, 120);
    const phone = (body.phone || '').toString().trim().slice(0, 40);
    const email = (body.email || '').toString().trim().slice(0, 160);
    const address = (body.address || '').toString().trim().slice(0, 300);
    const timeline = (body.timeline || '').toString().trim().slice(0, 60);
    const condition = (body.condition || '').toString().trim().slice(0, 60);
    const heard_about = (body.heard_about || '').toString().trim().slice(0, 60);

    if (!name || (!phone && !email) || !address) {
      return NextResponse.json({ ok: false, error: 'Missing required fields.' }, { status: 400 });
    }
    const insert = {
      name, phone, email, address, timeline, condition, heard_about,
      source: 'landing', stage: 1,
      user_agent: request.headers.get('user-agent') || '',
    };
    // Property facts pulled from Redfin on page 1 (all optional).
    for (const k of ['property_type', 'sqft', 'beds', 'baths', 'year_built']) {
      if (body[k] != null && body[k] !== '') insert[k] = body[k].toString().trim().slice(0, 60);
    }
    if (body.redfin_pulled) insert.redfin_pulled = true;

    const { data, error } = await supabaseAdmin
      .from('leads')
      .insert(insert)
      .select('id').single();
    if (error) {
      console.error('insert error:', error);
      return NextResponse.json({ ok: false, error: 'Could not save. Please try again.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('POST error:', e);
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}

// STEP 2 — auto-save details, callback requests (public, keyed by id).
export async function PATCH(request) {
  try {
    const body = await request.json();
    const id = (body.id || '').toString();
    if (!validId(id)) return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });

    const update = {};
    for (const key of DETAIL_FIELDS) {
      if (body[key] != null) update[key] = body[key].toString().trim().slice(0, 500);
    }
    if (body.callback_requested != null) {
      update.callback_requested = body.callback_requested.toString().trim().slice(0, 200);
    }
    if (body.finalize === true) update.details_completed = true;

    const { error } = await supabaseAdmin.from('leads').update(update).eq('id', id);
    if (error) {
      console.error('patch error:', error);
      return NextResponse.json({ ok: false, error: 'Could not save.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('PATCH error:', e);
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}

// GET — public prefill by id (non-sensitive + stage), OR admin list (with token).
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const adminList = url.searchParams.get('admin') === '1';

    if (adminList) {
      const user = await requireUser(request);
      if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
      const { data, error } = await supabaseAdmin
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 });
      return NextResponse.json({ ok: true, leads: data });
    }

    const id = url.searchParams.get('id') || '';
    if (!validId(id)) return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from('leads').select(PREFILL_FIELDS.join(',')).eq('id', id).single();
    if (error || !data) return NextResponse.json({ ok: true, data: {} });
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error('GET error:', e);
    return NextResponse.json({ ok: true, data: {} });
  }
}

// PUT — admin advances a lead's stage (requires auth token).
export async function PUT(request) {
  try {
    const user = await requireUser(request);
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();
    const id = (body.id || '').toString();
    const stage = parseInt(body.stage, 10);
    if (!validId(id) || !(stage >= 1 && stage <= 5)) {
      return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
    }
    const { error } = await supabaseAdmin.from('leads').update({ stage }).eq('id', id);
    if (error) return NextResponse.json({ ok: false, error: 'Update failed.' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('PUT error:', e);
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
