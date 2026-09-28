// Main workspace: left sidebar (upload/cleanup/vectorize/colors/print/export),
// center canvas, right contextual panel.

import { prisma } from '@pod-vector-studio/db';
import { PRODUCT_TYPES, isProductType } from '@pod-vector-studio/shared';
import { presignDownload } from '@pod-vector-studio/shared/storage';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getCurrentSource, getCurrentVector, getOwnedProject } from '@/lib/projects';
import { ArtworkView } from './_components/artwork-view';
import { DevJobPanel } from './_components/dev-job-panel';
import { UploadPanel } from './_components/upload-panel';
import { VectorizePanel } from './_components/vectorize-panel';

interface WorkspacePageProps {
  params: { projectId: string };
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const user = await requireUser();
  const project = await getOwnedProject(params.projectId, user.id);
  if (!project) notFound();

  const [source, vector, activeJob] = await Promise.all([
    getCurrentSource(project),
    getCurrentVector(project),
    project.currentVersionId
      ? prisma.job.findFirst({
          where: { versionId: project.currentVersionId, type: 'vectorize', status: { in: ['queued', 'processing'] } },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
      : null,
  ]);
  const [sourceUrl, vectorUrl] = await Promise.all([
    source ? presignDownload(source.storageKey) : null,
    vector ? presignDownload(vector.storageKey) : null,
  ]);
  const productLabel = isProductType(project.productType) ? PRODUCT_TYPES[project.productType] : null;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 items-center gap-3 border-b px-4 text-sm">
        <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
          ← Projects
        </Link>
        <span className="font-medium">{project.name}</span>
        {productLabel && <span className="text-muted-foreground">· {productLabel}</span>}
      </header>
      <div className="grid flex-1 grid-cols-[240px_1fr_280px] overflow-hidden">
        <aside className="space-y-6 overflow-y-auto border-r p-4">
          <UploadPanel projectId={project.id} hasSource={!!source} />
          <VectorizePanel
            projectId={project.id}
            hasSource={!!source}
            hasVector={!!vector}
            activeJobId={activeJob?.id ?? null}
          />
          {/* TODO (Phase 1.7+): background removal, export panels */}
          {process.env.NODE_ENV !== 'production' && <DevJobPanel projectId={project.id} />}
        </aside>

        <section className="checkerboard relative flex items-center justify-center overflow-auto p-8">
          <ArtworkView name={project.name} sourceUrl={sourceUrl} vectorUrl={vectorUrl} />
        </section>

        <aside className="space-y-3 border-l p-4 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source image</h2>
          {source ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-muted-foreground">
              <dt>Format</dt>
              <dd className="text-foreground uppercase">{source.format}</dd>
              <dt>Size</dt>
              <dd className="text-foreground">
                {source.width} × {source.height} px
              </dd>
              <dt>File</dt>
              <dd className="text-foreground">{source.fileSizeBytes ? formatBytes(source.fileSizeBytes) : '—'}</dd>
              <dt>Color</dt>
              <dd className="text-foreground uppercase">{source.colorMode ?? '—'}</dd>
            </dl>
          ) : (
            <p className="text-muted-foreground">No image yet.</p>
          )}
          {vector && (
            <>
              <h2 className="pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vector</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-muted-foreground">
                <dt>Format</dt>
                <dd className="text-foreground">SVG</dd>
                <dt>File</dt>
                <dd className="text-foreground">{vector.fileSizeBytes ? formatBytes(vector.fileSizeBytes) : '—'}</dd>
                <dt>Check</dt>
                <dd className="text-emerald-700">{vector.isTrueVector ? 'True vector ✓' : 'Not verified'}</dd>
              </dl>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
