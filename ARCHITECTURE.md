# Architecture: POD Vector Studio

## Recommended stack

**Frontend / App**
- **Next.js 14 (App Router) + TypeScript** — single codebase for marketing site, dashboard, workspace, API routes.
- **Tailwind CSS + shadcn/ui** — fast, consistent UI without a design system build-out.
- **Zustand** for client-side editor/canvas state; React Query (TanStack Query) for server state + polling job status.
- **Fabric.js** for the Phase 4 canvas editor — has first-class SVG path import/export, object model, and text tool support (better fit than Konva for "load an SVG, edit its paths" use case).

**Backend**
- **Next.js Route Handlers** for all CRUD/API logic (projects, presets, auth, billing, integrations) — thin, fast, deploys with the app.
- **Standalone Worker service (Node + TypeScript)** for anything CPU/time-heavy: vectorization, cleanup filters, background removal, CMYK/ICC conversion, PDF/EPS generation, batch processing, AI calls. Deployed as a long-running container, **not** a serverless function — required for Ghostscript/EPS from day one (Risk noted in PRD), and avoids re-architecting when Phase 2/6 add AI inference.
- **BullMQ + Redis** as the job queue between app and worker. Same queue abstraction serves single-file jobs (Phase 1) and batch jobs (Phase 5) — no rework needed later.

**Data**
- **PostgreSQL** (managed, e.g. Neon or Supabase) via **Prisma ORM** — relational model fits projects/versions/jobs/presets well; Prisma migrations keep schema evolution manageable solo.
- **Redis** (Upstash or Railway) — queue + short-lived caches (signed URL tokens, session lookups).
- **Object storage: Cloudflare R2** (S3-compatible, cheap egress) — all uploaded/generated files (source, cleaned, vector, CMYK previews, exports, ICC profiles). DB stores metadata + keys only, never blobs.

**Processing libraries**
- Vectorization: `potrace` / `imagetracerjs` for Phase 1–2 (logo, illustration via color-layer separation, line art). Abstracted behind a `VectorizerEngine` interface so a commercial API (e.g. Vectorizer.AI) can be swapped in per-mode later without touching call sites.
- Raster cleanup: `sharp` (resize, sharpen, contrast, quantization) + custom noise/edge filters.
- Background removal: color-key algorithm in-house for Phase 1; Phase 2 AI removal via a third-party API (e.g. Clipdrop/remove.bg) called from the worker — avoids self-hosting GPU inference as a solo dev.
- Color management: Ghostscript CLI (installed in the worker container) for CMYK conversion, ICC profile embedding, and EPS/PDF generation — the one component that dictates "worker must be a real VM/container," so it's designed in from Phase 1 even though it's not exercised until Phase 3.
- PDF assembly: `pdf-lib`.

**Auth & Payments**
- **Auth.js (NextAuth)** — email/password + magic link, session via DB-backed JWT.
- **Stripe** — subscriptions/billing, usage-based add-ons (AI calls) later.

**Ops / Observability**
- **Vercel** for the Next.js app, **Railway or Fly.io** for the worker container (Docker image with Node + Ghostscript + potrace binaries preinstalled).
- **Sentry** for error tracking (app + worker), **Logtail/Axiom** for structured logs, **Resend** for transactional email.

This stack is deliberately boring: managed Postgres/Redis/storage, one extra long-running process (the worker) introduced from Phase 1 so later phases (EPS, AI, batch) slot into existing infrastructure instead of forcing a migration.

---

## Data model

All IDs are UUIDs. Timestamps (`createdAt`, `updatedAt`) omitted below where implied.

### User
- `id`, `email` (unique), `passwordHash` (nullable if magic-link only), `name`
- `plan` (enum: free, pro, studio), `stripeCustomerId`
- Relations: many `Project`, `PODPreset`, `Integration`, `Subscription`, `UsageCounter`

### Subscription
- `id`, `userId` → User, `stripeSubscriptionId`, `plan`, `status`, `currentPeriodEnd`

