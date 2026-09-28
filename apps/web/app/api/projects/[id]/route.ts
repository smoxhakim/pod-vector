import { prisma, type Prisma } from '@pod-vector-studio/db';
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUserId, unauthorized } from '@/lib/auth';
import { badRequest, notFound, readJson } from '@/lib/http';
import { getOwnedProject, parseUpdateInput, toProjectDTO, unarchivedStatus } from '@/lib/projects';

interface Params {
  params: { id: string };
}

// GET /api/projects/:id — project + current version summary.
export async function GET(_req: NextRequest, { params }: Params) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId },
    include: {
      currentVersion: {
        select: {
          id: true,
          versionNumber: true,
          createdAt: true,
          assets: {
            select: { id: true, type: true, format: true, width: true, height: true, isTrueVector: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  });
  if (!project) return notFound();

  const { currentVersion, ...rest } = project;
  return NextResponse.json({ project: toProjectDTO(rest), currentVersion });
}

// PATCH /api/projects/:id { name?, productType?, tags?, archived? }
export async function PATCH(req: NextRequest, { params }: Params) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const existing = await getOwnedProject(params.id, userId);
  if (!existing) return notFound();

  const body = await readJson(req);
  if (body === undefined) return badRequest('Invalid JSON body.');
  const parsed = parseUpdateInput(body);
  if (!parsed.ok) return badRequest(parsed.error);

  const { archived, ...fields } = parsed.value;
  const data: Prisma.ProjectUpdateInput = { ...fields };
  if (archived === true) data.status = 'archived';
  if (archived === false && existing.status === 'archived') data.status = await unarchivedStatus(existing.id);

  const project = await prisma.project.update({ where: { id: existing.id }, data });
  return NextResponse.json({ project: toProjectDTO(project) });
}

// DELETE /api/projects/:id — removes the project; versions, assets and jobs cascade in the DB.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const existing = await getOwnedProject(params.id, userId);
  if (!existing) return notFound();

  // TODO (Phase 1.4): also delete the project's objects from R2 once uploads exist.
  await prisma.project.delete({ where: { id: existing.id } });
  return new NextResponse(null, { status: 204 });
}
