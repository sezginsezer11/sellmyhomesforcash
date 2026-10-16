import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import crypto from 'crypto';

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

// Fields the seller sees on their /my-offer dashboard (by secret token OR when logged in).
const CLIENT_FIELDS = [
  'id', 'name', 'address', 'property_type', 'beds', 'baths', 'sqft', 'year_built',
  'stage', 'client_status', 'offer_amount', 'offer_details',
  'est_closing_costs', 'estimated_net', 'created_at',
];

const CLIENT_STATUSES = ['Reviewing', 'Offer Prepared', 'Offer Sent', 'In Escrow', 'Closed'];

function validId(id) { return /^[0-9a-f-]{20,40}$/i.test(id || ''); }
function validToken(t) { return /^[0-9a-f]{32,80}$/i.test(t || ''); }
function newToken() {
  return crypto.randomBytes(24).toString('hex'); // 48-char secret link
}

// Verify the caller is a logged-in Supabase user. Returns user or null.
async function requireUser(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// Allowlist of admin emails (comma-separated in ADMIN_EMAILS). Only these can
// list all leads or edit offers. Everyone else is treated as a seller.
function isAdminEmail(email) {
  const list = (process.env.ADMIN_EMAILS || "sez@carmelvalley.com")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
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

    // Early capture: an address alone is enough to create a "potential seller"
    // lead. Name/phone/email are filled in on later steps via PATCH.
    if (!address) {
      return NextResponse.json({ ok: false, error: 'Please enter a property address.' }, { status: 400 });
    }
    const insert = {
      name, phone, email, address, timeline, condition, heard_about,
      source: 'landing', stage: 1,
      lead_type: 'potential seller',
      submitted: body.submitted === true,
      client_status: 'Reviewing',
      access_token: newToken(),
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
      .select('id, access_token').single();
    if (error) {
      console.error('insert error:', error);
      return NextResponse.json({ ok: false, error: 'Could not save. Please try again.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: data.id, token: data.access_token });
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
    // Contact fields can be filled in on later steps of the funnel.
    if (body.name != null) update.name = body.name.toString().trim().slice(0, 120);
    if (body.phone != null) update.phone = body.phone.toString().trim().slice(0, 40);
    if (body.email != null) update.email = body.email.toString().trim().slice(0, 160);
    if (body.heard_about != null) update.heard_about = body.heard_about.toString().trim().slice(0, 60);
    if (body.property_type != null) update.property_type = body.property_type.toString().trim().slice(0, 60);
    if (body.sqft != null) update.sqft = body.sqft.toString().trim().slice(0, 60);
    if (body.beds != null) update.beds = body.beds.toString().trim().slice(0, 60);
    if (body.baths != null) update.baths = body.baths.toString().trim().slice(0, 60);
    if (body.year_built != null) update.year_built = body.year_built.toString().trim().slice(0, 60);
    if (body.submitted === true) update.submitted = true;
    if (body.callback_requested != null) {
      update.callback_requested = body.callback_requested.toString().trim().slice(0, 200);
    }
    if (body.finalize === true) update.details_completed = true;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: true });
    }

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

// GET — admin list | seller's own lead (logged in) | client dashboard by token | public prefill by id.
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const adminList = url.searchParams.get('admin') === '1';

    if (adminList) {
      const user = await requireUser(request);
      if (!user || !isAdminEmail(user.email)) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
      const { data, error } = await supabaseAdmin
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) return NextResponse.json({ ok: false, error: 'Query failed.' }, { status: 500 });
      return NextResponse.json({ ok: true, leads: data });
    }

    // Seller account dashboard: logged-in seller fetching their own lead(s).
    if (url.searchParams.get('me') === '1') {
      const user = await requireUser(request);
      if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
      // Match by linked user_id first; fall back to email match (and link it).
      let { data: rows } = await supabaseAdmin
        .from('leads').select(CLIENT_FIELDS.join(','))
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if ((!rows || rows.length === 0) && user.email) {
        const { data: byEmail } = await supabaseAdmin
          .from('leads').select(CLIENT_FIELDS.join(','))
          .ilike('email', user.email)
          .order('created_at', { ascending: false });
        rows = byEmail || [];
      }
      return NextResponse.json({ ok: true, leads: rows || [] });
    }

    // Client dashboard: seller's private link /my-offer/<token>
    const clientToken = url.searchParams.get('token') || '';
    if (clientToken) {
      if (!validToken(clientToken)) return NextResponse.json({ ok: false, error: 'Invalid link.' }, { status: 400 });
      const { data, error } = await supabaseAdmin
        .from('leads').select(CLIENT_FIELDS.join(',')).eq('access_token', clientToken).single();
      if (error || !data) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
      return NextResponse.json({ ok: true, data });
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

// PUT — admin updates | seller claims their lead after signup.
const STATUSES = ['New', 'Contacted', 'Working', 'Closed', 'Dead'];

function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export async function PUT(request) {
  try {
    const user = await requireUser(request);
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();

    // Seller "claim": link this logged-in account to its lead(s) by email.
    if (body.action === 'claim') {
      if (!user.email) return NextResponse.json({ ok: false, error: 'No email on account.' }, { status: 400 });
      const { error } = await supabaseAdmin
        .from('leads')
        .update({ user_id: user.id })
        .ilike('email', user.email)
        .is('user_id', null);
      // Also link a specific lead id if provided (covers email-less or mismatched cases).
      if (body.id && validId(body.id.toString())) {
        await supabaseAdmin.from('leads').update({ user_id: user.id }).eq('id', body.id.toString());
      }
      if (error) return NextResponse.json({ ok: false, error: 'Could not link account.' }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // From here down: admin-only lead updates.
    if (!isAdminEmail(user.email)) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    const id = (body.id || '').toString();
    if (!validId(id)) return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });

    const update = {};
    if (body.stage != null) {
      const stage = parseInt(body.stage, 10);
      if (!(stage >= 1 && stage <= 5)) return NextResponse.json({ ok: false, error: 'Invalid stage.' }, { status: 400 });
      update.stage = stage;
    }
    if (body.status != null) {
      const st = body.status.toString();
      if (!STATUSES.includes(st)) return NextResponse.json({ ok: false, error: 'Invalid status.' }, { status: 400 });
      update.status = st;
    }
    if (body.client_status != null) {
      const cs = body.client_status.toString();
      if (!CLIENT_STATUSES.includes(cs)) return NextResponse.json({ ok: false, error: 'Invalid client status.' }, { status: 400 });
      update.client_status = cs;
    }
    if (body.notes != null) update.notes = body.notes.toString().slice(0, 4000);
    if (body.offer_details != null) update.offer_details = body.offer_details.toString().slice(0, 2000);
    if (body.offer_amount != null) update.offer_amount = toNum(body.offer_amount);
    if (body.est_closing_costs != null) update.est_closing_costs = toNum(body.est_closing_costs);
    if (body.estimated_net != null) update.estimated_net = toNum(body.estimated_net);

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: false, error: 'Nothing to update.' }, { status: 400 });
    }
    const { error } = await supabaseAdmin.from('leads').update(update).eq('id', id);
    if (error) return NextResponse.json({ ok: false, error: 'Update failed.' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('PUT error:', e);
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
