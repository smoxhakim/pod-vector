'use client';

import { PRODUCT_TYPES, isProductType } from '@pod-vector-studio/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import type { ProjectDTO } from '@/lib/projects';
import { cn } from '@/lib/utils';

type View = 'active' | 'archived';

const queryKey = (view: View) => ['projects', view] as const;

export function ProjectList({ initialProjects }: { initialProjects: ProjectDTO[] }) {
  const [view, setView] = useState<View>('active');
  const { data, isLoading, error } = useQuery({
    queryKey: queryKey(view),
    queryFn: () => api<{ projects: ProjectDTO[] }>(view === 'archived' ? '/api/projects?status=archived' : '/api/projects'),
    initialData: view === 'active' ? { projects: initialProjects } : undefined,
  });
  const projects = data?.projects ?? [];

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{view === 'active' ? 'Recent projects' : 'Archived projects'}</h2>
        <Button variant="ghost" size="sm" onClick={() => setView(view === 'active' ? 'archived' : 'active')}>
          {view === 'active' ? 'Show archived' : 'Back to recent'}
        </Button>
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error.message}</p>}
      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && projects.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {view === 'active' ? 'No projects yet. Create one to upload your first design.' : 'Nothing archived.'}
        </div>
      )}

      {projects.length > 0 && (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} view={view} />
          ))}
        </ul>
      )}
    </section>
  );
}

const STATUS_STYLES: Record<ProjectDTO['status'], string> = {
  draft: 'bg-muted text-muted-foreground',
  processing: 'bg-amber-100 text-amber-900',
  ready: 'bg-emerald-100 text-emerald-900',
  archived: 'bg-muted text-muted-foreground',
};

function ProjectCard({ project, view }: { project: ProjectDTO; view: View }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['projects'] });
  const update = useMutation({
    mutationFn: (body: { name?: string; archived?: boolean }) =>
      api(`/api/projects/${project.id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      setEditing(false);
      return invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/projects/${project.id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === project.name) {
      setName(project.name);
      setEditing(false);
      return;
    }
    update.mutate({ name: trimmed });
  }

  function onNameKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') saveName();
    if (e.key === 'Escape') {
      setName(project.name);
      setEditing(false);
    }
  }

  const busy = update.isPending || remove.isPending;
  const productLabel = isProductType(project.productType) ? PRODUCT_TYPES[project.productType] : null;

  return (
    <li className={cn('group flex flex-col rounded-lg border bg-card transition-shadow hover:shadow-sm', busy && 'opacity-60')}>
      <Link
        href={`/workspace/${project.id}`}
        className="checkerboard flex aspect-[4/3] items-center justify-center overflow-hidden rounded-t-lg text-xs text-muted-foreground"
      >
        {project.thumbnailUrl ? (
          // Signed R2 URL: plain <img> so the bytes never pass through the Next image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.thumbnailUrl} alt="" className="h-full w-full object-contain p-3" loading="lazy" />
        ) : (
          'No artwork yet'
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        {editing ? (
          <Input
            aria-label="Project name"
            autoFocus
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onNameKey}
            onBlur={saveName}
          />
        ) : (
          <Link href={`/workspace/${project.id}`} className="truncate text-sm font-medium hover:underline">
            {project.name}
          </Link>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn('rounded px-1.5 py-0.5 font-medium capitalize', STATUS_STYLES[project.status])}>
            {project.status}
          </span>
          {productLabel && <span>{productLabel}</span>}
          <span className="ml-auto">{formatUpdated(project.updatedAt)}</span>
        </div>
        {(update.error || remove.error) && (
          <p className="text-xs text-destructive">{(update.error ?? remove.error)?.message}</p>
        )}
        <div className="mt-auto flex gap-1 pt-1">
          {view === 'active' ? (
            <>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(true)}>
                Rename
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => update.mutate({ archived: true })}>
                Archive
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => update.mutate({ archived: false })}>
              Restore
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Delete "${project.name}"? This can't be undone.`)) remove.mutate();
            }}
          >
            Delete
          </Button>
        </div>
      </div>
    </li>
  );
}

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
