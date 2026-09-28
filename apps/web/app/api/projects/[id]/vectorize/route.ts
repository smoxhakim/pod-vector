import { NextResponse } from 'next/server';

// TODO (Phase 1.6): verify session owns project, create Job row (type: vectorize),
// enqueue VectorizeJobPayload onto QUEUES.vectorize, return 202 { jobId }.

export async function POST() {
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 });
}
