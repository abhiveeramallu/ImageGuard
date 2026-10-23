import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, ScanSearch, X } from 'lucide-react'
import Alert from '../components/Alert'
import DetectionResults from '../components/DetectionResults'
import DetectionSettingsPanel from '../components/DetectionSettingsPanel'
import ImageDropzone from '../components/ImageDropzone'
import ImageSummary from '../components/ImageSummary'
import { useBlobUrls } from '../hooks/useBlobUrls'
import { useImageFile } from '../hooks/useImageFile'
import { detectCopyMove, fetchArtifact, isCancelled } from '../services/api'
import { DEFAULT_DETECTION_SETTINGS, type DetectionResult, type DetectionSettings } from '../types/api'
import { sanitizeBaseName } from '../utils/names'

type Phase = 'idle' | 'uploading' | 'analysing' | 'fetching'
type Blobs = { annotated?: Blob; mask?: Blob; heatmap?: Blob }

export default function DetectionPage() {
  const { image, error: fileError, select, clear } = useImageFile()
  const [settings, setSettings] = useState<DetectionSettings>(DEFAULT_DETECTION_SETTINGS)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DetectionResult | null>(null)
  const [blobs, setBlobs] = useState<Blobs | null>(null)
  const urls = useBlobUrls(blobs)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const reset = useCallback(() => { setResult(null); setBlobs(null); setError(null) }, [])
  const onFile = useCallback(async (f: File) => { if (await select(f)) reset() }, [select, reset])

  const run = async () => {
    if (!image) return
    reset()
    const ctl = new AbortController()
    abort.current = ctl
    setPhase('uploading'); setProgress(0)
    try {
      const res = await detectCopyMove(image.file, settings, {
        signal: ctl.signal,
        onProgress: (f) => { setProgress(f); if (f >= 1) setPhase('analysing') },
      })
      setPhase('fetching')
      const [annotated, mask, heatmap] = await Promise.all([
        fetchArtifact(res.artifacts.annotated, ctl.signal),
        fetchArtifact(res.artifacts.mask, ctl.signal),
        fetchArtifact(res.artifacts.heatmap, ctl.signal),
      ])
      setResult(res); setBlobs({ annotated, mask, heatmap })
    } catch (e) {
      if (!isCancelled(e)) setError((e as Error).message)
    } finally {
      setPhase('idle'); abort.current = null
    }
  }

  const busy = phase !== 'idle'
  const statusText = phase === 'uploading' ? `Uploading… ${Math.round(progress * 100)}%`
    : phase === 'analysing' ? 'Extracting ORB features and matching descriptors…'
    : phase === 'fetching' ? 'Fetching result images…' : ''

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">Forgery Detection</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Looks for duplicated regions inside a single image (copy-move) using ORB feature matching. It does not detect splicing from other images or retouching.
        </p>
      </header>

      {!image ? <ImageDropzone onFile={onFile} error={fileError} label="Drag & drop the image to analyse" />
        : <>
          <ImageSummary image={image} onReplace={onFile} onRemove={() => { clear(); reset() }} disabled={busy} />
          {fileError && <p role="alert" className="text-sm font-medium text-red-700">{fileError}</p>}
        </>}

      {image && <DetectionSettingsPanel value={settings} onChange={setSettings} disabled={busy} />}

      {image && (
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" onClick={run} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <ScanSearch size={16} aria-hidden />}
            Start analysis
          </button>
          {busy && (
            <>
              <button className="btn-secondary" onClick={() => abort.current?.abort()}><X size={16} aria-hidden /> Cancel</button>
              <span role="status" className="text-sm text-slate-600">{statusText}</span>
            </>
          )}
        </div>
      )}

      {error && (
        <Alert kind="error" title="Analysis failed"
          action={<button className="btn-secondary shrink-0" onClick={run}>Retry</button>}>
          {error}
        </Alert>
      )}

      {result && image && urls.annotated && (
        <DetectionResults result={result} baseName={sanitizeBaseName(image.file.name)}
          urls={{ original: image.url, annotated: urls.annotated, mask: urls.mask, heatmap: urls.heatmap }} />
      )}
    </div>
  )
}
