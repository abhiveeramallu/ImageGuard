export type DetectionStatus = 'candidate_regions_found' | 'no_candidate_regions_found' | 'inconclusive'

export interface BBox { x: number; y: number; width: number; height: number }
export interface RegionSide { bbox: BBox; polygon: number[][] }
export interface Transform {
  type: 'similarity'
  translation_x: number
  translation_y: number
  rotation_degrees: number
  scale: number
}
export interface CandidateRegion {
  id: number
  matches: number
  mean_hamming_distance: number
  transform: Transform
  region_a: RegionSide
  region_b: RegionSide
}

export interface DetectionResult {
  analysis_id: string
  status: DetectionStatus
  status_reason: string
  method: { name: string; version: string }
  image: { width: number; height: number; analysis_width: number; analysis_height: number; analysis_scale: number }
  keypoints: number
  matches_before_filtering: number
  matches_after_descriptor_filtering: number
  matches_retained: number
  candidate_region_count: number
  regions: CandidateRegion[]
  processing_ms: number
  settings: Record<string, number>
  artifacts: { annotated: string; mask: string; heatmap: string; report_json: string; report_html: string }
  artifact_ttl_seconds: number
  warnings: string[]
  limitations: string[]
}

export interface DetectionSettings {
  max_dimension: number
  n_features: number
  ratio: number
  min_matches: number
  min_displacement: number
}

export const DEFAULT_DETECTION_SETTINGS: DetectionSettings = {
  max_dimension: 1280,
  n_features: 5000,
  ratio: 0.75,
  min_matches: 8,
  min_displacement: 24,
}

export type WatermarkPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

export interface WatermarkSettings {
  watermark_type: 'text' | 'logo'
  text: string
  position: WatermarkPosition
  opacity: number
  font_size: number
  color: string
  rotation: number
  margin: number
  layout: 'single' | 'tiled'
  output_format: 'png' | 'jpeg'
  outline: boolean
  shadow: boolean
  logo_scale: number
  tile_spacing: number
}

export const DEFAULT_WATERMARK_SETTINGS: WatermarkSettings = {
  watermark_type: 'text',
  text: 'ImageGuard',
  position: 'bottom-right',
  opacity: 0.6,
  font_size: 36,
  color: '#ffffff',
  rotation: 0,
  margin: 24,
  layout: 'single',
  output_format: 'png',
  outline: true,
  shadow: false,
  logo_scale: 20,
  tile_spacing: 60,
}

export interface WatermarkResult { blob: Blob; filename: string }
