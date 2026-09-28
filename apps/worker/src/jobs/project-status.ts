import { prisma } from '@pod-vector-studio/db';

/** After a job ends: "ready" if the version has a vector result, otherwise "draft". */
export async function settleProjectStatus(projectId: string, versionId: string): Promise<void> {
  const vectors = await prisma.asset.count({ where: { versionId, type: 'vector' } });
  await prisma.project
    .update({ where: { id: projectId }, data: { status: vectors ? 'ready' : 'draft' } })
    .catch(() => {}); // project may have been deleted mid-job
}
