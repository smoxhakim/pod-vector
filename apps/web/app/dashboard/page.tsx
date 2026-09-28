// Dashboard: New Project, Recent Projects.
// TODO (Phase 1.2): server-side session guard, redirect to /login if unauthenticated.
// TODO (Phase 1.3): New Project button + Recent Projects list from /api/projects.

export default async function DashboardPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Upload a PNG or JPG and turn it into a print-ready vector.
      </p>
      <section className="mt-8 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        No projects yet.
      </section>
    </main>
  );
}
