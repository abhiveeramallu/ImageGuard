import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { capabilities, png } from '../test/helpers'
import AttackLabPage from './AttackLabPage'

const api = vi.hoisted(() => ({
  getCapabilities: vi.fn(),
  prepareAttackLab: vi.fn(),
  transformAttackLab: vi.fn(),
  resetAttackLab: vi.fn(),
  analyzeAttackLab: vi.fn(),
  fetchArtifact: vi.fn(),
}))

vi.mock('../services/api', async (orig) => ({
  ...(await orig<typeof import('../services/api')>()),
  ...api,
}))

const files = vi.hoisted(() => ({ downloadBlob: vi.fn() }))
vi.mock('../utils/files', async (orig) => ({
  ...(await orig<typeof import('../utils/files')>()),
  downloadBlob: files.downloadBlob,
}))

const mockPrepareResponse = {
  experiment_id: 'exp-test-123',
  original_image: { width: 800, height: 600, format: 'PNG', size_bytes: 50000 },
  baseline_image: {
    width: 800,
    height: 600,
    format: 'PNG',
    has_visible_watermark: true,
    visible_watermark_text: 'ImageGuard Protected',
    has_invisible_watermark: false,
    invisible_owner: null,
  },
  artifacts: {
    original: '/api/results/exp-test-123/original.png',
    baseline: '/api/results/exp-test-123/baseline.png',
    modified: '/api/results/exp-test-123/modified.png',
  },
  history: [],
  warnings: [],
}

const mockTransformResponse = {
  experiment_id: 'exp-test-123',
  transformation: 'copy_move',
  params: { src_x: 50, src_y: 50, src_w: 100, src_h: 100, dst_x: 220, dst_y: 200 },
  image: { width: 800, height: 600, format: 'PNG' },
  ground_truth: {
    has_mask: true,
    transformation: 'copy_move',
    regions: [{ type: 'copy_move_destination', x: 220, y: 200, width: 100, height: 100 }],
    mask_artifact: '/api/results/exp-test-123/ground_truth.png',
    notes: 'Simulated ground truth for copy_move.',
  },
  artifacts: {
    original: '/api/results/exp-test-123/original.png',
    baseline: '/api/results/exp-test-123/baseline.png',
    modified: '/api/results/exp-test-123/modified.png',
    ground_truth: '/api/results/exp-test-123/ground_truth.png',
  },
  history: [
    {
      step: 1,
      transformation: 'copy_move',
      params: { src_x: 50, src_y: 50, src_w: 100, src_h: 100, dst_x: 220, dst_y: 200 },
      description: 'Copy-move: (50,50,100x100) pasted to (220,200)',
      timestamp: '2026-10-25T01:00:00Z',
      output_size: [800, 600],
    },
  ],
  warnings: [],
}

const mockAnalysisResponse = {
  experiment_id: 'exp-test-123',
  image: { width: 800, height: 600, format: 'PNG' },
  baseline: {
    width: 800,
    height: 600,
    format: 'PNG',
    has_visible_watermark: true,
    visible_watermark_text: 'ImageGuard Protected',
    has_invisible_watermark: false,
  },
  history: mockTransformResponse.history,
  ground_truth: mockTransformResponse.ground_truth,
  detection_results: [
    {
      method: 'copy_move',
      status: 'candidate_regions_found',
      status_reason: '1 cluster of mutually consistent ORB matches found.',
      region_count: 1,
      processing_ms: 150,
      artifacts: { annotated: '/api/results/exp-test-123/copy_move.annotated' },
    },
    {
      method: 'splicing',
      status: 'no_candidate_regions_found',
      status_reason: 'No significant noise inconsistencies identified.',
      region_count: 0,
      processing_ms: 90,
      artifacts: { overlay: '/api/results/exp-test-123/splicing.overlay' },
    },
  ],
  watermark_verification: {
    status: 'not_detected',
    status_reason: 'No watermark matching the server key was found.',
    owner: null,
    integrity_verified: false,
  },
  evaluation: [
    {
      method: 'copy_move',
      metrics: {
        tp: 8000,
        fp: 2000,
        tn: 470000,
        fn: 0,
        precision: 0.8,
        recall: 1.0,
        f1: 0.889,
        iou: 0.8,
        semantics_note: 'Evaluated against ORB hull.',
      },
      notes: 'ORB convex hull approximation.',
    },
  ],
  answers: {
    question_a: 'Yes. Controlled copy-move transformation was applied.',
    question_b: 'Visible watermark applied; invisible watermark not embedded.',
    question_c: 'Copy-move detector found 1 candidate region.',
  },
  artifacts: {
    original: '/api/results/exp-test-123/original.png',
    baseline: '/api/results/exp-test-123/baseline.png',
    modified: '/api/results/exp-test-123/modified.png',
    ground_truth: '/api/results/exp-test-123/ground_truth.png',
    report_json: '/api/results/exp-test-123/experiment_report.json',
    report_html: '/api/results/exp-test-123/experiment_report.html',
  },
  report_json: '/api/results/exp-test-123/experiment_report.json',
  report_html: '/api/results/exp-test-123/experiment_report.html',
  processing_ms: 240,
  warnings: [],
  disclaimer: 'Scientific simulation notice.',
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getCapabilities.mockResolvedValue(capabilities())
  api.prepareAttackLab.mockResolvedValue(mockPrepareResponse)
  api.transformAttackLab.mockResolvedValue(mockTransformResponse)
  api.resetAttackLab.mockResolvedValue({
    ...mockTransformResponse,
    history: [],
    ground_truth: { has_mask: false, regions: [] },
  })
  api.analyzeAttackLab.mockResolvedValue(mockAnalysisResponse)
  api.fetchArtifact.mockResolvedValue(new Blob(['dummy-content']))
})

