# ImageGuard — Image Forgery Detection & Watermarking

A web app (React + FastAPI + OpenCV) for **detecting candidate image manipulation** and **watermarking images**. Detection results are evidence for human review, never proof of forgery or authenticity.

## Feature status
| Feature | Status |
|---|---|
| Visible text/logo watermark (position, opacity, size, colour, rotation, margin, tiling, outline/shadow, live preview, PNG/JPEG) | **Implemented & tested** |
| Copy-move detection (ORB + Hamming + RANSAC; annotated image, mask, heatmap, JSON/HTML report) | **Implemented & tested** |
| Invisible watermark: embed + HMAC-checked verify (DCT-QIM), downloadable output | **Implemented & tested** (synthetic robustness results below) |
| Attack Lab (controlled image tampering, watermark degradation, 8 experiments, ground-truth tracking, evaluation metrics, and reports) | **Implemented & tested** |
| Multi-method analysis API/UI (copy-move, splicing, localization, all supported) with independent results and threshold re-rendering | **Implemented & tested** |
| Splicing / local-inconsistency detection | **Experimental heuristic** (noise-residual + JPEG ELA). Not a trained or validated detector |
| Model-based pixel-level localization (ONNX Runtime + model card contract, probability map, mask, overlay, heatmap, adjustable threshold) | **Implemented, awaiting real weights.** Reports `unavailable` until a model is configured; pipeline verified with generated untrained ONNX graphs only. See [docs/MODELS.md](docs/MODELS.md) |
| Evaluation on real photographs / public datasets | **Not done** |
| Cryptographic proof of ownership, resize/rotation-robust invisible watermarks, AI-generated-content detection | **Not implemented** |

## Quick start
```bash
scripts/setup.sh            # venvs, deps, .env files (generates a local random IMAGEGUARD_WATERMARK_KEY)
scripts/dev-backend.sh      # http://localhost:8000  (API docs: /api/docs)
scripts/dev-frontend.sh     # http://localhost:5173
```
Manual: `cd backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && .venv/bin/uvicorn app.main:app --reload`; `cd frontend && npm ci && npm run dev`.
Prerequisites: Python 3.11–3.13, Node 20+.

## Configuration (`backend/.env`, prefix `IMAGEGUARD_`)
`ENVIRONMENT`, `CORS_ORIGINS`, `MAX_UPLOAD_BYTES` (10 MB), `MAX_IMAGE_PIXELS` (16 MP), `MAX_IMAGE_SIDE`, `ARTIFACT_TTL_SECONDS` (900), `MAX_CONCURRENT_JOBS`, `RATE_LIMIT_PER_MINUTE`,
**`WATERMARK_KEY`** (secret, required for invisible watermarking; server-side only), `LOCALIZATION_MODEL_PATH` / `LOCALIZATION_MODEL_CONFIG` (optional), `MODEL_DEVICE` (`auto|cpu|cuda`), `MODEL_THREADS`, `INFERENCE_TIMEOUT_SECONDS`, `INFERENCE_MAX_SIDE`.
Frontend (`frontend/.env`): `VITE_API_URL`.

## Detection methods (kept separate, never merged into one score)
1. **Copy-move (ORB)** — finds regions duplicated within one image. `evidence_type: feature_match_regions` (approximate hulls, not pixel-level).
2. **Splicing heuristic (experimental)** — flags regions whose local noise level (and, for JPEG, error level) deviates from the rest. `heuristic_forensic_map`: a normalised score, not a probability.
3. **Model localization** — a configured ONNX model produces a per-pixel map interpreted according to its declared model card. `model_probability_map`. Unavailable without a model; never mocked.

Statuses: `candidate_regions_found`, `no_candidate_regions_found`, `inconclusive`, `unavailable`, `failed`. "No candidates" never means "authentic".

## Invisible watermark
Payload (owner string ≤ 12 ASCII chars) + version + 32-bit truncated HMAC-SHA256 made with the server key → 144 bits, spread over 8×8 luminance DCT blocks by quantization index modulation (3 mid-frequency coefficients/block, key-permuted bit layout). Verification searches block-grid offsets, quantization steps and class shifts (small crops) and accepts a payload only if its HMAC verifies.
**A valid result means someone holding the server key embedded that payload — not proof of ownership, authorship or image integrity.** Key management: generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"`, keep it secret and backed up; rotating it makes old watermarks unverifiable. Use PNG output to preserve it.

