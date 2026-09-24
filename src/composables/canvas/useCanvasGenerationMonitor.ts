import { pollUntilTerminal } from '../../services/api'
import type { CanvasGenerationKind } from '../../types/canvas'

export type CanvasJobAsset = {
  id: string
  kind: 'IMAGE' | 'VIDEO'
  name: string
  mimeType: string
  size: number
  contentUrl: string
  createdAt: string
}

export type CanvasGenerationJob = {
  id: string
  kind: CanvasGenerationKind | 'CHAT'
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
  model: string
  creditCost?: number
  errorMessage?: string | null
  outputs?: Array<{ asset: CanvasJobAsset }>
  stream?: { content?: string } | null
}

interface CanvasGenerationMonitorActions {
  nodeExists: (nodeId: string) => boolean
  jobIdForNode: (nodeId: string) => string | undefined
  updateNode: (nodeId: string, patch: { status?: CanvasGenerationJob['status']; creditCost?: number; error?: string; content?: string }) => void
  applyResult: (nodeId: string, job: CanvasGenerationJob) => void
  streamJob: (jobId: string, onUpdate: (job: CanvasGenerationJob) => void) => Promise<CanvasGenerationJob>
  fetchJob: (jobId: string) => Promise<CanvasGenerationJob>
  cancelJob: (jobId: string) => Promise<CanvasGenerationJob>
}

export function useCanvasGenerationMonitor(actions: CanvasGenerationMonitorActions) {
  const monitoringJobs = new Map<string, Promise<void>>()

  async function pollGeneration(jobId: string, onUpdate: (job: CanvasGenerationJob) => void) {
    return pollUntilTerminal<CanvasGenerationJob>(`/generations/${jobId}`, {
      onUpdate,
      maxAttempts: 300,
      timeoutMessage: '生成任务等待超时，请稍后重新打开画布查看。',
    })
  }

  async function monitorGeneration(nodeId: string, jobId: string) {
    if (monitoringJobs.has(jobId)) return monitoringJobs.get(jobId)
    const monitor = (async () => {
      try {
        const update = (current: CanvasGenerationJob) => {
          if (!actions.nodeExists(nodeId)) return
          actions.updateNode(nodeId, {
            status: current.status,
            creditCost: current.creditCost,
            ...(current.stream?.content ? { content: current.stream.content } : {}),
          })
        }
        let job: CanvasGenerationJob
        try {
          job = await actions.streamJob(jobId, update)
        } catch {
          job = await pollGeneration(jobId, update)
        }
        actions.applyResult(nodeId, job)
      } catch (reason) {
        if (actions.nodeExists(nodeId)) {
          actions.updateNode(nodeId, {
            status: 'FAILED',
            error: reason instanceof Error ? reason.message : '任务状态读取失败',
          })
        }
      } finally {
        monitoringJobs.delete(jobId)
      }
    })()
    monitoringJobs.set(jobId, monitor)
    return monitor
  }

  async function cancelGeneration(nodeId: string) {
    const jobId = actions.jobIdForNode(nodeId)
    if (!jobId) return
    try {
      const job = await actions.cancelJob(jobId)
      actions.updateNode(nodeId, {
        status: job.status,
        error: job.status === 'CANCELLED' ? '任务已取消' : job.errorMessage || '',
      })
    } catch (reason) {
      actions.updateNode(nodeId, { error: reason instanceof Error ? reason.message : '取消任务失败' })
    }
  }

  return { monitorGeneration, cancelGeneration }
}
