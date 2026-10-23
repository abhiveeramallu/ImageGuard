# Architecture

```
React (Vite, TS, Tailwind) ──HTTP/multipart──▶ FastAPI ──▶ services/
   pages/ components/ hooks/                     api/         image_service      decode + validate + encode
   services/api.ts (typed axios client)          schemas/     watermark_service  Pillow compositing
                                                 core/        copy_move_service  OpenCV ORB baseline
                                                              artifact_store     in-memory TTL store
                                                              report_service     JSON / HTML report
```

## Request flow
**Watermark**: upload → size cap while streaming → decode by content (Pillow) with pixel/side limits and decompression-bomb guard → EXIF orientation → build RGBA stamp → opacity on alpha only → rotate → alpha-composite (clipped) → encode PNG/JPEG → binary response. Nothing is persisted.

**Detection**: upload → decode → RGB array → `detect_copy_move` → PNG-encode annotated/mask/heatmap → build reports → put in `ArtifactStore` (RAM, TTL, entry and byte caps) → JSON with artifact URLs. The frontend fetches artifacts as blobs and renders them via object URLs (revoked on change/unmount).

## Detector (`copy_move_service.py`)
ORB → self-kNN Hamming matching (skip self and neighbours < `min_displacement`) → ratio + absolute distance filter → unordered de-dup → sequential RANSAC (`estimateAffinePartial2D`: shift/rotation/uniform scale) → cluster filters (min matches, hull area, overlap, scale 0.5–2) → padded convex-hull localization → artifacts. Repetitive structure (≥ 6 distinct clusters) ⇒ `inconclusive`. Few keypoints ⇒ `inconclusive`.

Hull padding is 16 px ≈ ORB patch radius. Localization is approximate (see IoU in TESTING.md).

## Extending
New methods (e.g., a PyTorch segmentation model) should expose a function returning the same `DetectionOutput`/response schema; add a route or a `method` selector in `routes_detect.py`. The frontend only consumes the response contract (`types/api.ts`), so it needs no rewrite.

## Safety controls
Upload/pixel/side limits, content-based format checks, bounded stamp/tile sizes, concurrency semaphore (503 when saturated), per-IP rate limit, strict CORS, no filesystem writes, sanitized download filenames, allow-listed artifact names, CSP on the HTML report, generic 500 errors without internals. Docs/OpenAPI are disabled when `IMAGEGUARD_ENVIRONMENT=production`.

## Known design constraints
The artifact store and rate limiter are per-process. Run a single worker (as in `render.yaml`) or move them to shared storage (Redis/S3) to scale horizontally.
