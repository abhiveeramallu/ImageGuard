import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../services/api'
import { detectionResult, png } from '../test/helpers'
import type { DetectionResult } from '../types/api'
import DetectionPage from './DetectionPage'

const api = vi.hoisted(() => ({ detectCopyMove: vi.fn(), fetchArtifact: vi.fn() }))
vi.mock('../services/api', async (orig) => ({ ...(await orig<typeof import('../services/api')>()), ...api }))
const files = vi.hoisted(() => ({ downloadBlob: vi.fn() }))
vi.mock('../utils/files', async (orig) => ({
  ...(await orig<typeof import('../utils/files')>()),
  readImageDimensions: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
  downloadBlob: files.downloadBlob,
}))

const setup = () => render(<MemoryRouter><DetectionPage /></MemoryRouter>)
const upload = async (f = png()) => { await userEvent.upload(screen.getByTestId('file-input'), f); await screen.findByText('Start analysis') }

beforeEach(() => {
  vi.clearAllMocks()
  api.fetchArtifact.mockResolvedValue(new Blob(['x']))
})

describe('DetectionPage', () => {
  it('rejects unsupported files with a clear message', async () => {
    setup()
    await userEvent.upload(screen.getByTestId('file-input'), new File([new Uint8Array(5)], 'a.gif', { type: 'image/gif' }), { applyAccept: false })
    expect(await screen.findByRole('alert')).toHaveTextContent(/JPEG or PNG/)
    expect(screen.queryByText('Start analysis')).not.toBeInTheDocument()
  })

  it('shows file name, dimensions and size after upload, and lets the user remove it', async () => {
    setup()
    await upload(png('evidence.png', 2048))
    expect(screen.getByText('evidence.png')).toBeInTheDocument()
    expect(screen.getByText('800 × 600')).toBeInTheDocument()
    expect(screen.getByText('2.0 KB')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(screen.getByText(/drag & drop/i)).toBeInTheDocument()
  })

  it('sends the chosen settings, shows loading, then renders real result data', async () => {
    let resolve!: (r: DetectionResult) => void
    api.detectCopyMove.mockReturnValue(new Promise((r) => { resolve = r }))
    setup()
    await upload()
    fireEvent.change(screen.getByLabelText('Minimum matches per region'), { target: { value: '12' } })
    await userEvent.click(screen.getByRole('button', { name: /start analysis/i }))

    expect(screen.getByRole('button', { name: /start analysis/i })).toBeDisabled()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(api.detectCopyMove.mock.calls[0][1]).toMatchObject({ min_matches: 12, ratio: 0.75 })

    await act(async () => { resolve(detectionResult()) })
    expect(await screen.findByText('Candidate copy-move regions detected')).toBeInTheDocument()
    const stats = within(screen.getByText('Statistics').parentElement!)
    expect(stats.getByText('4999')).toBeInTheDocument()
    expect(stats.getByText('37')).toBeInTheDocument()
    expect(stats.getByText('199 ms')).toBeInTheDocument()
    expect(screen.getByText('92, 92, 129, 112')).toBeInTheDocument()
    expect(api.fetchArtifact).toHaveBeenCalledTimes(3)
  })

  it('switches between original, annotated, mask and heatmap views', async () => {
    api.detectCopyMove.mockResolvedValue(detectionResult())
    setup()
    await upload()
    await userEvent.click(screen.getByRole('button', { name: /start analysis/i }))
    await screen.findByText('Candidate copy-move regions detected')
    expect(screen.getByAltText('annotated view')).toBeInTheDocument()
    for (const [tab, alt] of [['Mask', 'mask view'], ['Heatmap', 'heatmap view'], ['Original', 'original view']] as const) {
      await userEvent.click(screen.getByRole('tab', { name: tab }))
      expect(screen.getByAltText(alt)).toBeInTheDocument()
    }
    await userEvent.click(screen.getByRole('tab', { name: 'Side by side' }))
    expect(screen.getByAltText('Original image')).toBeInTheDocument()
    expect(screen.getByAltText('Annotated image')).toBeInTheDocument()
  })

  it('never presents a negative result as proof of authenticity', async () => {
    api.detectCopyMove.mockResolvedValue(detectionResult({
      status: 'no_candidate_regions_found', status_reason: 'Only 3 descriptor matches survived filtering.',
      regions: [], candidate_region_count: 0, matches_retained: 0,
    }))
    setup()
    await upload()
    await userEvent.click(screen.getByRole('button', { name: /start analysis/i }))
    expect(await screen.findByText(/No candidate regions detected by the selected method/)).toBeInTheDocument()
    expect(screen.getByText(/does not show that the image is authentic/)).toBeInTheDocument()
  })

  it('renders the inconclusive status', async () => {
    api.detectCopyMove.mockResolvedValue(detectionResult({ status: 'inconclusive', status_reason: 'Too little texture.', regions: [] }))
    setup()
    await upload()
    await userEvent.click(screen.getByRole('button', { name: /start analysis/i }))
    expect(await screen.findByText('Analysis inconclusive')).toBeInTheDocument()
  })

  it('shows an error with a retry that re-runs the analysis', async () => {
    api.detectCopyMove.mockRejectedValueOnce(new ApiRequestError('Cannot reach the ImageGuard server.', 'network'))
    api.detectCopyMove.mockResolvedValueOnce(detectionResult())
    setup()
    await upload()
    await userEvent.click(screen.getByRole('button', { name: /start analysis/i }))
    expect(await screen.findByText('Analysis failed')).toBeInTheDocument()
    expect(screen.getByText(/Cannot reach/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Candidate copy-move regions detected')).toBeInTheDocument()
    expect(api.detectCopyMove).toHaveBeenCalledTimes(2)
  })

  it('downloads artifacts through the backend', async () => {
    api.detectCopyMove.mockResolvedValue(detectionResult())
    setup()
    await upload(png('my photo.png'))
    await userEvent.click(screen.getByRole('button', { name: /start analysis/i }))
    await screen.findByText('Candidate copy-move regions detected')
    api.fetchArtifact.mockClear()
    await userEvent.click(screen.getByRole('button', { name: /report \(json\)/i }))
    await waitFor(() => expect(files.downloadBlob).toHaveBeenCalled())
    expect(api.fetchArtifact).toHaveBeenCalledWith('/r.json')
    expect(files.downloadBlob.mock.calls[0][1]).toBe('my_photo_report.json')
  })

  it('revokes preview object URLs when the image is replaced', async () => {
    setup()
    await upload()
    const before = (URL.revokeObjectURL as ReturnType<typeof vi.fn>).mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect((URL.revokeObjectURL as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(before)
  })
})
