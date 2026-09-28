// Dashboard: New Project + Recent Projects. Auth is enforced by dashboard/layout.tsx.

import { requireUser } from '@/lib/auth';
import { listProjects } from '@/lib/projects';
import { NewProjectDialog } from './_components/new-project-dialog';
import { ProjectList } from './_components/project-list';

export default async function DashboardPage() {
  const user = await requireUser();
  const projects = await listProjects(user.id);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload a PNG or JPG and turn it into a print-ready vector.
          </p>
        </div>
        <NewProjectDialog />
      </div>
      <ProjectList initialProjects={projects} />
    </main>
  );
}
