// Main workspace: left sidebar (upload/cleanup/vectorize/colors/print/export),
// center canvas, right contextual panel.

import { PRODUCT_TYPES, isProductType } from '@pod-vector-studio/shared';
import { presignDownload } from '@pod-vector-studio/shared/storage';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getCurrentSource, getOwnedProject } from '@/lib/projects';
import { UploadPanel } from './_components/upload-panel';

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

  const source = await getCurrentSource(project);
  const previewUrl = source ? await presignDownload(source.storageKey) : null;
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
          {/* TODO (Phase 1.6+): vectorize, background, export panels */}
        </aside>

        <section className="checkerboard flex items-center justify-center overflow-auto p-8">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={`${project.name} source`} className="max-h-full max-w-full object-contain shadow-sm" />
          ) : (
            <p className="rounded-md bg-background/90 px-4 py-2 text-sm text-muted-foreground">
              Upload a design to get started.
            </p>
          )}
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
        </aside>
      </div>
    </div>
  );
}
