// Main workspace: left sidebar (upload/cleanup/vectorize/colors/print/export),
// center canvas, right contextual panel.

import { prisma } from '@pod-vector-studio/db';
import { PRODUCT_TYPES, isProductType, type BackgroundSettings } from '@pod-vector-studio/shared';
import { presignDownload } from '@pod-vector-studio/shared/storage';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getCurrentCleaned, getCurrentSource, getCurrentVector, getOwnedProject } from '@/lib/projects';
import { ArtworkView } from './_components/artwork-view';
import { BackgroundPanel } from './_components/background-panel';
import { DevJobPanel } from './_components/dev-job-panel';
import { ExportPanel } from './_components/export-panel';
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

  const versionId = project.currentVersionId;
  const activeJobs = versionId
    ? await prisma.job.findMany({
        where: { versionId, type: { in: ['vectorize', 'background_removal'] }, status: { in: ['queued', 'processing'] } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, type: true },
      })
    : [];
  const [source, cleaned, vector, version] = await Promise.all([
    getCurrentSource(project),
    getCurrentCleaned(project),
    getCurrentVector(project),
    versionId
      ? prisma.projectVersion.findUnique({
          where: { id: versionId },
          select: { vectorizationSettings: true, backgroundSettings: true },
        })
      : null,
  ]);
  const [sourceUrl, cleanedUrl, vectorUrl] = await Promise.all(
    [source, cleaned, vector].map((a) => (a ? presignDownload(a.storageKey) : null)),
  );

  // Stale = the vector was traced from a different input than the one vectorize would use now.
  const tracedFrom = (version?.vectorizationSettings as { inputAssetId?: string } | null)?.inputAssetId;
  const currentInput = cleaned?.id ?? source?.id;
  const vectorStale = !!vector && (tracedFrom ? tracedFrom !== currentInput : !!cleaned);
  const bgSettings = (version?.backgroundSettings ?? null) as BackgroundSettings | null;
  // Transparent if the vector was traced from the background-removed image, or the upload
  // was transparent to begin with.
  const vectorHasBackground =
    !!vector && !((cleaned && tracedFrom === cleaned.id) || bgSettings?.outcome === 'already_transparent');

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
          <BackgroundPanel
            projectId={project.id}
            hasSource={!!source}
            hasCleaned={!!cleaned}
            settings={bgSettings?.outcome ? bgSettings : null}
            activeJobId={activeJobs.find((j) => j.type === 'background_removal')?.id ?? null}
          />
          <VectorizePanel
            projectId={project.id}
            hasSource={!!source}
            hasVector={!!vector}
            vectorStale={vectorStale}
            activeJobId={activeJobs.find((j) => j.type === 'vectorize')?.id ?? null}
          />
          <ExportPanel
            projectId={project.id}
            hasVector={!!vector}
            vectorStale={vectorStale}
            vectorHasBackground={vectorHasBackground}
          />
          {process.env.NODE_ENV !== 'production' && <DevJobPanel projectId={project.id} />}
        </aside>

        <section className="checkerboard relative overflow-hidden">
          <ArtworkView
            name={project.name}
            urls={{ vector: vectorUrl, cleaned: cleanedUrl, original: sourceUrl }}
            initial={vector && !vectorStale ? 'vector' : cleaned ? 'cleaned' : 'original'}
            width={source?.width ?? 1}
            height={source?.height ?? 1}
          />
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
