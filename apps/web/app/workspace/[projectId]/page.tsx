// Main workspace: left sidebar (upload/cleanup/vectorize/colors/print/export),
// center canvas, right contextual panel.

import { PRODUCT_TYPES, isProductType } from '@pod-vector-studio/shared';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getOwnedProject } from '@/lib/projects';

interface WorkspacePageProps {
  params: { projectId: string };
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const user = await requireUser();
  const project = await getOwnedProject(params.projectId, user.id);
  if (!project) notFound();

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
        {/* TODO (Phase 1.4): upload panel; later cleanup/vectorize/colors/print/export */}
        <aside className="border-r p-4 text-sm text-muted-foreground">Tools</aside>
        <section className="flex items-center justify-center bg-muted text-sm text-muted-foreground">
          Upload a design to get started.
        </section>
        <aside className="border-l p-4 text-sm text-muted-foreground">Settings</aside>
      </div>
    </div>
  );
}
