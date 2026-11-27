import type { Project } from '../model/types'
import { analyze, type AnalysisResult } from './analyze'

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (r: AnalysisResult) => void; reject: (e: Error) => void }>()

function getWorker(): Worker | null {
  if (worker) return worker
  if (typeof Worker === 'undefined') return null
  worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<{ id: number; result?: AnalysisResult; error?: string }>) => {
    const p = pending.get(e.data.id)
    if (!p) return
    pending.delete(e.data.id)
    if (e.data.error) p.reject(new Error(e.data.error))
    else p.resolve(e.data.result!)
  }
  return worker
}

// 분석 실행. Worker를 쓸 수 없는 환경이면 같은 스레드에서 실행한다.
export function runAnalysis(project: Project): Promise<AnalysisResult> {
  const w = getWorker()
  if (!w) return Promise.resolve().then(() => analyze(project))
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({ id, project })
  })
}