### UsageCounter
- `id`, `userId` → User, `period` (YYYY-MM), `vectorizationsCount`, `aiCallsCount`, `exportsCount` — powers plan limits/cost control for Phase 2+ AI features.

### Project
- `id`, `userId` → User, `name`, `productType` (nullable, matches PODPreset.productType), `tags` (string[]), `status` (enum: draft, processing, ready, archived), `currentVersionId` → ProjectVersion
- Relations: many `ProjectVersion`, `Job`, `IntegrationPush`

### ProjectVersion
Represents one snapshot in the pipeline (source → cleaned → vector → CMYK → validated → exported). Enables Phase 5 versioning/revert without new tables later.
- `id`, `projectId` → Project, `versionNumber` (int), `parentVersionId` (nullable, self-relation, for revert history)
- `vectorizationSettings` (JSON: mode, detailLevel, colorCount, smoothness, cornerSensitivity, noiseThreshold, minShapeSize)
- `cleanupSettings` (JSON: noiseReduction, sharpening, contrast, quantization)
- `backgroundSettings` (JSON: method, color, keepColors[])
- `colorSettings` (JSON: rgbProfile, cmykProfileId, gamutWarnings[])
- `printSettings` (JSON: width, height, unit, dpi, bleed, safeArea, colorProfileId, background, podPresetId)
- Relations: many `Asset`, one `ValidationResult` (latest), one `EditorState`

### Asset
- `id`, `projectId` → Project, `versionId` → ProjectVersion
- `type` (enum: source, cleaned, vector, cmyk_preview, editor_export, final_export)
- `format` (enum: png, jpg, webp, svg, pdf, eps, tiff)
- `storageKey` (R2 path), `width`, `height`, `dpi`, `colorMode` (rgb/cmyk), `fileSizeBytes`
- `isTrueVector` (bool, nullable — set by the internal "no embedded raster" check)

### Job
Single generic job table covers every async step across all phases (vectorize, cleanup, bg-remove, cmyk-convert, validate, export, batch-item, ai-upscale, mockup-generate).
- `id`, `projectId` → Project, `versionId` → ProjectVersion (nullable for project-level jobs)
- `batchItemId` → BatchItem (nullable)
- `type` (enum: cleanup, background_removal, vectorize, cmyk_convert, validate, export, ai_upscale, mockup_generate, integration_push)
- `status` (enum: queued, processing, completed, failed)
- `params` (JSON — input args), `resultAssetId` → Asset (nullable), `errorMessage` (nullable)
- `startedAt`, `completedAt`

### ValidationResult
- `id`, `versionId` → ProjectVersion, `score` (int 0-100)
- `checks` (JSON array: `{ check: 'resolution'|'color'|'dimensions'|'transparency'|'vector'|'bleed', status: 'pass'|'warn'|'fail', message: string }`)

### ColorProfile
- `id`, `name`, `type` (rgb/cmyk), `iccFileUrl`, `isSystem` (bool) — seeded with SWOP/generic CMYK; users can't upload custom ICC in Phase 1-3 but table supports it later.

### PODPreset
- `id`, `userId` → User (nullable = system preset), `name`, `productType` (enum: tshirt_front, tshirt_back, tshirt_pocket, hoodie, sweatshirt, mug, poster, sticker, tote_bag, phone_case, wall_art, custom)
- `width`, `height`, `unit`, `dpi`, `bleed`, `safeArea` (JSON: top/right/bottom/left), `colorProfileId` → ColorProfile, `background`, `isSystem`

### EditorState (Phase 4+)
- `id`, `versionId` → ProjectVersion (1:1), `canvasJSON` (Fabric.js serialized document), `updatedAt`

### BatchJob (Phase 5+)
- `id`, `userId` → User, `name`, `status` (enum: queued, processing, completed, completed_with_errors)
- `settings` (JSON — shared mode/cleanup/preset config applied to all items)
- `totalFiles`, `completedFiles`, `failedFiles`

### BatchItem (Phase 5+)
- `id`, `batchJobId` → BatchJob, `projectId` → Project (each item is a real Project so all normal tooling applies), `orderIndex`, `status` (enum: queued, processing, completed, failed, overridden)

