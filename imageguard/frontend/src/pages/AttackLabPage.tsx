import { useCallback, useEffect, useState } from 'react'
import {
  ArrowRight,
  ChevronRight,
  Copy,
  Crop,
  Crosshair,
  Download,
  EyeOff,
  FileCheck,
  FileDown,
  FileText,
  FlaskConical,
  History,
  Layers,
  Loader2,
  RefreshCw,
  RotateCw,
  Scissors,
  Shield,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import Alert from '../components/Alert'
import ImageDropzone from '../components/ImageDropzone'
import ZoomableImage from '../components/ZoomableImage'
import {
  API_URL,
  analyzeAttackLab,
  fetchArtifact,
  getCapabilities,
  prepareAttackLab,
  resetAttackLab,
  transformAttackLab,
} from '../services/api'
import type {
  Capabilities,
  ExperimentAnalysisResult,
  ExperimentPrepareResult,
  ExperimentTransformResult,
} from '../types/api'
import { downloadBlob } from '../utils/files'

type Stage = 'A' | 'B' | 'C' | 'D'
type TransformationType =
  | 'occlusion'
  | 'crop'
  | 'blur'
  | 'jpeg'
  | 'resize'
  | 'rotation'
  | 'copy_move'
  | 'splicing'

const getCropBox = (w: number, h: number, preset: string, custom: { x: number; y: number; width: number; height: number }) => {
  if (preset === 'edge_small') {
    return { x: 0, y: 0, width: Math.round(w * 0.95), height: Math.round(h * 0.95) }
  } else if (preset === 'watermark_corner') {
    return { x: 0, y: 0, width: Math.round(w * 0.85), height: Math.round(h * 0.85) }
  } else if (preset === 'preserve_watermark') {
    const px = Math.round(w * 0.15)
    const py = Math.round(h * 0.15)
    return { x: px, y: py, width: w - px, height: h - py }
  }
  return custom
}

export default function AttackLabPage() {
  const [stage, setStage] = useState<Stage>('A')
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)

  // Stage A State
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [sourcePreview, setSourcePreview] = useState<string | null>(null)
  const [sourceDimensions, setSourceDimensions] = useState<{ width: number; height: number } | null>(null)
  const [visibleWm, setVisibleWm] = useState(false)
  const [wmText, setWmText] = useState('ImageGuard Protected')
  const [wmPosition, setWmPosition] = useState('bottom-right')
  const [wmOpacity, setWmOpacity] = useState(0.6)
  const [wmColor, setWmColor] = useState('#ffffff')
  const [wmFontSize, setWmFontSize] = useState(36)
  const [invisibleWm, setInvisibleWm] = useState(false)
  const [invisibleOwner, setInvisibleOwner] = useState('LAB-01')
  const [invisibleStrength, setInvisibleStrength] = useState<'standard' | 'high'>('standard')
  const [preparing, setPreparing] = useState(false)
  const [prepareError, setPrepareError] = useState<string | null>(null)

  // Active Experiment State
  const [experiment, setExperiment] = useState<ExperimentPrepareResult | null>(null)
  const [modifiedInfo, setModifiedInfo] = useState<ExperimentTransformResult | null>(null)

  // Stage B State (Transformations)
  const [transType, setTransType] = useState<TransformationType>('occlusion')
  const [targetCopy, setTargetCopy] = useState<'current' | 'baseline'>('current')
  const [transforming, setTransforming] = useState(false)
  const [transformError, setTransformError] = useState<string | null>(null)

  // Transformation Parameters
  const [occlParams, setOcclParams] = useState({ x: 400, y: 350, width: 180, height: 60, color: '#000000', opacity: 1.0 })
  const [cropPreset, setCropPreset] = useState<'edge_small' | 'watermark_corner' | 'preserve_watermark' | 'custom'>('watermark_corner')
  const [cropCustom, setCropCustom] = useState({ x: 50, y: 50, width: 400, height: 300 })
  const [blurRadius, setBlurRadius] = useState(5.0)
  const [jpegQuality, setJpegQuality] = useState(70)
  const [resizeScale, setResizeScale] = useState(0.75)
  const [rotAngle, setRotAngle] = useState(5.0)
  const [cmParams, setCmParams] = useState({ src_x: 50, src_y: 50, src_w: 100, src_h: 100, dst_x: 220, dst_y: 200 })
  const [donorFile, setDonorFile] = useState<File | null>(null)
  const [donorPreview, setDonorPreview] = useState<string | null>(null)
  const [spliceParams, setSpliceParams] = useState({
    donor_x: 20, donor_y: 20, donor_w: 120, donor_h: 100,
    target_x: 150, target_y: 150, target_w: 120, target_h: 100,
  })

  // Stage C State (Analysis)
  const [runCopyMove, setRunCopyMove] = useState(true)
  const [runSplicing, setRunSplicing] = useState(true)
  const [runLoc, setRunLoc] = useState(false)
  const [runWmVerify, setRunWmVerify] = useState(true)
  const [splicingThresh, setSplicingThresh] = useState(0.5)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<ExperimentAnalysisResult | null>(null)

  // Stage D State (Comparison view)
  const [compareTab, setCompareTab] = useState<'modified' | 'baseline' | 'original' | 'annotated' | 'splicing' | 'ground_truth' | 'compare'>('modified')
  const [downloading, setDownloading] = useState<string | null>(null)

  // Load capabilities on mount
  useEffect(() => {
    getCapabilities()
      .then((c) => {
        setCapabilities(c)
        if (c.methods.localization.available) setRunLoc(true)
      })
      .catch(() => {})
  }, [])

  // Handle Source File Selection
  const onSourceFile = useCallback((file: File) => {
    setSourceFile(file)
    setPrepareError(null)
    const url = URL.createObjectURL(file)
    setSourcePreview(url)
    const img = new Image()
    img.onload = () => {
      setSourceDimensions({ width: img.naturalWidth, height: img.naturalHeight })
      const w = img.naturalWidth
      const h = img.naturalHeight
      setOcclParams({
        x: Math.max(0, w - 240),
        y: Math.max(0, h - 90),
        width: Math.min(220, w),
        height: Math.min(80, h),
        color: '#000000',
        opacity: 1.0,
      })
      setCmParams({
        src_x: Math.max(0, Math.floor(w * 0.1)),
        src_y: Math.max(0, Math.floor(h * 0.1)),
        src_w: Math.max(40, Math.floor(w * 0.25)),
        src_h: Math.max(40, Math.floor(h * 0.25)),
        dst_x: Math.max(0, Math.floor(w * 0.5)),
        dst_y: Math.max(0, Math.floor(h * 0.4)),
      })
      setCropCustom({
        x: Math.floor(w * 0.1),
        y: Math.floor(h * 0.1),
        width: Math.floor(w * 0.8),
        height: Math.floor(h * 0.8),
      })
    }
    img.src = url
  }, [])

  // Handle Donor File Selection for Splicing
  const onDonorFile = (file: File) => {
    setDonorFile(file)
    const url = URL.createObjectURL(file)
    setDonorPreview(url)
  }

  // Stage A: Create Baseline
  const handlePrepare = async () => {
    if (!sourceFile) return
    setPreparing(true)
    setPrepareError(null)
    try {
      const res = await prepareAttackLab(sourceFile, {
        visible_watermark: visibleWm,
        watermark_text: wmText,
        watermark_position: wmPosition,
        watermark_opacity: wmOpacity,
        watermark_font_size: wmFontSize,
        watermark_color: wmColor,
        invisible_watermark: invisibleWm,
        invisible_owner: invisibleOwner,
        invisible_strength: invisibleStrength,
      })
      setExperiment(res)
      setModifiedInfo(null)
      setAnalysisResult(null)
      setStage('B')
    } catch (e: any) {
      setPrepareError(e.message || 'Failed to prepare baseline image.')
    } finally {
      setPreparing(false)
    }
  }

  // Stage B: Apply Transformation
  const handleApplyTransform = async () => {
    if (!experiment) return
    setTransforming(true)
    setTransformError(null)

    let params: Record<string, unknown> = {}
    let dFile: File | null = null

    if (transType === 'occlusion') {
      params = occlParams
    } else if (transType === 'crop') {
      params = cropPreset === 'custom' ? cropCustom : { preset: cropPreset }
    } else if (transType === 'blur') {
      params = { radius: blurRadius }
    } else if (transType === 'jpeg') {
      params = { quality: jpegQuality }
    } else if (transType === 'resize') {
      params = { scale: resizeScale }
    } else if (transType === 'rotation') {
      params = { angle: rotAngle, expand: false }
    } else if (transType === 'copy_move') {
      params = cmParams
    } else if (transType === 'splicing') {
      if (!donorFile) {
        setTransformError('A donor image is required for content splicing.')
        setTransforming(false)
        return
      }
      params = spliceParams
      dFile = donorFile
    }

    try {
      const res = await transformAttackLab(
        experiment.experiment_id,
        transType,
        targetCopy,
        params,
        dFile,
      )
      setModifiedInfo(res)
      setAnalysisResult(null)
    } catch (e: any) {
      setTransformError(e.message || 'Transformation failed.')
    } finally {
      setTransforming(false)
    }
  }

  // Stage B: Reset to Baseline
  const handleReset = async () => {
    if (!experiment) return
    setTransforming(true)
    setTransformError(null)
    try {
      const res = await resetAttackLab(experiment.experiment_id)
      setModifiedInfo(res)
      setAnalysisResult(null)
    } catch (e: any) {
      setTransformError(e.message || 'Failed to reset to baseline.')
    } finally {
      setTransforming(false)
    }
  }

  // Stage C: Run Analysis
  const handleAnalyze = async () => {
    if (!experiment) return
    setAnalyzing(true)
    setAnalysisError(null)

    const methods: string[] = []
    if (runCopyMove) methods.push('copy_move')
    if (runSplicing) methods.push('splicing')
    if (runLoc && capabilities?.methods.localization.available) methods.push('localization')
    if (runWmVerify) methods.push('watermark_verify')

    if (methods.length === 0) {
      setAnalysisError('Please select at least one detection or verification method.')
      setAnalyzing(false)
      return
    }

    try {
      const res = await analyzeAttackLab(experiment.experiment_id, methods, {
        splicing_threshold: splicingThresh,
      })
      setAnalysisResult(res)
      setStage('D')
    } catch (e: any) {
      setAnalysisError(e.message || 'Forensic analysis failed.')
    } finally {
      setAnalyzing(false)
    }
  }

  // Report & Artifact Downloads
  const handleDownloadReport = async (fmt: 'json' | 'html') => {
    if (!experiment) return
    setDownloading(fmt)
    try {
      const url = `${API_URL}/api/attack-lab/experiments/${experiment.experiment_id}/report?format=${fmt}`
      const blob = await fetchArtifact(url)
      downloadBlob(blob, `attack-lab-report-${experiment.experiment_id}.${fmt}`)
    } catch (e: any) {
      alert(`Download failed: ${e.message}`)
    } finally {
      setDownloading(null)
    }
  }

  const handleDownloadArtifact = async (artifactKey: string, filename: string) => {
    if (!experiment) return
    setDownloading(artifactKey)
    try {
      const url = `${API_URL}/api/results/${experiment.experiment_id}/${artifactKey}`
      const blob = await fetchArtifact(url)
      downloadBlob(blob, filename)
    } catch (e: any) {
      alert(`Download failed: ${e.message}`)
    } finally {
      setDownloading(null)
    }
  }

  const expId = experiment?.experiment_id
  const origUrl = expId ? `${API_URL}/api/results/${expId}/original.png` : sourcePreview || ''
  const baselineUrl = expId ? `${API_URL}/api/results/${expId}/baseline.png` : ''
  const historyList = modifiedInfo?.history || experiment?.history || []
  const modifiedUrl = expId ? `${API_URL}/api/results/${expId}/modified.png?v=${historyList.length}` : ''
  const gtUrl = expId && (modifiedInfo?.ground_truth.has_mask || analysisResult?.ground_truth.has_mask)
    ? `${API_URL}/api/results/${expId}/ground_truth.png`
    : ''
  const cmAnnotatedUrl = expId ? `${API_URL}/api/results/${expId}/copy_move.annotated` : ''
  const spOverlayUrl = expId ? `${API_URL}/api/results/${expId}/splicing.overlay` : ''

  const activeW = (targetCopy === 'current' ? (modifiedInfo?.image.width || experiment?.baseline_image.width) : experiment?.baseline_image.width) || 400
  const activeH = (targetCopy === 'current' ? (modifiedInfo?.image.height || experiment?.baseline_image.height) : experiment?.baseline_image.height) || 300
  const activeImageUrl = targetCopy === 'current' ? (modifiedUrl || baselineUrl) : baselineUrl
  const currentCropBox = getCropBox(activeW, activeH, cropPreset, cropCustom)

  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top
    const scaleX = activeW / rect.width
    const scaleY = activeH / rect.height
    const imgX = Math.round(clickX * scaleX)
    const imgY = Math.round(clickY * scaleY)

    if (transType === 'occlusion') {
      setOcclParams((p) => ({
        ...p,
        x: Math.max(0, Math.min(activeW - p.width, imgX)),
        y: Math.max(0, Math.min(activeH - p.height, imgY)),
      }))
    } else if (transType === 'crop') {
      if (cropPreset !== 'custom') setCropPreset('custom')
      setCropCustom((p) => ({
        ...p,
        x: Math.max(0, Math.min(activeW - p.width, imgX)),
        y: Math.max(0, Math.min(activeH - p.height, imgY)),
      }))
    } else if (transType === 'copy_move') {
      if (e.shiftKey) {
        setCmParams((p) => ({
          ...p,
          dst_x: Math.max(0, Math.min(activeW - p.src_w, imgX)),
          dst_y: Math.max(0, Math.min(activeH - p.src_h, imgY)),
        }))
      } else {
        setCmParams((p) => ({
          ...p,
          src_x: Math.max(0, Math.min(activeW - p.src_w, imgX)),
          src_y: Math.max(0, Math.min(activeH - p.src_h, imgY)),
        }))
      }
    } else if (transType === 'splicing') {
      setSpliceParams((p) => ({
        ...p,
        target_x: Math.max(0, Math.min(activeW - p.target_w, imgX)),
        target_y: Math.max(0, Math.min(activeH - p.target_h, imgY)),
      }))
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <header className="rounded-2xl bg-ink-900 px-6 py-6 text-white sm:px-8 sm:py-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-500/20 text-accent-400">
                <FlaskConical size={20} />
              </span>
              <h1 className="text-2xl font-bold tracking-tight">Attack Lab</h1>
            </div>
            <p className="mt-2 max-w-2xl text-xs sm:text-sm text-slate-300">
              Controlled image tampering, watermark attack simulations, and forensic detection evaluation.
              Create a baseline, apply reproducible modifications, run detectors with no prior knowledge of the tampering, and evaluate results against ground truth.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-ink-800/70 px-3 py-2 text-xs text-slate-300 border border-ink-700">
            <ShieldCheck size={16} className="text-accent-400" />
            <span>Honest forensic simulation</span>
          </div>
        </div>

        {/* Guided Stage Stepper */}
        <nav aria-label="Experiment stages" className="mt-6 flex flex-wrap gap-2 border-t border-ink-800 pt-4">
          {[
            { id: 'A', label: '1. Prepare Baseline', ready: true },
            { id: 'B', label: '2. Select Transformation', ready: !!experiment },
            { id: 'C', label: '3. Forensic Analysis', ready: !!experiment },
            { id: 'D', label: '4. Evaluation & Compare', ready: !!analysisResult },
          ].map((st) => (
            <button
              key={st.id}
              disabled={!st.ready}
              onClick={() => setStage(st.id as Stage)}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                stage === st.id
                  ? 'bg-accent-600 text-white shadow-sm'
                  : st.ready
                  ? 'bg-ink-800 text-slate-300 hover:bg-ink-700 hover:text-white'
                  : 'bg-ink-800/40 text-slate-500 cursor-not-allowed'
              }`}
            >
              <span>{st.label}</span>
              {st.ready && st.id !== 'D' && <ChevronRight size={14} className="opacity-50" />}
            </button>
          ))}
        </nav>
      </header>

      {/* STAGE A: PREPARE BASELINE */}
      {stage === 'A' && (
        <section aria-labelledby="stage-a-heading" className="space-y-6">
          <div className="card p-6">
            <h2 id="stage-a-heading" className="text-lg font-bold text-ink-900 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-100 text-accent-700 text-xs font-bold">1</span>
              Prepare Source Image &amp; Baseline Protection
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Upload an image you own or are authorized to test. You can optionally apply a visible watermark, an invisible watermark, or test ordinary image tampering without any watermark.
            </p>

            <div className="mt-5 grid gap-6 lg:grid-cols-2">
              {/* Dropzone & Preview */}
              <div>
                <label className="label">Source Image</label>
                <ImageDropzone onFile={onSourceFile} disabled={preparing} />

                {sourceFile && sourceDimensions && (
                  <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    <div>
                      <span className="font-semibold">{sourceFile.name}</span>
                      <span className="ml-2 text-slate-500">
                        {sourceDimensions.width} &times; {sourceDimensions.height} px &bull; {(sourceFile.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Ready</span>
                  </div>
                )}
              </div>

              {/* Watermark Configuration */}
              <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Shield size={16} className="text-accent-600" />
                  Baseline Watermark Options (Optional)
                </h3>

                {/* Visible Watermark Toggle */}
                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={visibleWm}
                      onChange={(e) => setVisibleWm(e.target.checked)}
                      className="rounded text-accent-600 focus:ring-accent-500"
                    />
                    <span>Add Visible Watermark</span>
                  </label>

                  {visibleWm && (
                    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 text-xs">
                      <div>
                        <label className="label">Watermark Text</label>
                        <input
                          type="text"
                          value={wmText}
                          onChange={(e) => setWmText(e.target.value)}
                          className="input text-xs"
                          placeholder="e.g. ImageGuard Protected"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label">Position</label>
                          <select
                            value={wmPosition}
                            onChange={(e) => setWmPosition(e.target.value)}
                            className="input text-xs"
                          >
                            <option value="bottom-right">Bottom-Right</option>
                            <option value="bottom-left">Bottom-Left</option>
                            <option value="top-right">Top-Right</option>
                            <option value="top-left">Top-Left</option>
                            <option value="center">Center</option>
                          </select>
                        </div>
                        <div>
                          <label className="label">Opacity ({Math.round(wmOpacity * 100)}%)</label>
                          <input
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.05"
                            value={wmOpacity}
                            onChange={(e) => setWmOpacity(parseFloat(e.target.value))}
                            className="w-full"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label">Font Size (px)</label>
                          <input
                            type="number"
                            min={12}
                            max={120}
                            value={wmFontSize}
                            onChange={(e) => setWmFontSize(parseInt(e.target.value) || 36)}
                            className="input text-xs"
                          />
                        </div>
                        <div>
                          <label className="label">Color</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={wmColor}
                              onChange={(e) => setWmColor(e.target.value)}
                              className="h-8 w-12 rounded border border-slate-300 cursor-pointer"
                            />
                            <span className="font-mono">{wmColor}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Invisible Watermark Toggle */}
                <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={invisibleWm}
                      onChange={(e) => setInvisibleWm(e.target.checked)}
                      className="rounded text-accent-600 focus:ring-accent-500"
                    />
                    <span>Embed Invisible Watermark (DCT-QIM)</span>
                  </label>

                  {invisibleWm && (
                    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 text-xs">
                      {capabilities && !capabilities.invisible_watermark.available ? (
                        <Alert kind="warning" title="Invisible Watermark Server Key Not Set">
                          {capabilities.invisible_watermark.reason || 'Server key missing. The server will not embed invisible watermarks until configured.'}
                        </Alert>
                      ) : (
                        <>
                          <div>
                            <label className="label">Dummy Owner Identifier (1-12 chars)</label>
                            <input
                              type="text"
                              maxLength={12}
                              value={invisibleOwner}
                              onChange={(e) => setInvisibleOwner(e.target.value.replace(/[^A-Za-z0-9_-]/g, ''))}
                              className="input text-xs font-mono"
                              placeholder="e.g. LAB-01"
                            />
                          </div>
                          <div>
                            <label className="label">Embedding Strength</label>
                            <select
                              value={invisibleStrength}
                              onChange={(e) => setInvisibleStrength(e.target.value as any)}
                              className="input text-xs"
                            >
                              <option value="standard">Standard (balanced imperceptibility)</option>
                              <option value="high">High (more robust to light compression)</option>
                            </select>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    onClick={handlePrepare}
                    disabled={!sourceFile || preparing}
                    className="btn-primary w-full py-2.5 text-sm"
                  >
                    {preparing ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Preparing Baseline Image...
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={16} /> Save as Protected Baseline &amp; Continue
                      </>
                    )}
                  </button>
                  {prepareError && (
                    <div className="mt-2 text-xs text-red-600 font-semibold">{prepareError}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* STAGE B: SELECT & APPLY TRANSFORMATION */}
      {stage === 'B' && experiment && (
        <section aria-labelledby="stage-b-heading" className="space-y-6">
          <div className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h2 id="stage-b-heading" className="text-lg font-bold text-ink-900 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-100 text-accent-700 text-xs font-bold">2</span>
                  Select &amp; Apply a Controlled Transformation
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Simulate watermark degradation, cropping, compression, or localized tampering.
                  Each experiment records precise ground truth without sharing it with detectors.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReset}
                  disabled={transforming}
                  className="btn-secondary text-xs"
                  title="Discard working transformations and restore baseline"
                >
                  <RefreshCw size={14} className={transforming ? 'animate-spin' : ''} />
                  Reset to Baseline
                </button>
                <button
                  onClick={() => setStage('C')}
                  className="btn-primary text-xs"
                >
                  Proceed to Analyze <ArrowRight size={14} />
                </button>
              </div>
            </div>

            {/* Target copy selector */}
            <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-700 border border-slate-200">
              <span className="font-semibold text-slate-800">Apply transformation to:</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="targetCopy"
                  checked={targetCopy === 'current'}
                  onChange={() => setTargetCopy('current')}
                  className="text-accent-600"
                />
                <span>Current Working Copy (Sequential chaining, step #{historyList.length + 1})</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="targetCopy"
                  checked={targetCopy === 'baseline'}
                  onChange={() => setTargetCopy('baseline')}
                  className="text-accent-600"
                />
                <span>Protected Baseline (Fresh single-step experiment)</span>
              </label>
            </div>

            {/* Transformation Selector Tabs */}
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { id: 'occlusion', label: '1. Occlusion', icon: EyeOff, desc: 'Cover watermark' },
                { id: 'crop', label: '2. Cropping', icon: Crop, desc: 'Remove edge/corner' },
                { id: 'blur', label: '3. Blur', icon: Sparkles, desc: 'Gaussian blur' },
                { id: 'jpeg', label: '4. JPEG Recomp.', icon: Layers, desc: 'Lossy quality' },
                { id: 'resize', label: '5. Resize', icon: RefreshCw, desc: 'Scale factor' },
                { id: 'rotation', label: '6. Rotation', icon: RotateCw, desc: 'Small angles' },
                { id: 'copy_move', label: '7. Copy-Move', icon: Copy, desc: 'Duplicate patch' },
                { id: 'splicing', label: '8. Splicing', icon: Scissors, desc: 'Donor insertion' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTransType(t.id as TransformationType)}
                  className={`flex flex-col items-start rounded-xl p-3 text-left transition border ${
                    transType === t.id
                      ? 'border-accent-500 bg-accent-50/50 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <t.icon size={16} className={transType === t.id ? 'text-accent-600' : 'text-slate-500'} />
                    <span className="text-xs font-bold text-slate-800">{t.label}</span>
                  </div>
                  <span className="mt-1 text-[11px] text-slate-500">{t.desc}</span>
                </button>
              ))}
            </div>

            {/* Split layout: Parameters & Live Interactive Coordinate Preview */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Parameters (7 cols) */}
              <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-slate-50/50 p-5">
              {/* Occlusion */}
              {transType === 'occlusion' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-800">Experiment 1: Watermark Occlusion</h3>
                  <p className="text-xs text-slate-600">
                    Covers a rectangular patch of the image with a solid or semi-transparent color.
                    Ground truth records the exact rectangle coordinates.
                  </p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
                    <div>
                      <label className="label">Origin X</label>
                      <input
                        type="number"
                        value={occlParams.x}
                        onChange={(e) => setOcclParams({ ...occlParams, x: parseInt(e.target.value) || 0 })}
                        className="input text-xs"
                      />
                    </div>
                    <div>
                      <label className="label">Origin Y</label>
                      <input
                        type="number"
                        value={occlParams.y}
                        onChange={(e) => setOcclParams({ ...occlParams, y: parseInt(e.target.value) || 0 })}
                        className="input text-xs"
                      />
                    </div>
                    <div>
                      <label className="label">Width (px)</label>
                      <input
                        type="number"
                        value={occlParams.width}
                        onChange={(e) => setOcclParams({ ...occlParams, width: parseInt(e.target.value) || 10 })}
                        className="input text-xs"
                      />
                    </div>
                    <div>
                      <label className="label">Height (px)</label>
                      <input
                        type="number"
                        value={occlParams.height}
                        onChange={(e) => setOcclParams({ ...occlParams, height: parseInt(e.target.value) || 10 })}
                        className="input text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div>
                      <label className="label">Patch Color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={occlParams.color}
                          onChange={(e) => setOcclParams({ ...occlParams, color: e.target.value })}
                          className="h-8 w-12 rounded border border-slate-300 cursor-pointer"
                        />
                        <span className="font-mono">{occlParams.color}</span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-[180px]">
                      <label className="label">Opacity ({Math.round(occlParams.opacity * 100)}%)</label>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={occlParams.opacity}
                        onChange={(e) => setOcclParams({ ...occlParams, opacity: parseFloat(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Cropping */}
              {transType === 'crop' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-800">Experiment 2: Cropping</h3>
                  <p className="text-xs text-slate-600">
                    Cuts outer sections of the image. Note: Cropping shifts spatial coordinates and alters DCT block grids.
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { id: 'watermark_corner', label: 'Corner Crop', desc: 'Remove 15% bottom-right' },
                      { id: 'edge_small', label: 'Small Edge Crop', desc: 'Remove 5% right/bottom' },
                      { id: 'preserve_watermark', label: 'Top/Left Crop', desc: 'Preserves bottom-right watermark' },
                      { id: 'custom', label: 'Custom Rectangle', desc: 'Explicit coordinates' },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setCropPreset(p.id as any)}
                        className={`rounded-lg p-2.5 text-left border text-xs ${
                          cropPreset === p.id
                            ? 'border-accent-600 bg-white shadow-xs font-bold'
                            : 'border-slate-200 bg-white/50 hover:bg-white'
                        }`}
                      >
                        <div>{p.label}</div>
                        <div className="text-[11px] text-slate-500 font-normal">{p.desc}</div>
                      </button>
                    ))}
                  </div>

                  {cropPreset === 'custom' && (
                    <div className="grid grid-cols-4 gap-2 pt-2 text-xs">
                      <div>
                        <label className="label">X</label>
                        <input
                          type="number"
                          value={cropCustom.x}
                          onChange={(e) => setCropCustom({ ...cropCustom, x: parseInt(e.target.value) || 0 })}
                          className="input text-xs"
                        />
                      </div>
                      <div>
                        <label className="label">Y</label>
                        <input
                          type="number"
                          value={cropCustom.y}
                          onChange={(e) => setCropCustom({ ...cropCustom, y: parseInt(e.target.value) || 0 })}
                          className="input text-xs"
                        />
                      </div>
                      <div>
                        <label className="label">Width</label>
                        <input
                          type="number"
                          value={cropCustom.width}
                          onChange={(e) => setCropCustom({ ...cropCustom, width: parseInt(e.target.value) || 16 })}
                          className="input text-xs"
                        />
                      </div>
                      <div>
                        <label className="label">Height</label>
                        <input
                          type="number"
                          value={cropCustom.height}
                          onChange={(e) => setCropCustom({ ...cropCustom, height: parseInt(e.target.value) || 16 })}
                          className="input text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Blur */}
              {transType === 'blur' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-800">Experiment 3: Gaussian Blur</h3>
                  <p className="text-xs text-slate-600">
                    Applies 2D Gaussian convolution. High-frequency watermark signals and sharp features degrade under blur.
                  </p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold">Blur Radius:</span>
                      <span className="font-mono font-bold">{blurRadius.toFixed(1)} px</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="25.0"
                      step="0.5"
                      value={blurRadius}
                      onChange={(e) => setBlurRadius(parseFloat(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex gap-2">
                      {[
                        { r: 2.0, l: 'Mild (2px)' },
                        { r: 5.0, l: 'Moderate (5px)' },
                        { r: 12.0, l: 'Strong (12px)' },
                      ].map((preset) => (
                        <button
                          key={preset.r}
                          type="button"
                          onClick={() => setBlurRadius(preset.r)}
                          className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs hover:bg-slate-100"
                        >
                          {preset.l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* JPEG Recompression */}
              {transType === 'jpeg' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-800">Experiment 4: JPEG Recompression</h3>
                  <p className="text-xs text-slate-600">
                    Simulates lossy distribution. Lossy DCT quantization degrades invisible watermarks and introduces compression artifacts.
                  </p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold">JPEG Quality:</span>
                      <span className="font-mono font-bold">{jpegQuality}%</span>
                    </div>
                    <input
                      type="range"
                      min="15"
                      max="95"
                      step="5"
                      value={jpegQuality}
                      onChange={(e) => setJpegQuality(parseInt(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex gap-2">
                      {[95, 85, 70, 50, 25].map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setJpegQuality(q)}
                          className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs hover:bg-slate-100"
                        >
                          Q={q}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Resize */}
              {transType === 'resize' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-800">Experiment 5: Spatial Resize</h3>
                  <p className="text-xs text-slate-600">
                    Scales image dimensions using Lanczos interpolation. Destroys 8x8 DCT grid alignment used by invisible watermarks.
                  </p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold">Scale Factor:</span>
                      <span className="font-mono font-bold">{resizeScale}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.25"
                      max="2.0"
                      step="0.05"
                      value={resizeScale}
                      onChange={(e) => setResizeScale(parseFloat(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex gap-2">
                      {[0.75, 0.9, 1.25, 1.5].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setResizeScale(s)}
                          className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs hover:bg-slate-100"
                        >
                          {s}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Rotation */}
              {transType === 'rotation' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-800">Experiment 6: Small Angle Rotation</h3>
                  <p className="text-xs text-slate-600">
                    Rotates pixels by small angles using bicubic resampling. Introduces boundary padding along non-axial borders.
                  </p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold">Rotation Angle:</span>
                      <span className="font-mono font-bold">{rotAngle}°</span>
                    </div>
                    <input
                      type="range"
                      min="-25"
                      max="25"
                      step="1"
                      value={rotAngle}
                      onChange={(e) => setRotAngle(parseFloat(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex gap-2">
                      {[2, 5, 15, -5, -15].map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setRotAngle(a)}
                          className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs hover:bg-slate-100"
                        >
                          {a > 0 ? `+${a}` : a}°
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Copy-Move Tampering */}
              {transType === 'copy_move' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <Copy size={16} className="text-accent-600" />
                    Experiment 7: Copy-Move Tampering
                  </h3>
                  <p className="text-xs text-slate-600">
                    Clones a rectangular patch from one area of the image to another. Ground truth records both coordinates.
                    <span className="font-semibold text-amber-700 ml-1">The detector will not be informed of these coordinates.</span>
                  </p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
                    <div>
                      <label className="label">Source X</label>
                      <input
                        type="number"
                        value={cmParams.src_x}
                        onChange={(e) => setCmParams({ ...cmParams, src_x: parseInt(e.target.value) || 0 })}
                        className="input text-xs"
                      />
                    </div>
                    <div>
                      <label className="label">Source Y</label>
                      <input
                        type="number"
                        value={cmParams.src_y}
                        onChange={(e) => setCmParams({ ...cmParams, src_y: parseInt(e.target.value) || 0 })}
                        className="input text-xs"
                      />
                    </div>
                    <div>
                      <label className="label">Width (px)</label>
                      <input
                        type="number"
                        value={cmParams.src_w}
                        onChange={(e) => setCmParams({ ...cmParams, src_w: parseInt(e.target.value) || 20 })}
                        className="input text-xs"
                      />
                    </div>
                    <div>
                      <label className="label">Height (px)</label>
                      <input
                        type="number"
                        value={cmParams.src_h}
                        onChange={(e) => setCmParams({ ...cmParams, src_h: parseInt(e.target.value) || 20 })}
                        className="input text-xs"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 text-xs">
                    <div>
                      <label className="label">Destination X</label>
                      <input
                        type="number"
                        value={cmParams.dst_x}
                        onChange={(e) => setCmParams({ ...cmParams, dst_x: parseInt(e.target.value) || 0 })}
                        className="input text-xs"
                      />
                    </div>
                    <div>
                      <label className="label">Destination Y</label>
                      <input
                        type="number"
                        value={cmParams.dst_y}
                        onChange={(e) => setCmParams({ ...cmParams, dst_y: parseInt(e.target.value) || 0 })}
                        className="input text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Content Splicing */}
              {transType === 'splicing' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <Scissors size={16} className="text-accent-600" />
                    Experiment 8: Content Replacement / Splicing
                  </h3>
                  <p className="text-xs text-slate-600">
                    Insert an object or patch from a separate donor image into the target image.
                    Ground truth tracks the inserted area.
                  </p>
                  <div>
                    <label className="label">Donor Image</label>
                    <ImageDropzone onFile={onDonorFile} disabled={transforming} />
                    {donorFile && (
                      <div className="mt-2 flex items-center gap-3 text-xs font-semibold text-emerald-700">
                        {donorPreview && (
                          <img src={donorPreview} alt="Donor thumbnail" className="h-10 w-10 object-cover rounded border border-emerald-300" />
                        )}
                        <span>Donor loaded: {donorFile.name} ({(donorFile.size / 1024).toFixed(1)} KB)</span>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <div>
                      <label className="label">Target X</label>
                      <input
                        type="number"
                        value={spliceParams.target_x}
                        onChange={(e) => setSpliceParams({ ...spliceParams, target_x: parseInt(e.target.value) || 0 })}
                        className="input text-xs"
                      />
                    </div>
                    <div>
                      <label className="label">Target Y</label>
                      <input
                        type="number"
                        value={spliceParams.target_y}
                        onChange={(e) => setSpliceParams({ ...spliceParams, target_y: parseInt(e.target.value) || 0 })}
                        className="input text-xs"
                      />
                    </div>
                    <div>
                      <label className="label">Target Width</label>
                      <input
                        type="number"
                        value={spliceParams.target_w}
                        onChange={(e) => setSpliceParams({ ...spliceParams, target_w: parseInt(e.target.value) || 20 })}
                        className="input text-xs"
                      />
                    </div>
                    <div>
                      <label className="label">Target Height</label>
                      <input
                        type="number"
                        value={spliceParams.target_h}
                        onChange={(e) => setSpliceParams({ ...spliceParams, target_h: parseInt(e.target.value) || 20 })}
                        className="input text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between">
                <button
                  onClick={handleApplyTransform}
                  disabled={transforming}
                  className="btn-primary py-2 px-5 text-sm"
                >
                  {transforming ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Applying Transformation...
                    </>
                  ) : (
                    <>
                      <Zap size={16} /> Apply Transformation
                    </>
                  )}
                </button>
                {transformError && (
                  <span className="text-xs text-red-600 font-semibold">{transformError}</span>
                )}
              </div>
            </div>

            {/* Right Column: Live Interactive Coordinate Preview (5 cols) */}
            <div className="lg:col-span-5 sticky top-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <Crosshair size={14} className="text-accent-600" />
                    Interactive Region Preview
                  </h3>
                  <span className="font-mono text-[11px] text-slate-500 font-semibold">
                    {activeW} &times; {activeH} px
                  </span>
                </div>

                <p className="text-[11px] text-slate-500 mb-3">
                  {['occlusion', 'crop', 'copy_move', 'splicing'].includes(transType)
                    ? 'Click anywhere on preview to position coordinates directly. (Shift+Click sets Destination in Copy-Move).'
                    : 'Global filter: will be applied uniformly across all image pixels.'}
                </p>

                <div
                  className="relative overflow-hidden rounded-lg border border-slate-300 bg-slate-900/5 cursor-crosshair select-none"
                  onClick={handlePreviewClick}
                  role="button"
                  tabIndex={0}
                  aria-label="Interactive coordinate preview"
                >
                  {activeImageUrl && (
                    <img
                      src={activeImageUrl}
                      alt="Working target preview"
                      className="block w-full h-auto max-h-[360px] object-contain mx-auto"
                    />
                  )}

                  {/* SVG Coordinate Overlay */}
                  <svg
                    className="absolute inset-0 h-full w-full pointer-events-none"
                    viewBox={`0 0 ${activeW} ${activeH}`}
                    preserveAspectRatio="none"
                  >
                    {transType === 'occlusion' && (
                      <rect
                        x={occlParams.x}
                        y={occlParams.y}
                        width={occlParams.width}
                        height={occlParams.height}
                        fill={occlParams.color}
                        fillOpacity={occlParams.opacity}
                        stroke="#ef4444"
                        strokeWidth={Math.max(2, Math.round(activeW / 250))}
                        strokeDasharray="4 2"
                      />
                    )}
                    {transType === 'crop' && (
                      <rect
                        x={currentCropBox.x}
                        y={currentCropBox.y}
                        width={currentCropBox.width}
                        height={currentCropBox.height}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth={Math.max(2, Math.round(activeW / 250))}
                        strokeDasharray="6 3"
                      />
                    )}
                    {transType === 'copy_move' && (
                      <>
                        <rect
                          x={cmParams.src_x}
                          y={cmParams.src_y}
                          width={cmParams.src_w}
                          height={cmParams.src_h}
                          fill="rgba(59, 130, 246, 0.25)"
                          stroke="#2563eb"
                          strokeWidth={Math.max(2, Math.round(activeW / 250))}
                        />
                        <rect
                          x={cmParams.dst_x}
                          y={cmParams.dst_y}
                          width={cmParams.src_w}
                          height={cmParams.src_h}
                          fill="rgba(245, 158, 11, 0.25)"
                          stroke="#d97706"
                          strokeWidth={Math.max(2, Math.round(activeW / 250))}
                          strokeDasharray="4 2"
                        />
                      </>
                    )}
                    {transType === 'splicing' && (
                      <rect
                        x={spliceParams.target_x}
                        y={spliceParams.target_y}
                        width={spliceParams.target_w}
                        height={spliceParams.target_h}
                        fill="rgba(168, 85, 247, 0.25)"
                        stroke="#9333ea"
                        strokeWidth={Math.max(2, Math.round(activeW / 250))}
                        strokeDasharray="4 2"
                      />
                    )}
                  </svg>

                  {/* Non-spatial filter badges */}
                  {transType === 'blur' && (
                    <div className="absolute top-2 right-2 rounded bg-ink-900/80 px-2 py-1 text-[11px] font-mono text-white backdrop-blur-xs">
                      Gaussian Blur: {blurRadius.toFixed(1)}px
                    </div>
                  )}
                  {transType === 'jpeg' && (
                    <div className="absolute top-2 right-2 rounded bg-ink-900/80 px-2 py-1 text-[11px] font-mono text-white backdrop-blur-xs">
                      JPEG Quality: {jpegQuality}%
                    </div>
                  )}
                  {transType === 'resize' && (
                    <div className="absolute top-2 right-2 rounded bg-ink-900/80 px-2 py-1 text-[11px] font-mono text-white backdrop-blur-xs">
                      Scale: {resizeScale}x ({Math.round(activeW * resizeScale)} &times; {Math.round(activeH * resizeScale)})
                    </div>
                  )}
                  {transType === 'rotation' && (
                    <div className="absolute top-2 right-2 rounded bg-ink-900/80 px-2 py-1 text-[11px] font-mono text-white backdrop-blur-xs">
                      Rotation: {rotAngle > 0 ? `+${rotAngle}` : rotAngle}&deg;
                    </div>
                  )}
                </div>

                {/* Dynamic Legend */}
                <div className="mt-3 text-[11px] space-y-1">
                  {transType === 'occlusion' && (
                    <div className="flex items-center gap-2 text-slate-700">
                      <span className="h-3 w-3 rounded bg-red-500 inline-block" />
                      <span className="font-semibold">Occlusion Patch:</span>
                      <span className="font-mono text-slate-600">({occlParams.x}, {occlParams.y}) &bull; {occlParams.width} &times; {occlParams.height} px</span>
                    </div>
                  )}
                  {transType === 'crop' && (
                    <div className="flex items-center gap-2 text-slate-700">
                      <span className="h-3 w-3 rounded border border-blue-500 bg-blue-100 inline-block" />
                      <span className="font-semibold">Crop Rectangle:</span>
                      <span className="font-mono text-slate-600">({currentCropBox.x}, {currentCropBox.y}) &bull; {currentCropBox.width} &times; {currentCropBox.height} px</span>
                    </div>
                  )}
                  {transType === 'copy_move' && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-slate-700">
                        <span className="h-3 w-3 rounded bg-blue-500 inline-block" />
                        <span className="font-semibold text-blue-700">Source:</span>
                        <span className="font-mono text-slate-600">({cmParams.src_x}, {cmParams.src_y}) &bull; {cmParams.src_w} &times; {cmParams.src_h} px</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700">
                        <span className="h-3 w-3 rounded bg-amber-500 inline-block" />
                        <span className="font-semibold text-amber-700">Destination:</span>
                        <span className="font-mono text-slate-600">({cmParams.dst_x}, {cmParams.dst_y})</span>
                      </div>
                    </div>
                  )}
                  {transType === 'splicing' && (
                    <div className="flex items-center gap-2 text-slate-700">
                      <span className="h-3 w-3 rounded bg-purple-500 inline-block" />
                      <span className="font-semibold text-purple-700">Target Insertion:</span>
                      <span className="font-mono text-slate-600">({spliceParams.target_x}, {spliceParams.target_y}) &bull; {spliceParams.target_w} &times; {spliceParams.target_h} px</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

            {/* History Sequence Breadcrumb */}
            {historyList.length > 0 && (
              <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <History size={14} className="text-slate-500" />
                  Transformation History ({historyList.length} step{historyList.length > 1 ? 's' : ''})
                </h3>
                <div className="mt-2 space-y-1.5 text-xs text-slate-600">
                  {historyList.map((step) => (
                    <div key={step.step} className="flex items-center justify-between rounded bg-slate-50 px-2.5 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-accent-700">#{step.step}</span>
                        <span className="font-semibold text-slate-800">{step.transformation}</span>
                        <span className="text-slate-500">&mdash; {step.description}</span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">
                        {step.output_size[0]} &times; {step.output_size[1]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* STAGE C: ANALYZE MODIFIED IMAGE */}
      {stage === 'C' && experiment && (
        <section aria-labelledby="stage-c-heading" className="space-y-6">
          <div className="card p-6">
            <h2 id="stage-c-heading" className="text-lg font-bold text-ink-900 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-100 text-accent-700 text-xs font-bold">3</span>
              Analyze Modified Image
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Run forensic detectors on the modified output image.
              Detectors run independently with <span className="font-semibold text-slate-800">no prior knowledge</span> of the applied transformation or simulated ground truth.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {/* Copy-move checkbox */}
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs cursor-pointer hover:border-slate-300">
                <input
                  type="checkbox"
                  checked={runCopyMove}
                  onChange={(e) => setRunCopyMove(e.target.checked)}
                  className="mt-0.5 rounded text-accent-600"
                />
                <div>
                  <div className="text-sm font-bold text-slate-800">ORB Copy-Move Detector</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Searches for duplicated keypoints and groups them using affine RANSAC into candidate duplicated regions.
                  </div>
                </div>
              </label>

              {/* Splicing checkbox */}
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs cursor-pointer hover:border-slate-300">
                <input
                  type="checkbox"
                  checked={runSplicing}
                  onChange={(e) => setRunSplicing(e.target.checked)}
                  className="mt-0.5 rounded text-accent-600"
                />
                <div>
                  <div className="text-sm font-bold text-slate-800">Experimental Splicing Analysis</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Noise-residual and error-level analysis (ELA) heuristic. Indicators for human review.
                  </div>
                </div>
              </label>

              {/* Localization model */}
              <label className={`flex items-start gap-3 rounded-xl border p-4 shadow-2xs ${
                capabilities?.methods.localization.available
                  ? 'border-slate-200 bg-white cursor-pointer hover:border-slate-300'
                  : 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-60'
              }`}>
                <input
                  type="checkbox"
                  disabled={!capabilities?.methods.localization.available}
                  checked={runLoc && !!capabilities?.methods.localization.available}
                  onChange={(e) => setRunLoc(e.target.checked)}
                  className="mt-0.5 rounded text-accent-600"
                />
                <div>
                  <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                    <span>ONNX Localization Model</span>
                    {!capabilities?.methods.localization.available && (
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Unavailable</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {capabilities?.methods.localization.reason || 'Deep learning manipulation map (if configured).'}
                  </div>
                </div>
              </label>

              {/* Invisible Watermark Verification */}
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs cursor-pointer hover:border-slate-300">
                <input
                  type="checkbox"
                  checked={runWmVerify}
                  onChange={(e) => setRunWmVerify(e.target.checked)}
                  className="mt-0.5 rounded text-accent-600"
                />
                <div>
                  <div className="text-sm font-bold text-slate-800">Invisible Watermark Verification</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Attempts to recover the keyed DCT-QIM payload and verify HMAC integrity on the modified image.
                  </div>
                </div>
              </label>
            </div>

            {/* Splicing Sensitivity */}
            {runSplicing && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-700">Splicing Threshold Sensitivity:</span>
                  <span className="font-mono font-bold text-slate-900">{splicingThresh}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.9"
                  step="0.05"
                  value={splicingThresh}
                  onChange={(e) => setSplicingThresh(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
            )}

            <div className="mt-6 flex items-center gap-4">
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="btn-primary py-2.5 px-6 text-sm"
              >
                {analyzing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Running Forensic Detectors...
                  </>
                ) : (
                  <>
                    <FlaskConical size={16} /> Run Forensic Analysis
                  </>
                )}
              </button>
              {analysisError && (
                <span className="text-xs text-red-600 font-semibold">{analysisError}</span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* STAGE D: BEFORE-AND-AFTER COMPARISON & EVALUATION */}
      {stage === 'D' && analysisResult && (
        <section aria-labelledby="stage-d-heading" className="space-y-6">
          {/* Three Questions Answers Banner */}
          <div className="card p-6 space-y-4">
            <h2 id="stage-d-heading" className="text-lg font-bold text-ink-900 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-100 text-accent-700 text-xs font-bold">4</span>
              Forensic Results &amp; Scientific Interpretation
            </h2>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-accent-700 flex items-center gap-1.5">
                  <History size={14} /> Question A: Image Modification
                </div>
                <div className="mt-2 text-xs text-slate-700 leading-relaxed font-medium">
                  {analysisResult.answers.question_a}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-accent-700 flex items-center gap-1.5">
                  <ShieldCheck size={14} /> Question B: Watermark Integrity
                </div>
                <div className="mt-2 text-xs text-slate-700 leading-relaxed font-medium">
                  {analysisResult.answers.question_b}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-accent-700 flex items-center gap-1.5">
                  <FlaskConical size={14} /> Question C: Forgery Detection
                </div>
                <div className="mt-2 text-xs text-slate-700 leading-relaxed font-medium">
                  {analysisResult.answers.question_c}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Viewer & Artifact Tabs */}
          <div className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'modified', label: 'Modified Output' },
                  { id: 'baseline', label: 'Protected Baseline' },
                  { id: 'original', label: 'Original Source' },
                  { id: 'annotated', label: 'Copy-Move Overlay' },
                  { id: 'splicing', label: 'Splicing Overlay' },
                  { id: 'ground_truth', label: 'Ground Truth Mask' },
                  { id: 'compare', label: 'Side by Side' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setCompareTab(tab.id as any)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      compareTab === tab.id
                        ? 'bg-ink-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadReport('json')}
                  disabled={downloading === 'json'}
                  className="btn-secondary text-xs"
                >
                  <FileText size={14} /> JSON Report
                </button>
                <button
                  onClick={() => handleDownloadReport('html')}
                  disabled={downloading === 'html'}
                  className="btn-secondary text-xs"
                >
                  <FileDown size={14} /> HTML Report
                </button>
                <button
                  onClick={() => handleDownloadArtifact('modified.png', 'modified-image.png')}
                  disabled={downloading === 'modified.png'}
                  className="btn-primary text-xs"
                >
                  <Download size={14} /> Modified PNG
                </button>
              </div>
            </div>

            {/* Display Selected View */}
            <div className="mt-4">
              {compareTab === 'compare' ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="label mb-2">Protected Baseline</div>
                    <ZoomableImage src={baselineUrl} alt="Protected Baseline" />
                  </div>
                  <div>
                    <div className="label mb-2">Modified Image</div>
                    <ZoomableImage src={modifiedUrl} alt="Modified Image" />
                  </div>
                </div>
              ) : (
                <div>
                  {compareTab === 'modified' && <ZoomableImage src={modifiedUrl} alt="Modified Image" />}
                  {compareTab === 'baseline' && <ZoomableImage src={baselineUrl} alt="Protected Baseline" />}
                  {compareTab === 'original' && <ZoomableImage src={origUrl} alt="Original Image" />}
                  {compareTab === 'annotated' && <ZoomableImage src={cmAnnotatedUrl} alt="Copy-Move Output" />}
                  {compareTab === 'splicing' && <ZoomableImage src={spOverlayUrl} alt="Splicing Output" />}
                  {compareTab === 'ground_truth' && gtUrl && <ZoomableImage src={gtUrl} alt="Ground Truth Mask" />}
                </div>
              )}
            </div>
          </div>

          {/* Quantitative Evaluation Table (Ground Truth vs Detector) */}
          {analysisResult.evaluation && analysisResult.evaluation.length > 0 && (
            <div className="card p-6">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <FileCheck size={16} className="text-accent-600" />
                Quantitative Detection Evaluation vs Ground Truth
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                Pixel-level binary overlap comparing detector binary masks against known simulated modification regions.
              </p>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="py-2 px-3">Detector Method</th>
                      <th className="py-2 px-3">Precision</th>
                      <th className="py-2 px-3">Recall</th>
                      <th className="py-2 px-3">F1 Score</th>
                      <th className="py-2 px-3">IoU</th>
                      <th className="py-2 px-3">Pixel Counts (TP / FP / FN)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysisResult.evaluation.map((ev) => (
                      <tr key={ev.method} className="border-b border-slate-100">
                        <td className="py-2 px-3 font-bold text-slate-800">{ev.method}</td>
                        <td className="py-2 px-3 font-mono">{ev.metrics?.precision?.toFixed(3) ?? '-'}</td>
                        <td className="py-2 px-3 font-mono">{ev.metrics?.recall?.toFixed(3) ?? '-'}</td>
                        <td className="py-2 px-3 font-mono">{ev.metrics?.f1?.toFixed(3) ?? '-'}</td>
                        <td className="py-2 px-3 font-mono">{ev.metrics?.iou?.toFixed(3) ?? '-'}</td>
                        <td className="py-2 px-3 font-mono text-slate-600">
                          TP: {ev.metrics?.tp ?? 0} &bull; FP: {ev.metrics?.fp ?? 0} &bull; FN: {ev.metrics?.fn ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-[11px] text-slate-500 italic">
                * Note: ORB copy-move detector outlines convex hull candidate areas rather than pixel-exact contours, naturally yielding lower pixel precision than exact mask overlaps.
              </div>
            </div>
          )}

          {/* Detector Findings Details */}
          <div className="card p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-800">Detector Output Details</h3>
            <div className="space-y-3">
              {analysisResult.detection_results.map((res: any) => (
                <div key={res.method} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 uppercase">{res.method}</span>
                    <span className={`rounded-full px-2.5 py-0.5 font-semibold text-[11px] ${
                      res.status === 'candidate_regions_found'
                        ? 'bg-amber-100 text-amber-800'
                        : res.status === 'no_candidate_regions_found'
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {res.status}
                    </span>
                  </div>
                  <p className="mt-1.5 text-slate-600">{res.status_reason}</p>
                  {res.region_count !== undefined && (
                    <div className="mt-2 text-slate-500">
                      Candidate regions: <span className="font-semibold text-slate-800">{res.region_count}</span>
                    </div>
                  )}
                </div>
              ))}

              {analysisResult.watermark_verification && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 uppercase">Invisible Watermark Verification</span>
                    <span className={`rounded-full px-2.5 py-0.5 font-semibold text-[11px] ${
                      analysisResult.watermark_verification.status === 'verified'
                        ? 'bg-emerald-100 text-emerald-800'
                        : analysisResult.watermark_verification.status === 'inconclusive'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {analysisResult.watermark_verification.status}
                    </span>
                  </div>
                  <p className="mt-1.5 text-slate-600">{analysisResult.watermark_verification.status_reason}</p>
                  {analysisResult.watermark_verification.owner && (
                    <div className="mt-2 text-slate-500">
                      Recovered Owner ID: <span className="font-mono font-semibold text-slate-800">{String(analysisResult.watermark_verification.owner)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