const setup = () =>
  render(
    <MemoryRouter>
      <AttackLabPage />
    </MemoryRouter>
  )

describe('AttackLabPage', () => {
  it('renders header, stages navigation, and dropzone', async () => {
    setup()
    expect(screen.getByRole('heading', { level: 1, name: /attack lab/i })).toBeInTheDocument()
    expect(screen.getByText(/prepare source image/i)).toBeInTheDocument()
    expect(screen.getByTestId('file-input')).toBeInTheDocument()
  })

  it('allows preparing baseline with watermarking and transitions to Stage B', async () => {
    setup()
    const input = screen.getByTestId('file-input')
    await userEvent.upload(input, png('sample.png'))

    // Toggle visible watermark
    const visCheckbox = screen.getByLabelText(/add visible watermark/i)
    await userEvent.click(visCheckbox)

    // Save baseline
    const saveBtn = screen.getByRole('button', { name: /save as protected baseline/i })
    await userEvent.click(saveBtn)

    await waitFor(() => {
      expect(api.prepareAttackLab).toHaveBeenCalledWith(
        expect.any(File),
        expect.objectContaining({ visible_watermark: true })
      )
    })

    // Should transition to Stage B
    expect(await screen.findByText(/select & apply a controlled transformation/i)).toBeInTheDocument()
  })

  it('allows selecting transformations and applying them', async () => {
    setup()
    await userEvent.upload(screen.getByTestId('file-input'), png('sample.png'))
    await userEvent.click(screen.getByRole('button', { name: /save as protected baseline/i }))

    await screen.findByText(/select & apply a controlled transformation/i)

    // Select Copy-Move
    const cmTab = screen.getByRole('button', { name: /7\. copy-move/i })
    await userEvent.click(cmTab)
    expect(screen.getByText(/experiment 7: copy-move tampering/i)).toBeInTheDocument()

    // Apply Transformation
    const applyBtn = screen.getByRole('button', { name: /apply transformation/i })
    await userEvent.click(applyBtn)

    await waitFor(() => {
      expect(api.transformAttackLab).toHaveBeenCalledWith(
        'exp-test-123',
        'copy_move',
        'current',
        expect.any(Object),
        null
      )
    })

    // History should display
    expect(await screen.findByText(/transformation history/i)).toBeInTheDocument()
  })

  it('resets to baseline when Reset to Baseline is clicked', async () => {
    setup()
    await userEvent.upload(screen.getByTestId('file-input'), png('sample.png'))
    await userEvent.click(screen.getByRole('button', { name: /save as protected baseline/i }))
    await screen.findByText(/select & apply a controlled transformation/i)

    const resetBtn = screen.getByRole('button', { name: /reset to baseline/i })
    await userEvent.click(resetBtn)

    await waitFor(() => {
      expect(api.resetAttackLab).toHaveBeenCalledWith('exp-test-123')
    })
  })

  it('executes analysis in Stage C and displays Stage D evaluation and reports', async () => {
    setup()
    await userEvent.upload(screen.getByTestId('file-input'), png('sample.png'))
    await userEvent.click(screen.getByRole('button', { name: /save as protected baseline/i }))
    await screen.findByText(/select & apply a controlled transformation/i)

    // Proceed to analyze
    const proceedBtn = screen.getByRole('button', { name: /proceed to analyze/i })
    await userEvent.click(proceedBtn)

    expect(await screen.findByText(/analyze modified image/i)).toBeInTheDocument()

    // Run Forensic Analysis
    const runBtn = screen.getByRole('button', { name: /run forensic analysis/i })
    await userEvent.click(runBtn)

    await waitFor(() => {
      expect(api.analyzeAttackLab).toHaveBeenCalledWith(
        'exp-test-123',
        expect.arrayContaining(['copy_move', 'splicing', 'watermark_verify']),
        expect.anything()
      )
    })

    // Should transition to Stage D
    expect(await screen.findByText(/forensic results & scientific interpretation/i)).toBeInTheDocument()
    expect(screen.getByText(/question a: image modification/i)).toBeInTheDocument()
    expect(screen.getByText(/question b: watermark integrity/i)).toBeInTheDocument()
    expect(screen.getByText(/question c: forgery detection/i)).toBeInTheDocument()

    // Quantitative evaluation table
    expect(screen.getByText(/quantitative detection evaluation vs ground truth/i)).toBeInTheDocument()
    expect(screen.getAllByText(/0.800/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/1.000/).length).toBeGreaterThanOrEqual(1)

    // Download reports
    const jsonRepBtn = screen.getByRole('button', { name: /json report/i })
    await userEvent.click(jsonRepBtn)
    await waitFor(() => {
      expect(files.downloadBlob).toHaveBeenCalled()
    })
  })
})
