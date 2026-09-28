import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUserId, unauthorized } from '@/lib/auth';
import { notFound } from '@/lib/http';
import { getOwnedJob, toJobDTO } from '@/lib/jobs';

// GET /api/jobs/:id — poll a job's status/result.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const job = await getOwnedJob(params.id, userId);
  if (!job) return notFound();
  return NextResponse.json({ job: toJobDTO(job) });
}
