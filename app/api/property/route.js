import { NextResponse } from 'next/server';
import { autocompleteAddress, lookupByUrl } from '../../../lib/redfin';

// GET /api/property?q=partial address  -> { ok, suggestions: [{label, url}] }
export async function GET(request) {
  try {
    const q = new URL(request.url).searchParams.get('q') || '';
    const suggestions = await autocompleteAddress(q);
    return NextResponse.json({ ok: true, suggestions });
  } catch {
    return NextResponse.json({ ok: true, suggestions: [] });
  }
}

// POST { url } -> { ok, facts }   (property details from a chosen Redfin url)
export async function POST(request) {
  try {
    const body = await request.json();
    const url = (body.url || '').toString();
    if (!url) return NextResponse.json({ ok: true, facts: {} });
    const facts = await lookupByUrl(url);
    return NextResponse.json({ ok: true, facts: facts || {} });
  } catch {
    return NextResponse.json({ ok: true, facts: {} });
  }
}
