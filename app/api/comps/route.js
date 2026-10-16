import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { autocompleteAddress, lookupCompByUrl } from '../../../lib/redfin';
import { readCompsSheet } from '../../../lib/sheets';

function isAdminEmail(email) {
  const list = (process.env.ADMIN_EMAILS || 'sez@carmelvalley.com')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}
async function requireAdmin(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user || !isAdminEmail(data.user.email)) return null;
  return data.user;
}

function slugify(s) {
  return (s || '').toString().toLowerCase()
    .replace(/,.*$/, '')               // drop everything after first comma
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
function rand(n = 4) {
  return Math.random().toString(36).slice(2, 2 + n);
}

const COMP_FIELDS = [
  'mls_number', 'status', 'sub_type', 'my_notes', 'address', 'postal_code',
  'year_built', 'beds', 'baths', 'living_area', 'lot_size_sqft', 'sold_ppsf',
  'close_price', 'close_date', 'orig_list_price', 'price_ppsf', 'days_on_market',
  'redfin_url', 'sort_order', 'photo_url', 'public_remarks', 'current_price',
  'starred', 'photo_override',
];

// GET — address autocomplete | admin report list | admin one report | public report by slug
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get('autocomplete');
    if (q != null) {
      const suggestions = await autocompleteAddress(q);
      return NextResponse.json({ ok: true, suggestions });
    }

    // Public report by slug (what the client sees) — no auth.
    const slug = url.searchParams.get('slug');
    if (slug) {
      const { data: report } = await supabaseAdmin
        .from('comp_reports').select('*').eq('slug', slug).eq('deleted', false).single();
      if (!report) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
      const { data: comps } = await supabaseAdmin
        .from('comps').select('*').eq('report_id', report.id).order('sort_order', { ascending: true });
      return NextResponse.json({ ok: true, report, comps: comps || [] });
    }

    // Admin: list all reports, or one report with its comps.
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });

    const reportId = url.searchParams.get('report');
    if (reportId) {
      const { data: report } = await supabaseAdmin.from('comp_reports').select('*').eq('id', reportId).single();
      if (!report) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
      const { data: comps } = await supabaseAdmin
        .from('comps').select('*').eq('report_id', reportId).order('sort_order', { ascending: true });
      return NextResponse.json({ ok: true, report, comps: comps || [] });
    }

    const { data: reports } = await supabaseAdmin
      .from('comp_reports').select('*').eq('deleted', false).order('created_at', { ascending: false }).limit(200);
    return NextResponse.json({ ok: true, reports: reports || [] });
  } catch (e) {
    console.error('comps GET error:', e);
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}

