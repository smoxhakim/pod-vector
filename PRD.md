# PRD: POD Vector Studio

## Problem

POD creators produce or receive artwork as PNG/JPG/WEBP, but print vendors and marketplaces need vector, CMYK, correctly-sized, print-validated files. Today that requires stitching together 3-4 tools (Illustrator or Inkscape for tracing, Photoshop for cleanup and color conversion, a background remover, and manual measurement/DPI math). Each step has a learning curve, and mistakes (wrong DPI, RGB submitted as CMYK, low-res upscales) cause rejected orders, muddy prints, or wasted reprints. There's no single tool built specifically around the "raster design in, print-ready vector out" workflow for POD.

## Target user & job-to-be-done

**Target user:** Solo or small-team POD sellers (Etsy, Printful, Printify, Redbubble sellers) and freelance designers who serve them. Most are not trained in Illustrator/print production; many use Canva or AI image generators to create source art.

**Job-to-be-done:** "Take this PNG I designed/generated and turn it into a file I can actually hand to a print vendor with confidence it will print correctly — without learning Illustrator or hiring a designer."

## Value proposition (the wedge)

Generic vectorizers (Vectorizer.AI, Adobe's image trace) stop at "raster to SVG." Generic background removers stop at transparency. Neither knows what "print-ready for a 12x16in DTG shirt at 300 DPI in CMYK with bleed" means. POD Vector Studio's wedge is combining vectorization + cleanup + color conversion + POD-specific print validation into one guided pipeline, with a Print Readiness Score that tells the user exactly what's wrong and how to fix it — something no single existing tool does end to end.

## Product vision (the full build)

A POD creator uploads a raster design, picks a vectorization mode suited to their artwork (logo/flat, illustration, or line art), and the app produces true editable vector paths — not a raster image embedded in an SVG wrapper. They clean up noise and background, adjust vector quality (detail, color count, smoothing) with live re-generation, then move into Print Ready mode where they pick a POD product preset (t-shirt, mug, poster, sticker, etc.) or set custom dimensions/DPI/bleed. The app converts RGB to CMYK, flags out-of-gamut colors, and runs automated print validation (resolution, color, dimensions, transparency, vector integrity, bleed) producing a Print Readiness Score with specific fixes. A lightweight built-in editor lets them nudge paths, recolor, add text, and group objects without leaving the app. Finished projects export as SVG/PDF/EPS/PNG/TIFF with embedded profiles, individually or in batch across dozens of designs at once, with everything organized into saved projects that preserve every stage from source file to final export. Later, the app connects directly to Printful/Printify/Shopify/Etsy so files move straight from studio to storefront, and AI features (upscaling, smart recolor, mockup generation, quality scoring) layer on top of the core deterministic pipeline.

## Phased delivery

### Phase 1 — Core Vectorization Loop
**Goal:** A user can upload a PNG/JPG, get a real vector SVG back, and download it. This alone is a sellable product.

1. Auth + account (email/password or magic link), single-user projects.
2. Upload PNG/JPG/WEBP (client-side validation: size, dimensions, format).
3. Vectorization engine v1: integrate a proven tracing engine (Potrace-based pipeline, e.g., via `potrace`/`imagetracerjs` for path extraction, or a paid vectorization API like Vectorizer.AI as a wrapped backend service) — single mode tuned for **Simple/Logo** artwork (limited colors, flat shapes, clean paths).
4. Basic background removal: auto white/transparent detection + one-click removal (color-key based, no AI model yet).
5. Output validation: reject/flag "fake vectorization" (raster embedded in SVG) — internal check that output SVG contains actual path/shape elements, not `<image>` tags.
6. Preview: Original vs Vector toggle, zoom controls (25/50/100/200%, fit-to-screen).
7. Export: SVG and PNG (transparent background), fixed at source resolution.
8. Save project (source file + vector result stored, retrievable from a simple dashboard: New Project, Recent Projects).
9. Processing runs as an async job (queue-based, e.g., BullMQ + Redis or a hosted queue) so uploads don't block the UI — foundation for batch processing later.

### Phase 2 — Vectorization Modes & Quality Controls
**Goal:** Handle the full range of POD artwork types and give users control over output quality.

1. Illustration mode: multi-color separation, smoother curve fitting, detail preservation (tuned tracing parameters / color-layer separation before tracing).
2. Line Art mode: stroke-preserving trace, aggressive noise removal, tuned for sketches/typography/B&W art.
3. Vector quality control panel: detail level, path simplification, color count, corner sensitivity, smoothness, minimum shape size, noise threshold — with "Regenerate" button (re-runs job with new params, doesn't require re-upload).
4. Pre-vectorization image cleanup: noise reduction, sharpening, contrast adjustment, color quantization, small-artifact removal (implemented with `sharp` + custom filters).
5. Three-way comparison: Original / Cleaned / Vectorized, plus a before/after slider component.
6. Improved background removal: manual color picker, "keep selected colors," AI-based subject/background separation (integrate an open-source model like U2Net/RMBG via a self-hosted inference service or a background-removal API).
7. Additional export formats: PDF and TIFF (via `pdf-lib`/Ghostscript for PDF, `sharp` for TIFF). EPS added if a reliable conversion path exists (Ghostscript-based); otherwise deferred and flagged.

### Phase 3 — Color Management & Print-Ready Workflow
**Goal:** Turn the tool from "vectorizer" into "print production tool" — this is the core differentiator.

1. RGB → CMYK conversion pipeline (ICC-profile based, using a color management library or Ghostscript's color conversion) with a selectable profile (e.g., US Web Coated SWOP, generic CMYK).
2. Color inspector: shows original RGB values, converted CMYK values, and flags out-of-gamut colors with visual warning (e.g., highlighted swatches).
3. Print Ready panel: width, height, unit selector (px/mm/cm/in), DPI/PPI, bleed, safe area, color profile, background choice, output format — with live pixel-dimension calculation.
4. POD product presets: T-Shirt (front/back/pocket), Hoodie, Sweatshirt, Mug, Poster, Sticker, Tote Bag, Phone Case, Wall Art — each pre-filled with recommended dimensions/DPI/bleed/safe area. Custom preset creation and saving.
5. Print validation engine: automated checks for resolution sufficiency, CMYK gamut issues, dimension compatibility with selected preset, transparency presence, vector path integrity, bleed configuration.
6. Print Readiness Score: aggregate score with a plain-language list of specific issues and how to fix each one (not just a number).
7. Export system upgrade: CMYK/RGB toggle, transparent background option, 300 DPI enforcement, custom dimension export, embedded ICC profile in PDF/TIFF exports where format supports it.

### Phase 4 — Design Editor
**Goal:** Let users fix the last 10% without leaving the app.

1. Canvas-based vector editor (built on Fabric.js or Konva with SVG path support) integrated into the workspace.
2. Object operations: select, move, resize, rotate, delete, duplicate, group/ungroup.
3. Path editing: node-level anchor point editing on vector paths.
4. Color editing: click-to-recolor individual paths/shapes, with the RGB/CMYK preview updating live.
5. Stroke editing: width, color, dash adjustments on line-art outputs.
6. Text tool: add/edit text layers (web-safe + uploaded fonts), positioned on canvas alongside vector art.
7. Background swap: solid color, transparent, or custom color behind the artwork.
8. Undo/redo history stack, autosave to the project.
9. Three-panel workspace layout finalized: left sidebar (Upload/Cleanup/Vectorize/Colors/Print/Export), center canvas, right sidebar (contextual tool controls) — replacing the simpler Phase 1-3 UI.

### Phase 5 — Batch Processing & Project Management
**Goal:** Scale the workflow from "one design" to "a full product catalog."

1. Multi-file upload (drag-and-drop batch, e.g., 20+ PNGs at once).
2. Batch pipeline: apply the same mode/cleanup/CMYK/preset settings across all files automatically (background removal → vectorize → cleanup → CMYK → validate → export), running through the existing job queue with progress tracking per file.
3. Per-file override: user can pull any single file out of the batch to manually adjust before re-running.
4. Batch results dashboard: shows each file's Print Readiness Score, flags failures for review.
5. ZIP export of all batch results in chosen formats.
6. Full project history: every stage retained and revisitable (source → cleaned → vector → CMYK → final exports), with named projects (e.g., "Moroccan Eagle T-Shirt").
7. Project versioning: track edits over time, revert to a previous version.
8. Dashboard upgrade: search/filter projects, tag by product type, bulk actions (delete, re-export, duplicate).

### Phase 6 — Ecosystem & AI Layer
**Goal:** Move from standalone tool to the hub of a POD seller's production pipeline.

1. Printful and Printify integration: push finalized, validated exports directly to product mockups/listings.
2. Shopify and Etsy integration: publish finished designs/products directly from a project.
3. Automatic POD mockup generation (apply vector art to product templates: shirt, mug, poster mockup images).
4. AI upscaling for low-resolution source images before vectorization (flagged automatically when resolution check fails in Phase 3's validation).
5. Automatic color palette generation and smart recoloring (suggest palettes, apply consistent recolors across a design).
6. Design variation generation (color/layout variants of an existing vectorized design).
7. Automatic typography/font detection on source images (identify likely font family for text-based designs).
8. Design quality scoring (composition/legibility feedback, distinct from the Print Readiness Score).
9. Marketplace-ready export presets (Etsy digital download bundles, print-vendor-specific spec sheets).

## Success metrics

- **Activation:** % of new signups who complete upload → export at least once within first session.
- **Time to first export:** median time from upload to downloaded file (target: under 3 minutes for a simple logo in Phase 1).
- **Vectorization quality (proxy):** % of exports where user does NOT immediately re-upload/re-run the same source image with different settings (signals first result was acceptable).
- **Print Readiness adoption (Phase 3+):** % of exports that pass validation with a "ready" score vs. exported anyway with warnings ignored.
- **Batch usage (Phase 5+):** average number of files per batch job, as a proxy for power-user retention.
- **Paid conversion:** free-to-paid conversion rate, and which phase's feature (vector modes, print validation, batch, integrations) is cited as the reason for upgrading (via cancellation/upgrade surveys).
- **Retention:** month-2 retention of paying users; churn reasons tagged to specific gaps (e.g., "EPS export missing," "colors don't match print").
- **Support burden:** number of support tickets related to output quality/color mismatch per 100 exports — should trend down as Phase 2-3 mature.

## Risks & assumptions

- **Vectorization quality is the make-or-break risk.** Open-source tracing (Potrace/ImageTracer) handles flat logos well but struggles with complex illustrations and photo-like art. Assumption: Phase 1-2 ship with genuinely good results only for logo/flat/line-art categories; illustration mode may require licensing a commercial vectorization API/SDK, which adds per-conversion cost that must be priced into the plan.
- **"True vectorization" claim needs constant enforcement.** Any shortcut (e.g., falling back to embedding a raster in SVG when tracing fails) undermines the core promise — needs an automated internal check plus honest UI messaging ("this image is too complex to fully vectorize, here's what we could extract") rather than silently degrading.
- **CMYK conversion without proper color management can mislead users.** Screen-based CMYK preview is always an approximation; assumption is that clear disclaimers ("this is a simulation, actual print may vary by vendor/press") are necessary to avoid support disputes and refund requests over "wrong colors."
- **AI background removal and upscaling have real inference costs.** At scale (especially batch processing), per-image AI model costs (self-hosted GPU or third-party API) need to be modeled into pricing before Phase 2/6 ship, or margins disappear.
- **EPS export is a known technical risk.** Reliable EPS generation typically depends on Ghostscript or similar tooling that's finicky to run in a serverless environment; assumption is this requires a dedicated worker/VM rather than serverless functions, adding infra complexity.
- **Solo developer bandwidth is the biggest sequencing constraint.** Editor (Phase 4) and integrations (Phase 6) are individually large enough to be multi-month efforts; the phase order assumes the core vectorize→print-ready loop (Phases 1-3) is valuable enough to sustain revenue and validate demand before investing in the editor and ecosystem work.
- **Integration partners (Printful, Printify, Shopify, Etsy) control their own API stability and approval processes.** Phase 6 timeline assumes their developer APIs remain accessible to small/indie apps without requiring a lengthy partner review process; this should be verified before committing a release date.
- **Assumption:** most target users' source images are original designs or licensed art they have rights to vectorize — the product does not police copyright, and this is treated as the user's responsibility (stated in ToS, not a product feature).