import { NextResponse } from 'next/server';

// TODO (Phase 1.3): session check, then list/create via prisma.project.

export async function GET() {
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 });
}

export async function POST() {
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 });
}
