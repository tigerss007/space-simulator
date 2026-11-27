import type { Settings } from './types'

// 모든 계수는 "보정 전 가정값"이다. 실측 데이터로 보정되기 전까지 상대 비교용으로만 쓴다.
export const defaultSettings = (): Settings => ({
  vertical: {
    escalatorUp: 1.0,
    escalatorDown: 1.0,
    scissorTransfer: 0.5,
    voidVisibleFactor: 0.8,
    elevatorBase: 1.5,
    elevatorWaitFactor: 0.02,
    elevatorPerFloor: 0.1,
    stairsPerFloor: 2.5,
    stairsExponent: 1.5,
    rampPerFloor: 0.5,
    scissorOffsetM: 12,
  },
  analysis: { maxSegmentM: 8, metricWeight: 0.004, attachToleranceM: 6, visibilityRays: 90, visibilityRangeM: 60 },
  radii: { angular: 'n', metric: [50, 100, 200], selectedMetric: 100 },
  weights: { nain: 1, nach: 0.7, entranceDepth: 0.8, visibility: 0.5, traffic: 1, floorBonus: 0.4, frontage: 0.3 },
  floorAdjust: {},
  grade: { sMax: 10, aMax: 35, bMax: 70 },
  rent: { baseRentPerM2: 50000, multipliers: { S: 1.5, A: 1.2, B: 1.0, C: 0.7 } },
  external: { beta: 0.1 },
  simulation: { seed: 1, agentCount: 500 },
})

export const emptyExternal = () => ({
  residential: { bands: [] },
  nearbyCommercial: [],
  largeRetail: [],
  transit: [],
  attractors: [],
})

// 저장 파일에 없는 설정 항목은 기본값으로 채운다. (예전 버전 파일·자동저장 호환)
export function mergeDefaults<T>(defaults: T, given: unknown): T {
  if (Array.isArray(defaults) || typeof defaults !== 'object' || defaults === null) {
    return (given === undefined || given === null ? defaults : given) as T
  }
  const g = (given && typeof given === 'object' ? given : {}) as Record<string, unknown>
  const out: Record<string, unknown> = { ...g }
  for (const [k, v] of Object.entries(defaults as Record<string, unknown>)) out[k] = mergeDefaults(v, g[k])
  return out as T
}