Measured on 6 synthetic 640×480 images (see docs/TESTING.md): recovered after JPEG q95–q40, noise σ≤10, small crops, blur σ=1; **not** recovered after JPEG q25, resizing or rotation. Distortion: mean PSNR 44.8 dB.

## API
Summary — details and examples in [docs/API.md](docs/API.md): `GET /api/health`, `GET /api/capabilities`, `POST /api/watermark`, `POST /api/watermark/invisible/{embed,verify}`, `POST /api/detect/copy-move`, `POST /api/detect/analyze`, `GET /api/results/{id}/{artifact}`, `GET /api/results/{id}/{method}/layer?threshold=`.
```bash
curl -X POST localhost:8000/api/detect/analyze -F file=@suspect.jpg -F methods=all_supported
curl -X POST localhost:8000/api/watermark/invisible/embed -F file=@photo.png -F owner=Acme-2026 -F strength=standard
```

## Tests and evaluation
```bash
scripts/test-all.sh
cd backend && .venv/bin/python -m evaluation.run
```
Latest: backend 146 passed, frontend 47 passed, typecheck (`tsc -b`) 0 errors, production build cleanly bundled in <1s. Synthetic evaluation numbers and their caveats are in [docs/TESTING.md](docs/TESTING.md) and `backend/evaluation/results/summary.md` (generated by the script; not hand-written). Synthetic results do not demonstrate real-world forensic accuracy.

## Watermark Attack & Tampering Lab

The Attack Lab is an interactive, scientifically grounded educational forensic simulation environment structured around a 4-stage workflow:

1. **Stage A — Prepare Baseline Protection:** Upload a source image, configure optional visible watermarking (custom text, position, opacity, font size, color) and optional invisible DCT-QIM watermarking with truncated HMAC-SHA256 authentication. Save output as the immutable protected baseline.
2. **Stage B — Select & Chain Controlled Transformations:** Choose from 8 controlled operations:
   - *Watermark Occlusion:* Solid or semi-transparent rectangular patch.
   - *Cropping:* Edge crop, watermark-corner crop, watermark-preserving crop, or custom box.
   - *Gaussian Blur:* Adjustable radius [0.5, 50.0] px.
   - *JPEG Recompression:* Lossy re-encoding quality [15, 95]%.
   - *Spatial Resizing:* Bicubic scaling [0.25x, 2.0x] breaking 8×8 DCT grid sync.
   - *Rotation:* Small angle rotation [-25°, +25°] with bicubic interpolation.
   - *Copy-Move Tampering:* Clones a rectangular source patch to a destination coordinate.
   - *Content Splicing:* Inserts an external patch from a separate donor image.
   *Interactive Region Inspector:* Live SVG bounding box overlays preview exact coordinates directly over the image, allowing click-to-position placement. Chaining allows applying transforms sequentially (`target=current`) or starting fresh from the baseline (`target=baseline`) while geometrically tracking the simulated ground truth mask.
3. **Stage C — Independent Forensic Detection & Verification:** Execute ORB copy-move detection, noise-residual/ELA splicing heuristics, ONNX localization, and keyed invisible watermark verification. Detectors receive only the raw modified image array with zero access to ground truth masks or attack parameters.
4. **Stage D — Multi-View Comparison & Evaluation:** Inspect side-by-side comparisons, detector overlays, and ground-truth masks with pan/zoom. Review quantitative pixel-level metrics (Precision, Recall, F1, IoU, TP, FP, TN, FN) and download structured JSON and self-contained HTML forensic reports.

## Step-by-Step 5–7 Minute Demonstration Script

This script walks through a complete, compelling live demonstration of the system:

* **Minute 1: Introduction & Baseline Setup (Stage A)**
  - Open `http://localhost:5173` and click on **Attack Lab** in the primary navigation.
  - Upload a test photo or sample image (`test.png`).
  - Enable *Visible Watermark* with text `ImageGuard Protected`, position `bottom-right`, opacity `0.8`.
  - Enable *Invisible Watermark* with Owner ID `CORP-2026` at `Standard` strength.
  - Click **Save Protected Baseline**. Highlight that the baseline image is locked into session memory with its cryptographic watermark embedded.

* **Minute 2: Visible Watermark Occlusion Attack (Stage B)**
  - In Stage B, select **1. Occlusion**.
  - Highlight the *Interactive Region Preview* on the right: click directly over the visible watermark in the bottom-right corner to position the red occlusion patch box.
  - Set opacity to `1.0` (solid black patch) and click **Apply Transformation**.
  - Click **Proceed to Analyze**.

