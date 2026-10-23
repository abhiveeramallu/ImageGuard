# Testing

```bash
scripts/test-all.sh        # backend pytest + frontend typecheck, vitest, production build
# or separately
cd backend && .venv/bin/python -m pytest -q
cd frontend && npm run typecheck && npm test && npm run build
```

## Backend (pytest, 59 tests)
All images are synthetic (`backend/tests/synth.py`): multi-scale smoothed noise plus random shapes, with a patch copied from a known source to a known destination so ground-truth masks exist.

* **Watermark** – JPEG/PNG input, opacity ordering (0.1 < 0.5 < 1.0 mean pixel change, 0 = unchanged), position lands in the expected image region, tiled covers > 5× single, rotation changes output, transparent-logo pixels stay untouched, clipping on tiny images, RGBA/grayscale/EXIF orientation, every invalid parameter, unsupported/corrupt/empty files, tile-count cap, filename sanitising.
* **Detection** – translation copy-move on 5 seeds (region centres within 40 px, translation recovered within 6 px), rotation 20° and scale 0.8, 5 unmodified textures → no candidates, blank and gradient → `inconclusive`, periodic tiling not reported as `candidate_regions_found`, odd dimensions, bounds of every coordinate/polygon, downscaled analysis maps back to original coordinates, artifacts differ from input only when something is found, input not mutated, counts monotonic.
* **API** – end-to-end detect → artifact download → report; settings are applied; invalid/oversized input (limits monkeypatched); path-traversal and allow-list checks; artifact expiry; CORS allow/deny.

## Measured behaviour (synthetic data, this machine; not a general accuracy claim)
* Region IoU of the candidate mask vs. ground-truth source ∪ destination, 10 translation cases: **mean 0.71, min 0.55, max 0.89**. Hulls of sparse keypoints under-/over-shoot, so localization is approximate.
* False candidates on 30 unmodified synthetic textures: **0**. Real photographs were not evaluated; repeated natural structure is a known false-positive source.
* Hull padding (10/16/22 px) was chosen by measuring IoU on 6 seeds; 16 px ≈ ORB patch radius.
* 20 MP image (5000×4000): ≈4.5 s and ≈0.7 GB peak RSS in a standalone process (decode + detect + PNG encode) on this machine. Memory scales roughly linearly with pixels (≈35 MB/MP), which is why the default limit is 16 MP and the Render blueprint uses 8 MP (extrapolated, not tested on Render).

## Frontend (vitest + Testing Library, 24 tests)
Upload validation, file summary/removal, drag-and-drop, loading state, settings → request payload, result rendering (stats, regions), view switching, all three statuses (negative result never described as proof of authenticity), error + retry, artifact download, object-URL revocation, watermark mode switching, logo validation, empty text, stale-download guard. The API layer is mocked in these tests; real HTTP integration was checked manually in a browser (see README "Verification").

## Not covered
No browser E2E suite, no real-photograph benchmark, no load/abuse testing, no test of the Render/Vercel deployments.
