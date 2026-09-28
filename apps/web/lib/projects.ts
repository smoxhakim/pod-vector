import { prisma, type Prisma, type Project, type ProjectStatus } from '@pod-vector-studio/db';
import { isProductType, type ProductType } from '@pod-vector-studio/shared';

export const MAX_NAME_LENGTH = 120;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;

/** JSON shape returned by the projects API (dates as ISO strings). */
export interface ProjectDTO {
  id: string;
  name: string;
  productType: string | null;
  tags: string[];
  status: ProjectStatus;
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toProjectDTO(p: Project): ProjectDTO {
  return {
    id: p.id,
    name: p.name,
    productType: p.productType,
    tags: p.tags,
    status: p.status,
    currentVersionId: p.currentVersionId,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export interface ListFilters {
  search?: string | null;
  tag?: string | null;
  /** Defaults to everything except archived. */
  status?: string | null;
}

const STATUSES: ProjectStatus[] = ['draft', 'processing', 'ready', 'archived'];

export async function listProjects(userId: string, filters: ListFilters = {}): Promise<ProjectDTO[]> {
  const where: Prisma.ProjectWhereInput = { userId };
  if (filters.status && STATUSES.includes(filters.status as ProjectStatus)) {
    where.status = filters.status as ProjectStatus;
  } else {
    where.status = { not: 'archived' };
  }
  if (filters.search?.trim()) where.name = { contains: filters.search.trim(), mode: 'insensitive' };
  if (filters.tag?.trim()) where.tags = { has: filters.tag.trim() };

  const projects = await prisma.project.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 100 });
  return projects.map(toProjectDTO);
}

/** Returns the project only if it belongs to the user — callers respond 404 otherwise. */
export function getOwnedProject(projectId: string, userId: string) {
  return prisma.project.findFirst({ where: { id: projectId, userId } });
}

// --- Input validation (hand-rolled; route bodies are tiny) ---

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function parseName(value: unknown): Result<string> {
  if (typeof value !== 'string' || !value.trim()) return { ok: false, error: 'Name is required.' };
  const name = value.trim();
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` };
  return { ok: true, value: name };
}

function parseProductType(value: unknown): Result<ProductType | null> {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  return isProductType(value) ? { ok: true, value } : { ok: false, error: 'Unknown product type.' };
}

function parseTags(value: unknown): Result<string[]> {
  if (!Array.isArray(value) || !value.every((t) => typeof t === 'string'))
    return { ok: false, error: 'Tags must be a list of strings.' };
  const tags = [...new Set(value.map((t: string) => t.trim()).filter(Boolean))];
  if (tags.length > MAX_TAGS || tags.some((t) => t.length > MAX_TAG_LENGTH))
    return { ok: false, error: `Up to ${MAX_TAGS} tags, ${MAX_TAG_LENGTH} characters each.` };
  return { ok: true, value: tags };
}

export function parseCreateInput(body: unknown): Result<{ name: string; productType: ProductType | null }> {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = parseName(b.name);
  if (!name.ok) return name;
  const productType = parseProductType(b.productType);
  if (!productType.ok) return productType;
  return { ok: true, value: { name: name.value, productType: productType.value } };
}

export interface ProjectUpdate {
  name?: string;
  productType?: ProductType | null;
  tags?: string[];
  archived?: boolean;
}

export function parseUpdateInput(body: unknown): Result<ProjectUpdate> {
  const b = (body ?? {}) as Record<string, unknown>;
  const update: ProjectUpdate = {};
  if ('name' in b) {
    const r = parseName(b.name);
    if (!r.ok) return r;
    update.name = r.value;
  }
  if ('productType' in b) {
    const r = parseProductType(b.productType);
    if (!r.ok) return r;
    update.productType = r.value;
  }
  if ('tags' in b) {
    const r = parseTags(b.tags);
    if (!r.ok) return r;
    update.tags = r.value;
  }
  if ('archived' in b) {
    if (typeof b.archived !== 'boolean') return { ok: false, error: 'archived must be true or false.' };
    update.archived = b.archived;
  }
  if (Object.keys(update).length === 0) return { ok: false, error: 'Nothing to update.' };
  return { ok: true, value: update };
}

/** Status to restore when un-archiving: ready if a vector result exists, else draft. */
export async function unarchivedStatus(projectId: string): Promise<ProjectStatus> {
  const vector = await prisma.asset.findFirst({ where: { projectId, type: 'vector' }, select: { id: true } });
  return vector ? 'ready' : 'draft';
}