* **Minute 3: Independent Forensic Analysis & Report Review (Stages C & D)**
  - In Stage C, select both *ORB Copy-Move Detector* and *Invisible Watermark Verification*.
  - Click **Run Forensic Analysis**.
  - Show the 3 Core Forensic Questions in Stage D:
    1. *Was image modified?* Yes (Occlusion applied).
    2. *Was watermark damaged or verified?* Invisible watermark is **Verified** (`CORP-2026`)! Explain: occlusion covers only a small percentage of 8×8 DCT blocks; the majority of distributed blocks remain intact, allowing full HMAC recovery!
    3. *Did detectors find evidence?* No candidate regions for copy-move (honest result: occlusion is not copy-move).
  - Download and display the self-contained HTML report with embedded base64 artifacts.

* **Minute 4: Copy-Move Tampering Simulation**
  - Return to Stage B. Select **7. Copy-Move**.
  - Click on the image preview to set the source box (blue) over a textured object; hold Shift and click to set the destination box (amber).
  - Select *Target: Current Working Copy* to demonstrate sequential chaining (step #2).
  - Click **Apply Transformation** and proceed to Stage C.
  - Run the *ORB Copy-Move Detector*.
  - In Stage D, show that the detector flags candidate duplicated regions.
  - Point to the **Quantitative Detection Evaluation vs Ground Truth** table: explain that convex hull candidate polygons yield high recall and approximate precision, honestly reflecting detector mechanics.

* **Minute 5: Geometric Desynchronization Attack (Watermark Fragility)**
  - Return to Stage B. Select *Target: Current Working Copy*.
  - Select **5. Resize** and choose scale `0.75x`.
  - Click **Apply Transformation** and proceed to Stage C.
  - Check *Invisible Watermark Verification* and click **Run Forensic Analysis**.
  - Show Question B: Invisible watermark status changes to **Not Detected**.
  - Explain the science: resizing resamples pixel lattices and permanently desynchronizes the 8×8 DCT block grid, demonstrating the documented physical limitations of DCT-QIM watermarking.

* **Minute 6: Content Splicing & Heuristic Multi-Method Analysis**
  - Return to Stage B, click **Reset to Baseline**, and select **8. Splicing**.
  - Upload a donor image and configure target insertion coordinates.
  - Apply the transform and analyze with the *Splicing Heuristic* (noise-residual & ELA).
  - Examine the multi-layer overlay and explain the distinction between heuristic anomaly scores and verified ground truth.

* **Minute 7: Final Conclusion & Security Recap**
  - Download the final JSON and HTML reports.
  - Highlight that detector inputs were completely isolated from attack parameters throughout the entire session.
  - Reiterate that ImageGuard never fabricates predictions, never equates detector absence with authenticity, and keeps all server secret keys strictly secure.

## Verification performed
In a browser against the running backend: a synthetic forged image analysed with all supported methods (copy-move, splicing, and localization using a generated *pipeline-test* ONNX model that is not a forensic model), per-method results and the threshold slider; invisible watermark embed → real download artifact → verify (verified with payload and valid HMAC) and an unmarked image (not detected); visible watermark preview/tiling; invalid files. One integration bug found this way (CORS did not expose `X-Region-Count`) was fixed and covered by a test. Nothing has been deployed.

## Known limitations
Copy-move only finds duplication in one image and can flag repeated patterns; the splicing heuristic misses matched-noise composites and false-alarms on some clean images; no trained forensic model has been run; heuristics were tuned on synthetic data; the invisible watermark does not survive resizing/rotation/heavy compression and is removable by a determined attacker; artifact store and rate limiter are per-process (single worker); lint uses oxlint with 2 known warnings.

## Related techniques
| Technique | In this app |
|---|---|
| Copy-move detection | Implemented (ORB baseline) |
| Splicing detection | Experimental heuristic only |
| Pixel-level tampering localization | Model integration ready; no weights bundled; ORB regions and heuristic maps are *not* pixel-level |
| Visible watermarking | Implemented; can be cropped/removed; proves nothing |
| Invisible watermarking | Implemented (keyed DCT-QIM + HMAC); limited robustness |

## Deployment
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (Render via `render.yaml`, Vercel via `frontend/vercel.json`). Set `IMAGEGUARD_WATERMARK_KEY` as a secret. Not deployed or verified on those hosts.

## Next steps
Obtain and license-check a real manipulation-localization model and evaluate it on real datasets; evaluate the heuristics on real photographs; stronger invisible-watermark synchronisation (resize/rotation) and error-correcting codes; shared artifact storage for multi-worker hosting; browser E2E tests.
