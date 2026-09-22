import { NextResponse } from 'next/server';
import { lookupProperty } from '../../../lib/redfin';

// POST { address } -> { ok, facts: { property_type, sqft, beds, baths, year_built } }
export async function POST(request) {
  try {
    const body = await request.json();
    const address = (body.address || '').toString().trim().slice(0, 300);
    if (!address) return NextResponse.json({ ok: false, facts: {} }, { status: 400 });

    const facts = await lookupProperty(address);
    return NextResponse.json({ ok: true, facts: facts || {} });
  } catch (e) {
    console.error('property route error:', e);
    // Never block the user — just return no facts.
    return NextResponse.json({ ok: true, facts: {} });
  }
}
