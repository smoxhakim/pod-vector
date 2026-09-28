# POD Vector Studio

Raster-to-print-ready-vector studio for POD creators. Upload a PNG/JPG, vectorize,
clean up, convert to CMYK, validate for print, export.

## Monorepo layout (Turborepo)

- `apps/web` — Next.js 14 App Router app: dashboard, workspace UI, API route handlers.
- `apps/worker` — Standalone Node worker: BullMQ consumers for vectorization, cleanup,
  color conversion, validation, export, batch, AI.
- `packages/db` — Prisma schema + generated client, shared by web and worker.
- `packages/shared` — Shared TypeScript types/constants (job payloads, enums).

## Local development

Requires Node 20+ and Docker.

1. `cp .env.example .env`
2. `npm install` (also runs `prisma generate`)
3. `npm run infra:up` — Postgres on :5433, Redis on :6380 (offset from defaults to avoid
   clashing with other local projects). Object storage (R2 stand-in) lands with the upload
   milestone.
4. `npm run db:migrate` — applies Prisma migrations in `packages/db/migrations`.
5. `npm run dev` — Turborepo runs web + worker in parallel.
6. Web app: http://localhost:3100 (keep `NEXTAUTH_URL` in sync if you change the port). The
   worker has no HTTP surface (queue consumer only).

Auth: sign up at `/signup` (email + password) or use "Email me a sign-in link" on `/login`.
Until Resend is wired up, magic links are printed to the web dev server console.

Other scripts: `npm run typecheck`, `npm run build`, `npm run db:studio`, `npm run infra:down`.

Internal packages (`@pod-vector-studio/db`, `@pod-vector-studio/shared`) ship TypeScript
source directly: Next transpiles them via `transpilePackages`, the worker runs under `tsx`.

## Status

Phase 1.1 (monorepo scaffold) and 1.2 (auth) done — see TODO.md for the phased roadmap.
