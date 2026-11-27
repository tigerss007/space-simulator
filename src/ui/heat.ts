import type { AnalysisResult, NodeResult, UnitResult } from '../engine/analyze'
import type { ViewMetric } from '../store'

export type HeatMetric = Exclude<ViewMetric, 'grade'>

export const METRIC_LABEL: Record<HeatMetric, string> = {
  nain: '통합도 (NAIN)',
  nach: '선택도 (NACH)',
  depth: '출입구 깊이',
  visibility: '가시성',
}
export const METRIC_HELP: Record<HeatMetric, string> = {
  nain: '값이 클수록 다른 모든 곳에서 접근하기 쉬운 자리',
  nach: '값이 클수록 지나다니는 길목에 있는 자리',
  depth: '값이 작을수록 주출입구에서 가까운 자리 (붉을수록 유리)',
  visibility: '문 앞에서 보이는 면적(㎡). 클수록 눈에 잘 띔',
}
export const RADIUS_LABEL = (k: string) => (k === 'n' ? '전체(각도 n)' : `${k}m 이내`)

export function nodeValue(n: NodeResult, m: HeatMetric, rk: string): number | null {
  if (m === 'depth') return n.depth
  if (m === 'visibility') return null
  const s = n.metrics[rk]
  return s ? (m === 'nain' ? s.nain : s.nach) : null
}
export function unitValue(u: UnitResult, m: HeatMetric, rk: string): number | null {
  if (m === 'depth') return u.entranceDepth
  if (m === 'visibility') return u.visibility
  if (u.nodeId === null) return null
  const s = u.metrics[rk]
  return s ? (m === 'nain' ? s.nain : s.nach) : null
}

export function valueRange(a: AnalysisResult, m: HeatMetric, rk: string): [number, number] {
  const vals = [
    ...a.nodes.map((n) => nodeValue(n, m, rk)),
    ...a.units.map((u) => unitValue(u, m, rk)),
  ].filter((v): v is number => v !== null && Number.isFinite(v))
  if (!vals.length) return [0, 1]
  return [Math.min(...vals), Math.max(...vals)]
}

const STOPS = ['#2c5fa8', '#3aa6c9', '#7bc96f', '#f2d144', '#e8742b', '#c1272d'] // 파랑 → 빨강 (붉을수록 유리)

function hexToRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}
export function heatColor(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (STOPS.length - 1)
  const i = Math.min(STOPS.length - 2, Math.floor(x))
  const f = x - i
  const a = hexToRgb(STOPS[i]), b = hexToRgb(STOPS[i + 1])
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}
export const HEAT_GRADIENT = `linear-gradient(to right, ${STOPS.join(', ')})`

// 값 → 0~1 (깊이는 작을수록 좋으므로 뒤집는다)
export function normalize(v: number, range: [number, number], m: HeatMetric): number {
  const [lo, hi] = range
  const t = hi - lo < 1e-12 ? 0.5 : (v - lo) / (hi - lo)
  return m === 'depth' ? 1 - t : t
}

export const fmt = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '-' : v.toFixed(d))
