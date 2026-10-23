import type { DetectionResult } from '../types/api'

export const png = (name = 'photo.png', size = 2048) => new File([new Uint8Array(size)], name, { type: 'image/png' })

export function detectionResult(over: Partial<DetectionResult> = {}): DetectionResult {
  return {
    analysis_id: 'abc',
    status: 'candidate_regions_found',
    status_reason: '1 cluster(s) of mutually consistent ORB matches were found (37 retained matches).',
    method: { name: 'orb-hamming-ransac', version: '1.0.0' },
    image: { width: 800, height: 600, analysis_width: 800, analysis_height: 600, analysis_scale: 1 },
    keypoints: 5000,
    matches_before_filtering: 4999,
    matches_after_descriptor_filtering: 51,
    matches_retained: 37,
    candidate_region_count: 1,
    regions: [{
      id: 1, matches: 37, mean_hamming_distance: 20,
      transform: { type: 'similarity', translation_x: 351, translation_y: 200, rotation_degrees: 0.1, scale: 1 },
      region_a: { bbox: { x: 92, y: 92, width: 129, height: 112 }, polygon: [[92, 92]] },
      region_b: { bbox: { x: 442, y: 292, width: 129, height: 111 }, polygon: [[442, 292]] },
    }],
    processing_ms: 199,
    settings: {},
    artifacts: { annotated: '/a', mask: '/m', heatmap: '/h', report_json: '/r.json', report_html: '/r.html' },
    artifact_ttl_seconds: 900,
    warnings: [],
    limitations: ['Only copy-move is analysed.'],
    ...over,
  }
}