### Integration (Phase 6+)
- `id`, `userId` → User, `provider` (enum: printful, printify, shopify, etsy)
- `accessToken` (encrypted at rest), `refreshToken` (encrypted), `externalShopId`, `connectedAt`

### IntegrationPush (Phase 6+)
- `id`, `projectId` → Project, `integrationId` → Integration, `externalProductId`, `status` (enum: pending, success, failed), `pushedAt`

---

## System components

1. **Next.js Web App** — dashboard, workspace UI (upload, cleanup, vectorize, colors, print settings, export, editor), auth pages, billing pages, project/preset/integration management screens. Talks to Postgres directly for CRUD (via Prisma) and enqueues jobs onto Redis/BullMQ for anything processing-heavy.
2. **Worker Service** — BullMQ consumers, one queue per job family (`vectorize`, `cleanup`, `background-removal`, `color-convert`, `validate`, `export`, `batch`, `ai`). Each consumer pulls source assets from R2, runs the relevant pipeline step, writes result Asset + updates Job row, releases. Horizontally scalable (more container replicas) without app changes — needed for Phase 5 batch load.
3. **Vectorization Engine module** (inside worker) — interface `vectorize(image, mode, params) → SVG`, with concrete implementations per mode (logo/potrace, illustration/color-separated trace, line-art/stroke-preserving trace), and a slot for a commercial API-backed implementation later. Includes the **"true vector" validator** (parses output SVG, fails/flags if it contains `<image>` instead of paths).
4. **Color Management module** (inside worker) — RGB→CMYK conversion + gamut check (Phase 3), ICC embedding via Ghostscript for PDF/TIFF export, EPS generation via Ghostscript.
5. **Print Validation module** (inside worker) — runs the 6 checks (resolution, color, dimensions, transparency, vector integrity, bleed) against a ProjectVersion + selected preset/print settings, produces `ValidationResult`.
6. **Editor (client-only, Phase 4)** — Fabric.js canvas loaded with the vector SVG; local undo/redo stack; autosaves `canvasJSON` to `EditorState` via debounced PATCH.
7. **Integration Adapters (Phase 6)** — one module per provider (Printful, Printify, Shopify, Etsy) implementing a common `push(project, credentials) → externalProductId` interface, invoked as a worker job type.
8. **Billing module** — Stripe checkout/portal + webhook handler updating `Subscription`/`UsageCounter`.
9. **Object Storage (R2)** — all binary assets; app/worker generate pre-signed URLs for upload/download; nothing binary ever passes through app server memory.

---

## API design

All routes are Next.js Route Handlers under `/api`. Auth requirement noted per route. "User" = must be authenticated and own the referenced resource (enforced via session + row-level ownership check in each handler).

### Auth
| Method | Path | Purpose | Auth |
|---|---|---|---|
| * | `/api/auth/[...nextauth]` | Auth.js handlers (login, magic link, session, logout) | Public |
| GET | `/api/auth/session` | Current session info | Public |

### Projects
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/projects` | List user's projects (search/filter/tag query params) | User |
| POST | `/api/projects` | Create project (name, optional productType) | User |
| GET | `/api/projects/:id` | Get project + latest version summary | User |
| PATCH | `/api/projects/:id` | Rename, tag, archive | User |
| DELETE | `/api/projects/:id` | Delete project + assets | User |
| GET | `/api/projects/:id/versions` | List versions (history) | User |
| POST | `/api/projects/:id/versions` | Create new version (fork current settings) | User |
| GET | `/api/projects/:id/versions/:versionId` | Get one version's full detail | User |
| POST | `/api/projects/:id/versions/:versionId/revert` | Make this version current | User |

### Uploads & Assets
| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/api/uploads/sign` | Get pre-signed R2 upload URL (validates type/size) | User |
| POST | `/api/projects/:id/assets` | Register an uploaded source asset, creates initial ProjectVersion | User |
| GET | `/api/assets/:id` | Get asset metadata | User |
| GET | `/api/assets/:id/download` | Pre-signed download URL | User |

