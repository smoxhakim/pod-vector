# TODO — Phased Roadmap

## Phase 1 — Core Vectorization Loop
- [x] Monorepo scaffold (Turborepo apps/web, apps/worker, packages/db, packages/shared)
- [x] Auth (Auth.js email/password + magic link), User table, protected dashboard shell
- [x] Project CRUD + dashboard (new/recent projects)
- [ ] Upload flow: pre-signed R2 upload, Asset(source) + ProjectVersion creation
- [x] Redis + BullMQ wiring, Job table, no-op job proven end-to-end
- [x] Vectorization engine v1 (potrace/imagetracer, Simple/Logo mode) + true-vector validator
- [x] Basic background removal (color-key, white/transparent auto-detect)
- [x] Preview UI: Original vs Vector toggle, zoom controls
- [x] Export: SVG + PNG (transparent)
- [ ] Ship checkpoint: upload → vectorize → preview → export

## Phase 2 — Vectorization Modes & Quality Controls
- [ ] Illustration mode (multi-color layer separation)
- [ ] Line Art mode (stroke-preserving trace)
- [ ] Trace quality: potrace leaves ≤1px flat spots at the extremes of large curves (seen at 200% zoom on circles); try 2x-supersampled layer masks
- [ ] Quality control panel + Regenerate
- [ ] Pre-vectorization cleanup pipeline (sharp-based)
- [ ] Original/Cleaned/Vectorized compare + before/after slider
- [ ] AI background removal + keep-selected-colors
- [ ] PDF + TIFF export, Ghostscript wired in worker, EPS beta

## Phase 3 — Color Management & Print-Ready Workflow
- [ ] ColorProfile seed + RGB→CMYK conversion pipeline
- [ ] Color inspector UI (RGB/CMYK swatches, gamut flags)
- [ ] Print Ready panel (dimensions/unit/DPI/bleed/safe area)
- [ ] PODPreset seed data + custom preset CRUD
- [ ] Print validation engine (6 checks) + ValidationResult
- [ ] Print Readiness Score UI
- [ ] Export upgrade: CMYK/RGB toggle, 300 DPI enforcement, ICC embedding

## Phase 4 — Design Editor
- [ ] Fabric.js canvas loading vector SVG
- [ ] Object ops (select/move/resize/rotate/delete/duplicate/group)
- [ ] Path-level node editing
- [ ] Click-to-recolor with live preview
- [ ] Stroke editing
- [ ] Text tool
- [ ] Background swap
- [ ] Undo/redo + autosave (EditorState)
- [ ] Final 3-panel workspace layout

## Phase 5 — Batch Processing & Project Management
- [ ] Multi-file drag-drop upload
- [ ] BatchJob/BatchItem tables + pipeline
- [ ] Batch progress tracking UI
- [ ] Per-file override
- [ ] Batch results dashboard
- [ ] ZIP export
- [ ] Full version history UI + revert
- [ ] Dashboard search/filter/tag, bulk actions

## Phase 6 — Ecosystem & AI Layer
- [ ] Printful integration
- [ ] Printify integration
- [ ] Shopify integration
- [ ] Etsy integration
- [ ] Automatic POD mockup generation
- [ ] AI upscaling hook
- [ ] Palette generation + smart recolor
- [ ] Design variation generation
- [ ] Typography/font detection
- [ ] Design quality scoring
- [ ] Marketplace export presets
