# API reference

Base URL (local): `http://localhost:8000`. Interactive docs (development only): `/api/docs`.
All errors use `{"error": {"code": "...", "message": "..."}}`.

| Status | Codes |
|---|---|
| 400 | `invalid_image`, `empty_file` |
| 404 | `not_found` (unknown/expired artifact) |
| 413 | `file_too_large`, `image_too_large` |
| 415 | `unsupported_format` |
| 422 | `invalid_parameters`, `image_too_small`, `watermark_too_large`, `too_many_tiles` |
| 429 | `rate_limited` |
| 503 | `server_busy`, `watermark_unavailable` (no server key) |

## `GET /api/health`
`{"status": "ok", "version": "1.0.0"}`

## `POST /api/watermark` (multipart/form-data)
Returns the image (`image/png` or `image/jpeg`) with `Content-Disposition: attachment; filename="<stem>_watermarked.<ext>"`.

| Field | Type | Default | Constraint |
|---|---|---|---|
| `file` | file | required | JPEG/PNG, ≤ 10 MB, ≤ 16 MP, ≤ 8000 px/side |
| `watermark_type` | `text`\|`logo` | `text` | |
| `text` | string | `""` | required & non-blank for text; ≤ 200 chars |
| `logo` | file | – | required for logo; JPEG/PNG ≤ 2 MB |
| `position` | `top-left` … `bottom-right` (9 values, incl. `center`) | `bottom-right` | single layout |
| `opacity` | float | 0.5 | 0–1 |
| `font_size` | int px | 36 | 8–400 |
| `color` | hex | `#FFFFFF` | `#RGB` or `#RRGGBB` |
| `rotation` | float deg | 0 | −180…180 |
| `margin` | int px | 24 | 0–500 |
| `layout` | `single`\|`tiled` | `single` | tiled capped at 1500 tiles |
| `output_format` | `png`\|`jpeg` | `png` | |
| `outline`, `shadow` | bool | `true`, `false` | |
| `logo_scale` | float % of image width | 20 | 2–100 |
| `tile_spacing` | int px | 60 | 0–500 |

```bash
curl -X POST http://localhost:8000/api/watermark -F file=@photo.jpg -F text="© Me" \
  -F position=center -F opacity=0.4 -F layout=tiled -F rotation=30 -o out.png
```

## `POST /api/detect/copy-move` (multipart/form-data)
Fields: `file` plus optional `max_dimension` (256–3000, 1280), `n_features` (500–20000, 5000), `ratio` (0.5–0.95, 0.75),
`max_hamming` (10–128, 64), `min_displacement` (4–500 px, 24), `min_matches` (4–100, 8), `ransac_threshold` (1–10, 3.0), `max_regions` (1–10, 5).
Distances/thresholds in pixels apply to the (possibly downscaled) analysis image.

```bash
curl -X POST http://localhost:8000/api/detect/copy-move -F file=@suspect.png
```

Response (abridged; schema in `/api/docs`):
```json
{
  "analysis_id": "…", "status": "candidate_regions_found",
  "status_reason": "1 cluster(s) of mutually consistent ORB matches were found (37 retained matches). …",
  "method": {"name": "orb-hamming-ransac", "version": "1.0.0"},
  "image": {"width": 800, "height": 600, "analysis_width": 800, "analysis_height": 600, "analysis_scale": 1.0},
  "keypoints": 5000, "matches_before_filtering": 5000,
  "matches_after_descriptor_filtering": 51, "matches_retained": 37, "candidate_region_count": 1,
  "regions": [{"id": 1, "matches": 37, "mean_hamming_distance": 23.4,
    "transform": {"type": "similarity", "translation_x": 351.1, "translation_y": 200.0, "rotation_degrees": 0.1, "scale": 1.0},
    "region_a": {"bbox": {"x": 92, "y": 92, "width": 129, "height": 112}, "polygon": [[…]]},
    "region_b": {"bbox": {"x": 442, "y": 292, "width": 129, "height": 111}, "polygon": [[…]]}}],
  "processing_ms": 199.0, "settings": {…},
  "artifacts": {"annotated": "/api/results/<id>/annotated", "mask": "…/mask", "heatmap": "…/heatmap",
                "report_json": "…/report.json", "report_html": "…/report.html"},
  "artifact_ttl_seconds": 900, "warnings": [], "limitations": ["…"]
}
```
`status` ∈ `candidate_regions_found` | `no_candidate_regions_found` | `inconclusive`. "Analysis failed" is an HTTP error.
There is deliberately **no confidence or probability field**. `region_a`/`region_b` are symmetric: the method cannot tell original from copy.