### Processing pipeline
| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/api/projects/:id/cleanup` | Enqueue cleanup job (noise/sharpen/contrast/quantize params) | User |
| POST | `/api/projects/:id/remove-background` | Enqueue background removal job (method: color-key/manual/AI, params) | User |
| POST | `/api/projects/:id/vectorize` | Enqueue vectorization job (mode + quality params) | User |
| POST | `/api/projects/:id/convert-cmyk` | Enqueue CMYK conversion job (colorProfileId) | User |
| POST | `/api/projects/:id/validate` | Enqueue print validation job (presetId or custom print settings) | User |
| POST | `/api/projects/:id/export` | Enqueue export job (format, RGB/CMYK, dpi, dimensions) | User |
| GET | `/api/jobs/:id` | Poll job status/result | User |
| GET | `/api/projects/:id/jobs` | Job history for a project | User |

### Print settings, presets, color
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/presets` | List system + user presets | User |
| POST | `/api/presets` | Create custom preset | User |
| PATCH | `/api/presets/:id` | Edit custom preset | User |
| DELETE | `/api/presets/:id` | Delete custom preset | User |
| GET | `/api/color-profiles` | List available ICC profiles | User |
| GET | `/api/projects/:id/versions/:versionId/print-score` | Get latest ValidationResult | User |

### Editor (Phase 4)
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/projects/:id/versions/:versionId/editor-state` | Fetch canvas JSON | User |
| PUT | `/api/projects/:id/versions/:versionId/editor-state` | Autosave canvas JSON | User |

### Batch (Phase 5)
| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/api/batches` | Create batch job from multiple uploaded files + shared settings | User |
| GET | `/api/batches` | List user's batch jobs | User |
| GET | `/api/batches/:id` | Batch status + summary | User |
| GET | `/api/batches/:id/items` | List items with per-item status/score | User |
| POST | `/api/batches/:id/items/:itemId/override` | Detach item into standalone project for manual edit | User |
| GET | `/api/batches/:id/export` | Trigger/download ZIP of all results | User |

### Integrations (Phase 6)
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/integrations` | List connected integrations | User |
| POST | `/api/integrations/:provider/connect` | Start OAuth flow | User |
| GET | `/api/integrations/:provider/callback` | OAuth callback, stores tokens | User |
| DELETE | `/api/integrations/:provider` | Disconnect | User |
| POST | `/api/projects/:id/push/:provider` | Push finalized export to storefront/vendor | User |

### Billing
| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/api/billing/checkout` | Create Stripe Checkout session | User |
| POST | `/api/billing/portal` | Create Stripe billing portal session | User |
| POST | `/api/webhooks/stripe` | Stripe webhook (subscription updates) | Signature-verified, public |

---

## External services & integrations

- **Cloudflare R2** — asset storage (all phases).
- **Neon/Supabase Postgres** — primary database.
- **Upstash/Railway Redis** — BullMQ broker.
- **Resend** — transactional email (magic link, export-ready notifications).
- **Stripe** — billing.
- **Sentry** — error monitoring (app + worker).
- **Clipdrop/remove.bg API** (Phase 2) — AI background removal, called from worker; swappable behind an interface.
- **Commercial vectorization API** (optional, Phase 2 illustration mode if open-source tracing proves insufficient) — wrapped behind `VectorizerEngine`.
- **Ghostscript** (bundled in worker container, not a hosted service) — CMYK conversion, EPS/PDF generation.
- **Printful, Printify, Shopify, Etsy APIs** (Phase 6) — OAuth + REST, one adapter each.
- **AI upscaling provider** (Phase 6) — e.g. Real-ESRGAN-hosted API, called from worker for low-res source flags.

---

## Auth & security

