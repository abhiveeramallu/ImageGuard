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
| 503 | `server_busy` |

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