// POST — admin actions (create report | add comp from Redfin | add blank comp)
export async function POST(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();
    const action = body.action || '';

    if (action === 'create_report') {
      const subject = (body.subject_address || '').toString().trim().slice(0, 200);
      if (!subject) return NextResponse.json({ ok: false, error: 'Subject address required.' }, { status: 400 });
      let base = slugify(subject) || 'comps';
      let slug = base + '-' + rand(4);
      // ensure unique
      for (let i = 0; i < 4; i++) {
        const { data: clash } = await supabaseAdmin.from('comp_reports').select('id').eq('slug', slug).single();
        if (!clash) break;
        slug = base + '-' + rand(5);
      }
      const insert = {
        slug, subject_address: subject,
        subject_zip: (body.subject_zip || '').toString().slice(0, 12),
        client_name: (body.client_name || '').toString().slice(0, 120),
        title: (body.title || '').toString().slice(0, 200),
        intro: (body.intro || '').toString().slice(0, 2000),
      };
      const { data, error } = await supabaseAdmin.from('comp_reports').insert(insert).select('*').single();
      if (error) { console.error(error); return NextResponse.json({ ok: false, error: 'Could not create report.' }, { status: 500 }); }
      return NextResponse.json({ ok: true, report: data });
    }

    if (action === 'add_comp') {
      const reportId = (body.report_id || '').toString();
      if (!reportId) return NextResponse.json({ ok: false, error: 'report_id required.' }, { status: 400 });

      let comp = { report_id: reportId, sort_order: Number(body.sort_order) || 0 };
      // Pull from Redfin if a url (or address+url) is provided.
      const redfinUrl = (body.redfin_url || '').toString();
      const address = (body.address || '').toString().trim().slice(0, 200);
      if (redfinUrl) {
        const facts = await lookupCompByUrl(redfinUrl, body.force === true);
        delete facts._cached;
        comp = { ...comp, ...facts, redfin_url: redfinUrl };
      }
      if (address) comp.address = address;

      const { data, error } = await supabaseAdmin.from('comps').insert(comp).select('*').single();
      if (error) { console.error(error); return NextResponse.json({ ok: false, error: 'Could not add comp.' }, { status: 500 }); }
      return NextResponse.json({ ok: true, comp: data });
    }

    if (action === 'import_sheet') {
      const reportId = (body.report_id || '').toString();
      const sheetUrl = (body.sheet_url || '').toString().trim();
      if (!reportId || !sheetUrl) return NextResponse.json({ ok: false, error: 'report_id and sheet_url required.' }, { status: 400 });
      let parsed;
      try {
        parsed = await readCompsSheet(sheetUrl);
      } catch (e) {
        return NextResponse.json({ ok: false, error: e.message || 'Could not read the sheet.' }, { status: 400 });
      }
      const rows = parsed.comps || [];
      // Replace this report's comps with the sheet rows.
      await supabaseAdmin.from('comps').delete().eq('report_id', reportId);
      if (rows.length) {
        const toInsert = rows.map((r, i) => ({ report_id: reportId, sort_order: i, ...r }));
        await supabaseAdmin.from('comps').insert(toInsert);
      }
      await supabaseAdmin.from('comp_reports').update({ sheet_url: sheetUrl, updated_at: new Date().toISOString() }).eq('id', reportId);
      const { data: comps } = await supabaseAdmin
        .from('comps').select('*').eq('report_id', reportId).order('sort_order', { ascending: true });
      return NextResponse.json({ ok: true, count: rows.length, comps: comps || [] });
    }

    if (action === 'upload_photo') {
      const compId = (body.comp_id || '').toString();
      const dataUrl = (body.data_url || '').toString();
      if (!compId || !dataUrl.startsWith('data:')) {
        return NextResponse.json({ ok: false, error: 'comp_id and image required.' }, { status: 400 });
      }
      const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (!m) return NextResponse.json({ ok: false, error: 'Invalid image.' }, { status: 400 });
      const contentType = m[1];
      const ext = contentType.split('/')[1] || 'jpg';
      const buffer = Buffer.from(m[2], 'base64');
      if (buffer.length > 6 * 1024 * 1024) {
        return NextResponse.json({ ok: false, error: 'Image too large (max 6MB).' }, { status: 400 });
      }
      const path = `${compId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabaseAdmin.storage
        .from('comp-photos').upload(path, buffer, { contentType, upsert: true });
      if (upErr) {
        console.error('storage upload error:', upErr);
        return NextResponse.json({ ok: false, error: 'Upload failed: ' + (upErr.message || '') }, { status: 500 });
      }
      const { data: pub } = supabaseAdmin.storage.from('comp-photos').getPublicUrl(path);
      const url = pub?.publicUrl || '';
      await supabaseAdmin.from('comps').update({ photo_override: url }).eq('id', compId);
      return NextResponse.json({ ok: true, url });
    }

    return NextResponse.json({ ok: false, error: 'Unknown action.' }, { status: 400 });
  } catch (e) {
    console.error('comps POST error:', e);
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}

// PUT — admin edits a comp row, or a report's meta, or refreshes a comp from Redfin.
export async function PUT(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });

    const body = await request.json();

    if (body.report_id && body.report_fields) {
      const rf = {};
      for (const k of ['subject_address', 'subject_zip', 'client_name', 'title', 'intro']) {
        if (body.report_fields[k] != null) rf[k] = body.report_fields[k].toString().slice(0, 2000);
      }
      rf.updated_at = new Date().toISOString();
      const { error } = await supabaseAdmin.from('comp_reports').update(rf).eq('id', body.report_id);
      if (error) return NextResponse.json({ ok: false, error: 'Could not save report.' }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    const compId = (body.comp_id || '').toString();
    if (!compId) return NextResponse.json({ ok: false, error: 'comp_id required.' }, { status: 400 });

    // Refresh this comp's data from Redfin.
    if (body.action === 'refresh') {
      const { data: existing } = await supabaseAdmin.from('comps').select('redfin_url').eq('id', compId).single();
      if (existing?.redfin_url) {
        const facts = await lookupCompByUrl(existing.redfin_url, true);
        delete facts._cached;
        await supabaseAdmin.from('comps').update(facts).eq('id', compId);
      }
      const { data } = await supabaseAdmin.from('comps').select('*').eq('id', compId).single();
      return NextResponse.json({ ok: true, comp: data });
    }

    const update = {};
    for (const k of COMP_FIELDS) {
      if (body[k] == null) continue;
      if (k === 'sort_order') update[k] = Number(body[k]) || 0;
      else if (k === 'starred') update[k] = body[k] === true || body[k] === 'true';
      else update[k] = body[k].toString().slice(0, 2000);
    }
    if (Object.keys(update).length === 0) return NextResponse.json({ ok: false, error: 'Nothing to update.' }, { status: 400 });
    const { error } = await supabaseAdmin.from('comps').update(update).eq('id', compId);
    if (error) return NextResponse.json({ ok: false, error: 'Could not save.' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('comps PUT error:', e);
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}

// DELETE — admin deletes a comp row, or soft-deletes a whole report.
export async function DELETE(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
    const body = await request.json().catch(() => ({}));

    if (body.report_id) {
      await supabaseAdmin.from('comp_reports').update({ deleted: true }).eq('id', body.report_id.toString());
      return NextResponse.json({ ok: true });
    }
    if (body.comp_id) {
      await supabaseAdmin.from('comps').delete().eq('id', body.comp_id.toString());
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: 'Nothing to delete.' }, { status: 400 });
  } catch (e) {
    console.error('comps DELETE error:', e);
    return NextResponse.json({ ok: false, error: 'Something went wrong.' }, { status: 500 });
  }
}
