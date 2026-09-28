import { prisma } from '@pod-vector-studio/db';
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUserId, unauthorized } from '@/lib/auth';
import { notFound } from '@/lib/http';
import { toJobDTO } from '@/lib/jobs';
import { getOwnedProject } from '@/lib/projects';

// GET /api/projects/:id/jobs — job history for a project, newest first.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const project = await getOwnedProject(params.id, userId);
  if (!project) return notFound();

  const jobs = await prisma.job.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  return NextResponse.json({ jobs: jobs.map(toJobDTO) });
}
