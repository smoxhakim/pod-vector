// Main workspace: left sidebar (upload/cleanup/vectorize/colors/print/export),
// center canvas, right contextual panel.

interface WorkspacePageProps {
  params: { projectId: string };
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { projectId } = params;
  // TODO (Phase 1.3): load project + current ProjectVersion via Prisma, 404 if not owned.

  return (
    <div className="grid h-screen grid-cols-[240px_1fr_280px]">
      <aside className="border-r p-4 text-sm">Left sidebar</aside>
      <section className="flex items-center justify-center bg-muted text-sm text-muted-foreground">
        Canvas — project {projectId}
      </section>
      <aside className="border-l p-4 text-sm">Right panel</aside>
    </div>
  );
}
