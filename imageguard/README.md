# ImageGuard — Image Forgery Detection & Watermarking

A web app with two modules:

* **Watermark Studio** – visible text or logo watermarks (position, opacity, size, colour, rotation, margin, single/tiled, outline/shadow), live preview, original-vs-result comparison, PNG/JPEG download.
* **Forgery Detection** – an explainable **copy-move** detector (ORB + Hamming matching + RANSAC). It returns an annotated image, a candidate-region mask, a match-density overlay, region coordinates, match statistics, timing, and JSON/HTML reports.

It is a heuristic baseline. It reports *candidates for review*; it does not prove an image is forged or authentic. See [Limitations](#known-limitations).

## Features (all implemented)
* Upload validation by decoded content, size / pixel / dimension limits, decompression-bomb guard, EXIF orientation, RGB/RGBA/grayscale/palette handling.
* Real processing for every number shown — no placeholder results, no confidence scores.
* Typed API client, upload progress, cancellation, timeouts, retry, empty/error states, zoomable viewers, responsive layout.
* In-memory results with TTL (nothing written to disk), random IDs and allow-listed artifact names.
* Server-side validation of every option, restricted CORS, per-IP rate limit, concurrency cap.

## Stack
React 19 + Vite + TypeScript + Tailwind 3 + Lucide · FastAPI + Uvicorn · OpenCV (headless) · Pillow · NumPy · Pydantic · pytest · Vitest.

## Repository layout
```
backend/app/{main.py, api/, schemas/, core/, services/}   backend/tests/
frontend/src/{pages, components, hooks, services, types, utils}
docs/{ARCHITECTURE,API,TESTING,DEPLOYMENT}.md   scripts/   render.yaml
```

## Prerequisites
Python 3.11–3.13 (developed on 3.12; OpenCV wheels may lag on newer Pythons) and Node 20+.

## Local setup and run
```bash
scripts/setup.sh            # venv + backend deps + frontend deps + .env files
scripts/dev-backend.sh      # http://localhost:8000  (docs at /api/docs)
scripts/dev-frontend.sh     # http://localhost:5173
```
Manual equivalents:
```bash
cd backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
cd frontend && npm install && npm run dev
```

## Configuration
Backend (`backend/.env`, prefix `IMAGEGUARD_`): `ENVIRONMENT`, `CORS_ORIGINS`, `MAX_UPLOAD_BYTES` (10 MB), `MAX_IMAGE_PIXELS` (16 MP), `MAX_IMAGE_SIDE` (8000), `ARTIFACT_TTL_SECONDS` (900), `MAX_CONCURRENT_JOBS` (2), `RATE_LIMIT_PER_MINUTE` (60). Frontend (`frontend/.env`): `VITE_API_URL`.

## API
Summary — full reference with examples in [docs/API.md](docs/API.md):
`GET /api/health` · `POST /api/watermark` · `POST /api/detect/copy-move` · `GET /api/results/{analysis_id}/{artifact_name}` · `GET /api/docs` (non-production).

## How the watermark works
Decode (+EXIF) → render text (Pillow, DejaVu/Arial/bundled fallback) or scale the logo (premultiplied-alpha resize, so transparent edges stay clean) into a transparent RGBA stamp → apply opacity to the alpha channel only → rotate with transparent fill → alpha-composite onto the image at the chosen anchor (or on a staggered grid when tiled), clipped to the image → encode. Dimensions never change. Font size, stamp area and tile count are capped.

## How copy-move detection works
1. Grayscale analysis copy, downscaled to `max_dimension` if needed (coordinates are mapped back).
2. ORB keypoints + 256-bit descriptors.
3. For each descriptor, find nearest neighbours by Hamming distance, **excluding itself and anything closer than `min_displacement` px**; keep it if the best match passes Lowe's ratio test and a max-distance cap; merge symmetric duplicates.
4. Sequential RANSAC fits similarity transforms (shift, rotation, uniform scale); matches agreeing on one transform form a cluster.
5. Clusters are rejected if too small, too tightly packed, overlapping themselves, or implausibly scaled; survivors are localized by padded convex hulls of matched keypoints (region A / region B — the method cannot tell original from copy).
6. Artifacts: annotated image, binary mask, match-density heatmap, JSON/HTML report.

Status: `candidate_regions_found` (≥ 1 cluster passed), `no_candidate_regions_found`, or `inconclusive` (too few keypoints, or ≥ 6 distinct clusters suggesting repetitive texture).

## Interpreting results
* Counts are evidence volume, not probabilities. Review highlighted regions by eye.
* “No candidates” means *this method found nothing*, not that the image is authentic.
* Heatmap = density of retained matched keypoints; mask = approximate hulls, not pixel-exact tampering masks.

## Known limitations
Detects only duplication within one image. Misses smooth/low-texture copies, strong resize/rotation/blur/recompression, heavily post-processed clones. Can flag repeated natural or man-made patterns. Localization is approximate. Parameters were tuned on synthetic images only; no real-photo accuracy has been measured. Artifact store and rate limiter are per-process (single worker).

### How related techniques differ
| Technique | Meaning | In this app |
|---|---|---|
| Copy-move detection | Regions duplicated within one image | Implemented (baseline) |
| Splicing detection | Content pasted from another image | Not implemented |
| Pixel-level tampering localization | Per-pixel altered/unaltered map (usually a trained model) | Not implemented; regions are approximate |
| Visible watermarking | Overlay text/logo | Implemented; deters reuse, can be cropped/removed, proves nothing about authenticity |
| Invisible watermarking | Hidden embedded signal | Not implemented |

## Tests
`scripts/test-all.sh` — details and measured results in [docs/TESTING.md](docs/TESTING.md).

## Verification performed
Backend and frontend were run locally; in a browser, a synthetic forged PNG was uploaded and analysed through the UI (real candidate regions rendered), the Watermark Studio live preview and tiled layout rendered real backend output, and invalid/unsupported files showed errors. Nothing has been deployed.

## Deployment
See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (Render for the API via `render.yaml`, Vercel for the frontend via `frontend/vercel.json`).

## Future improvements
Trained segmentation model behind the same response schema; SIFT/AKAZE or dense-field (PatchMatch) matching for resized/low-texture copies; evaluation on CASIA/CoMoFoD-style benchmarks to calibrate thresholds; shared artifact storage (Redis/S3) for multi-worker hosting; invisible watermarking; browser E2E tests.