## `GET /api/results/{analysis_id}/{artifact_name}`
`artifact_name` ∈ `annotated`, `mask`, `heatmap` (PNG), `report.json`, `report.html`. IDs are random (128-bit); names are allow-listed;
nothing touches the filesystem. Artifacts live in server memory and expire after `IMAGEGUARD_ARTIFACT_TTL_SECONDS` (default 900) → 404 afterwards.


---
# Added in 1.1

## `GET /api/capabilities`
What this server can do right now: `methods.{copy_move,splicing,localization}` (`available`, `experimental`, `reason`, `model`) and `invisible_watermark`.
Localization is unavailable until a model is configured (docs/MODELS.md); invisible watermarking is unavailable until `IMAGEGUARD_WATERMARK_KEY` is set.

## `POST /api/detect/analyze` (multipart/form-data)
`file`, `methods` (comma list of `copy_move`, `splicing`, `localization`, or `all_supported`; default `copy_move`), `splicing_threshold` (0.05–0.99, 0.5),
`localization_threshold` (0.01–0.99, 0.5), and the copy-move settings `max_dimension`, `n_features`, `ratio`, `min_matches`, `min_displacement`.
`POST /api/detect/copy-move` is unchanged.

```bash
curl -X POST localhost:8000/api/detect/analyze -F file=@suspect.jpg -F methods=all_supported
```
Response: `{analysis_id, image, requested_methods, results: [MethodResult], artifact_ttl_seconds, report_json, disclaimer}`. Each `MethodResult`:

| field | meaning |
|---|---|
| `method`, `category` | `copy_move`/`splicing`/`localization`; `copy_move`/`splicing`/`local_manipulation` |
| `evidence_type` | `feature_match_regions` (approximate hulls), `heuristic_forensic_map` (normalised score, not a probability), `model_probability_map` |
| `status` | `candidate_regions_found`, `no_candidate_regions_found`, `inconclusive`, **`unavailable`** (e.g. no model), **`failed`** |
| `experimental`, `model` | `true` for the splicing heuristic; model card details for localization |
| `threshold`, `threshold_semantics`, `region_count`, `regions`, `metrics`, `processing_ms` | computed values only |
| `artifacts` | URLs such as `/api/results/{id}/splicing.mask` (`annotated`/`overlay`/`mask`/`heatmap`/`score`); empty when unavailable/failed |

Methods are independent: there is no combined score, and a missing finding is never reported as "genuine". Failures/unavailability of one method do not affect the others.

## `GET /api/results/{analysis_id}/{method}/layer?threshold=0.5`
`method` ∈ `splicing`, `localization`. Re-applies a threshold to the stored 16-bit score map and returns a transparent red RGBA PNG (+ header `X-Region-Count`).

Artifact names: `{method}.{annotated|overlay|mask|heatmap|score}`, `analysis.json`, `watermarked.png|jpg` (plus the 1.0 names).

## `POST /api/watermark/invisible/embed` (multipart/form-data)
`file`, `owner` (1–12 printable ASCII chars; the payload), `strength` (`low`|`standard`|`high`), `output_format` (`png`|`jpeg`). Returns
`{watermark_id, algorithm, owner, integrity, metrics{psnr_db, blocks, copies_per_bit, quantization_step}, output_format, artifact, warnings, limitations}`;
download the image from `artifact`. 503 `watermark_unavailable` if no key is configured.

## `POST /api/watermark/invisible/verify` (multipart/form-data)
`file` → `{status: verified|inconclusive|not_detected, status_reason, owner, integrity_verified, algorithm, metrics, processing_ms, warnings, limitations}`.
`verified` = a payload whose HMAC (made with the server key) is valid was recovered. `inconclusive` = watermark-like signal with a valid header but failed check.
Neither status proves ownership or image integrity.