- **Auth.js** sessions (DB-backed, httpOnly secure cookies). Email/password (bcrypt-hashed) + magic link.
- Every API route validates session and checks resource ownership (`project.userId === session.user.id`) before touching DB/storage — no cross-tenant access.
- **Uploads**: pre-signed, short-TTL R2 URLs generated per-request; server validates MIME type + size limits before signing; worker re-validates file signature (not just extension) before processing.
- **Secrets**: integration tokens (Printful/Printify/Shopify/Etsy OAuth) encrypted at rest (AES-256, app-level encryption key from env, rotated via KMS if scale demands).
- **Rate limiting**: per-user limits on job creation endpoints (Redis-backed sliding window) to prevent abuse of paid AI/processing calls; plan-based quotas enforced via `UsageCounter`.
- **Webhooks** (Stripe): signature verification required.
- **File isolation**: worker processes run in ephemeral containers/temp dirs per job; temp files wiped after job completion to avoid cross-job leakage.
- **CMYK/print disclaimers**: surfaced in UI copy, not a security concern but a legal/support-risk mitigation called out in PRD — enforced at the export confirmation step.
- **Copyright**: ToS-only responsibility per PRD; no content moderation pipeline planned.

---

## Deployment

- **App**: Vercel (Next.js), auto-deploy from `main`, preview deployments per PR.
- **Worker**: Dockerized Node service on Railway or Fly.io, with Ghostscript + potrace + libvips (for `sharp`) baked into the image. Runs BullMQ consumers as long-lived processes; scale replica count manually as batch load grows (Phase 5+).
- **Database**: Neon (Postgres) — branch-per-environment (dev/staging/prod), Prisma migrations run in CI before deploy.
- **Redis**: Upstash, single instance, upgrade tier as queue depth grows.
- **Storage**: R2 bucket per environment.
- **CI**: GitHub Actions — typecheck, lint, Prisma migrate diff check, run worker unit tests (vectorization output validation, CMYK conversion correctness) before merge.
- **Environments**: local dev (docker-compose: Postgres, Redis, MinIO as R2 stand-in), staging, production. Worker and app share the same Prisma schema/package via a shared `packages/db` workspace in a monorepo (Turborepo) — avoids schema drift between app and worker from day one.

---

## Development roadmap

### Phase 1 — Core Vectorization Loop
1. Monorepo scaffold (Turborepo): `apps/web` (Next.js), `apps/worker`, `packages/db` (Prisma schema + client), `packages/shared` (types). — *0.5 day*
2. Auth (Auth.js, email/password + magic link), User table, session-protected dashboard shell. — *2 days*
3. Project CRUD + dashboard (New Project, Recent Projects list). — *1.5 days*
4. Upload flow: pre-signed R2 upload, client-side validation, `Asset`(source) + `ProjectVersion` creation. — *2 days*
5. Redis + BullMQ wiring between app and worker; `Job` table; generic enqueue/poll pattern proven end-to-end with a no-op job. — *2 days*
6. Vectorization engine v1 (potrace/imagetracer, Simple/Logo mode only) as a worker job; true-vector validator check. — *4 days*
7. Basic background removal (color-key, white/transparent auto-detect + manual color pick). — *1.5 days*
8. Preview UI: Original vs Vector toggle, zoom controls. — *2 days*
9. Export: SVG + PNG (transparent) download. — *1 day*
10. **Ship checkpoint:** upload → vectorize (logo mode) → preview → export SVG/PNG, project persisted and revisitable.

### Phase 2 — Vectorization Modes & Quality Controls
1. Illustration mode (multi-color layer separation + tuned tracing). — *4 days*
2. Line Art mode (stroke-preserving trace, noise removal tuning). — *3 days*
3. Quality control panel (detail, simplification, color count, corner sensitivity, smoothness, min shape size) wired to "Regenerate" (new job on existing version, no re-upload). — *3 days*
4. Pre-vectorization cleanup pipeline (`sharp`-based: noise reduction, sharpen, contrast, quantization, artifact removal) as its own job type + UI panel. — *3 days*
5. Original/Cleaned/Vectorized 3-way compare + before/after slider component. — *2 days*
6. AI background removal (third-party API integration) + "keep selected colors" UI. — *2.5 days*
7. PDF + TIFF export (`pdf-lib`, `sharp`); Ghostscript wired into worker container in preparation for EPS/CMYK (Phase 3); EPS attempted, flagged as beta if unreliable. — *3 days*
8. **Ship checkpoint:** all three vectorization modes live, quality controls regenerate without re-upload, PDF/TIFF export working.

