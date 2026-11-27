import { analyze } from './analyze'
import type { Project } from '../model/types'

// 무거운 계산은 화면이 멈추지 않도록 Web Worker에서 실행한다.
self.onmessage = (e: MessageEvent<{ id: number; project: Project }>) => {
  const { id, project } = e.data
  try {
    ;(self as unknown as Worker).postMessage({ id, result: analyze(project) })
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
