import { prisma } from '@pod-vector-studio/db';
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUserId, unauthorized } from '@/lib/auth';
import { badRequest, readJson } from '@/lib/http';
import { listProjects, parseCreateInput, toProjectDTO } from '@/lib/projects';

// GET /api/projects?search=&tag=&status= — the user's projects, newest activity first.
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const params = req.nextUrl.searchParams;
  const projects = await listProjects(userId, {
    search: params.get('search'),
    tag: params.get('tag'),
    status: params.get('status'),
  });
  return NextResponse.json({ projects });
}

// POST /api/projects { name, productType? }
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const body = await readJson(req);
  if (body === undefined) return badRequest('Invalid JSON body.');
  const parsed = parseCreateInput(body);
  if (!parsed.ok) return badRequest(parsed.error);

  const project = await prisma.project.create({
    data: { userId, name: parsed.value.name, productType: parsed.value.productType, status: 'draft' },
  });
  return NextResponse.json({ project: toProjectDTO(project) }, { status: 201 });
}