### Phase 3 — Color Management & Print-Ready Workflow
1. ColorProfile seed data + RGB→CMYK conversion pipeline (Ghostscript-based) as a worker job. — *4 days*
2. Color inspector UI (RGB vs CMYK swatches, out-of-gamut flags). — *2.5 days*
3. Print Ready panel: dimensions/unit/DPI/bleed/safe-area inputs with live pixel calc. — *2 days*
4. PODPreset seed data (9 product types) + custom preset CRUD UI. — *2.5 days*
5. Print validation engine (6 checks) as worker job + `ValidationResult` storage. — *3 days*
6. Print Readiness Score UI (score + plain-language fix list). — *2 days*
7. Export upgrade: CMYK/RGB toggle, 300 DPI enforcement, custom dimensions, ICC-embedded PDF/TIFF. — *3 days*
8. **Ship checkpoint:** full "print-ready" loop — pick preset, convert CMYK, get readiness score, export compliant file. This is the core paid-tier differentiator.

### Phase 4 — Design Editor
1. Fabric.js canvas integration loading vector SVG into editable objects. — *4 days*
2. Object ops (select/move/resize/rotate/delete/duplicate/group/ungroup). — *3 days*
3. Path-level node editing. — *4 days*
4. Click-to-recolor with live RGB/CMYK preview update. — *2 days*
5. Stroke editing (width/color/dash) for line-art outputs. — *1.5 days*
6. Text tool (web-safe + uploaded fonts). — *2.5 days*
7. Background swap control (solid/transparent/custom). — *1 day*
8. Undo/redo stack + autosave to `EditorState`. — *2.5 days*
9. Final 3-panel workspace layout (left tools / center canvas / right contextual controls) replacing earlier simpler UI. — *3 days*
10. **Ship checkpoint:** user can fix last-mile issues (recolor, reposition, add text) without leaving the app.

### Phase 5 — Batch Processing & Project Management
1. Multi-file drag-drop upload UI. — *2 days*
2. `BatchJob`/`BatchItem` tables + pipeline that spins up one Project per file and runs the standard job chain with shared settings. — *4 days*
3. Batch progress tracking UI (per-file status). — *2 days*
4. Per-file override (detach into standalone project for manual fix, rejoin not required). — *1.5 days*
5. Batch results dashboard with per-item Print Readiness Score, failure flags. — *2 days*
6. ZIP export of batch results. — *1.5 days*
7. Full version history UI (source→cleaned→vector→CMYK→export timeline) using existing `ProjectVersion` chain. — *2.5 days*
8. Version revert. — *1 day*
9. Dashboard upgrade: search/filter/tag, bulk delete/re-export/duplicate. — *2.5 days*
10. **Ship checkpoint:** upload 20 files, walk away, come back to a scored, downloadable ZIP.

### Phase 6 — Ecosystem & AI Layer
1. Printful integration (OAuth + push finalized export to product). — *4 days*
2. Printify integration. — *3 days*
3. Shopify integration (publish product). — *4 days*
4. Etsy integration. — *4 days*
5. Automatic POD mockup generation (composite vector art onto product template images). — *4 days*
6. AI upscaling hook, auto-triggered when resolution check fails validation. — *3 days*
7. Automatic palette generation + smart recolor suggestions. — *3.5 days*
8. Design variation generation (color/layout variants). — *3.5 days*
9. Typography/font detection on source images. — *3 days*
10. Design quality scoring (distinct from Print Readiness Score). — *3 days*
11. Marketplace export presets (Etsy digital bundles, vendor spec sheets). — *2 days*
12. **Ship checkpoint (incremental):** each integration/AI feature ships and is billed/gated independently — no single "big bang" release required for this phase.