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
   clashing with other local projects). File storage is a real Cloudflare R2 dev bucket — see
   "Storage setup" below.
4. `npm run db:migrate` — applies Prisma migrations in `packages/db/migrations`.
5. `npm run dev` — Turborepo runs web + worker in parallel.
6. Web app: http://localhost:3100 (keep `NEXTAUTH_URL` in sync if you change the port). The
   worker has no HTTP surface (queue consumer only).

Auth: sign up at `/signup` (email + password) or use "Email me a sign-in link" on `/login`.
Until Resend is wired up, magic links are printed to the web dev server console.

Other scripts: `npm run typecheck`, `npm run build`, `npm run db:studio`, `npm run infra:down`.

Internal packages (`@pod-vector-studio/db`, `@pod-vector-studio/shared`) ship TypeScript
source directly: Next transpiles them via `transpilePackages`, the worker runs under `tsx`.

## Background jobs

Anything slow runs in the worker. The web app calls `enqueueJob()` (`apps/web/lib/jobs.ts`),
which writes a `Job` row and pushes `{ jobId, projectId, versionId, params }` onto the job
type's BullMQ queue. The worker wraps each handler in `runJob()` (`apps/worker/src/jobs`),
which moves the row through `queued → processing → completed | failed`. Clients poll
`GET /api/jobs/:id` (React: `useJob(jobId)`). In dev, the workspace has a "Dev · job queue"
panel that runs a no-op job end to end.

## Vectorization (Logo mode)

`apps/worker/src/vectorizer`: sharp decodes the source (median-filtered if JPEG, capped at
3000px for tracing), `palette.ts` reduces it to its real flat colours (merges near-duplicates
in Lab, rejects anti-aliasing blends, resolves edge pixels from their neighbours), then each
colour layer is traced with potrace. Layers are stacked (each mask includes the layers above
it) so adjacent shapes never show hairline gaps. Every result passes `isTrueVector()` — real
path geometry, no `<image>`/data URIs — or the job fails honestly. Run `npm test -w
@pod-vector-studio/worker` for the engine tests.

## Background removal (colour key)

`apps/worker/src/background/remove.ts`: auto-detection reads the 2px border ring (mostly
transparent → nothing to do; one dominant colour → that's the background). Removal keys out
pixels near that colour — by default only the region connected to the image edge, so white
parts inside the design survive. Edge pixels within 2px are un-mixed: alpha comes from
projecting each pixel onto the background→design-colour line, and its colour becomes the pure
design colour, so there's no halo on dark shirts. The result is a `cleaned` PNG on the same
version, and vectorization traces it instead of the original.

## Storage setup (Cloudflare R2)

Uploads go straight from the browser to R2 via presigned URLs; the app never proxies file bytes.

1. Cloudflare dashboard → R2 Object Storage → **Create bucket** (e.g. `pod-vector-studio-dev`).
   Keep public access **off** — all reads use short-lived signed URLs.
2. Bucket → Settings → **CORS policy**:
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3100"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["content-type"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   Add your production origin when you deploy.
3. R2 → **Manage API tokens** → Create API token: *Object Read & Write*, scoped to that bucket only.
4. Put the Access Key ID, Secret Access Key, account ID, bucket name and
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` endpoint into `.env` (`R2_*` vars).

Keys are laid out as `users/<userId>/projects/<projectId>/...`, so deleting a project removes
its whole prefix.

## Status

Phase 1.1 (scaffold), 1.2 (auth), 1.3 (projects), 1.4 (uploads), 1.5 (job queue), 1.6 (Logo-mode vectorization) and 1.7 (background removal) done; 1.4, 1.6 and 1.7 still need an end-to-end run against R2 — see TODO.md for the phased roadmap.
