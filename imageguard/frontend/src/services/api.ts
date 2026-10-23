import axios, { AxiosError, type AxiosProgressEvent } from 'axios'
import type {
  DetectionResult, DetectionSettings, DetectionStatus, WatermarkResult, WatermarkSettings,
} from '../types/api'

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:8000'

const http = axios.create({ baseURL: API_URL })

export class ApiRequestError extends Error {
  code: string
  status?: number
  constructor(message: string, code: string, status?: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

interface CallOptions { signal?: AbortSignal; onProgress?: (fraction: number) => void }

const progress = (cb?: (f: number) => void) => (e: AxiosProgressEvent) => {
  if (cb && e.total) cb(e.loaded / e.total)
}

async function toApiError(err: unknown): Promise<Error> {
  if (axios.isCancel(err)) return new ApiRequestError('Request cancelled.', 'cancelled')
  const e = err as AxiosError
  if (e.code === 'ECONNABORTED') {
    return new ApiRequestError('The request timed out. Try a smaller image or lower the analysis size, then retry.', 'timeout')
  }
  if (!e.response) {
    return new ApiRequestError(`Cannot reach the ImageGuard server at ${API_URL}. Check that the backend is running, then retry.`, 'network')
  }
  let body: unknown = e.response.data
  if (body instanceof Blob) {
    try { body = JSON.parse(await body.text()) } catch { body = undefined }
  }
  const info = (body as { error?: { code?: string; message?: string } } | undefined)?.error
  return new ApiRequestError(info?.message ?? `Server error (${e.response.status}).`, info?.code ?? 'http_error', e.response.status)
}

const DETECTION_STATUSES: DetectionStatus[] = ['candidate_regions_found', 'no_candidate_regions_found', 'inconclusive']

function assertDetection(data: unknown): DetectionResult {
  const d = data as Partial<DetectionResult>
  if (!d || !DETECTION_STATUSES.includes(d.status as DetectionStatus) || !d.artifacts || !Array.isArray(d.regions) || !d.image) {
    throw new ApiRequestError('The server returned an unexpected response.', 'bad_response')
  }
  return d as DetectionResult
}

export async function detectCopyMove(file: File, settings: DetectionSettings, opts: CallOptions = {}): Promise<DetectionResult> {
  const form = new FormData()
  form.append('file', file)
  Object.entries(settings).forEach(([k, v]) => form.append(k, String(v)))
  try {
    const res = await http.post('/api/detect/copy-move', form, {
      signal: opts.signal, timeout: 120_000, onUploadProgress: progress(opts.onProgress),
    })
    return assertDetection(res.data)
  } catch (err) {
    throw err instanceof ApiRequestError ? err : await toApiError(err)
  }
}

export async function fetchArtifact(path: string, signal?: AbortSignal): Promise<Blob> {
  try {
    const res = await http.get(path, { responseType: 'blob', signal, timeout: 60_000 })
    return res.data as Blob
  } catch (err) {
    throw await toApiError(err)
  }
}

export async function applyWatermark(
  file: File, settings: WatermarkSettings, logo: File | null, opts: CallOptions = {},
): Promise<WatermarkResult> {
  const form = new FormData()
  form.append('file', file)
  Object.entries(settings).forEach(([k, v]) => form.append(k, String(v)))
  if (settings.watermark_type === 'logo' && logo) form.append('logo', logo)
  try {
    const res = await http.post('/api/watermark', form, {
      responseType: 'blob', signal: opts.signal, timeout: 60_000, onUploadProgress: progress(opts.onProgress),
    })
    const cd = String(res.headers['content-disposition'] ?? '')
    const filename = /filename="([^"]+)"/.exec(cd)?.[1] ?? `watermarked.${settings.output_format === 'jpeg' ? 'jpg' : 'png'}`
    return { blob: res.data as Blob, filename }
  } catch (err) {
    throw await toApiError(err)
  }
}

export function isCancelled(err: unknown): boolean {
  return err instanceof ApiRequestError && err.code === 'cancelled'
}
