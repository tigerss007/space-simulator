import type { Project, Settings, Unit } from '../model/types'
import type { AnalysisResult } from '../engine/analyze'

// ===== 호실 점수·등급·임대료 (docs/SPEC.md 7장) =====
// 점수 = Σ wi × z(지표i). z는 모든 호실에 대한 표준점수(모집단 표준편차).
// 모든 가중치·배수는 "보정 전 가정값"이며 배치안 상대 비교용이다.

export const INDICATORS = ['nain', 'nach', 'entranceDepth', 'visibility', 'traffic', 'floorBonus', 'frontage'] as const
export type Indicator = (typeof INDICATORS)[number]
export type Grade = 'S' | 'A' | 'B' | 'C'
export const GRADES: Grade[] = ['S', 'A', 'B', 'C']

export const INDICATOR_LABEL: Record<Indicator, string> = {
  nain: '지역 통합도 (NAIN)',
  nach: '선택도 (NACH)',
  entranceDepth: '출입구 깊이 (가까울수록 유리)',
  visibility: '가시성',
  traffic: '시뮬레이션 통행량',
  floorBonus: '층 보정',
  frontage: '전면 폭',
}

export const WEIGHT_PRESETS: { name: string; weights: Settings['weights'] }[] = [
  { name: '기본', weights: { nain: 1, nach: 0.7, entranceDepth: 0.8, visibility: 0.5, traffic: 1, floorBonus: 0.4, frontage: 0.3 } },
  { name: '보행 중심', weights: { nain: 1.2, nach: 1.2, entranceDepth: 0.6, visibility: 0.6, traffic: 1.4, floorBonus: 0.2, frontage: 0.2 } },
  { name: '앵커 중심', weights: { nain: 0.8, nach: 0.5, entranceDepth: 0.3, visibility: 0.4, traffic: 1.2, floorBonus: 0.1, frontage: 0.5 } },
]

export type IndicatorValues = Partial<Record<Indicator, number | null>>

// 표준점수. 값이 없는 호실은 null, 표준편차가 0이면 모두 0.
export function zScores(values: (number | null)[]): (number | null)[] {
  const xs = values.filter((v): v is number => v !== null && Number.isFinite(v))
  if (!xs.length) return values.map(() => null)
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length)
  return values.map((v) => (v === null || !Number.isFinite(v) ? null : sd < 1e-12 ? 0 : (v - mean) / sd))
}

export interface ScoredRow {
  id: string
  z: Record<Indicator, number | null>
  score: number
}

// 호실별 지표값 → 점수. 모든 호실에서 값이 없는 지표(예: 아직 계산되지 않은 통행량)는 제외한다.
// 일부 호실만 값이 없으면 그 지표에서 가장 나쁜 값으로 본다.
export function scoreRows(
  rows: { id: string; values: IndicatorValues }[],
  weights: Settings['weights'],
): { rows: ScoredRow[]; used: Indicator[] } {
  const used: Indicator[] = []
  const zs = {} as Record<Indicator, (number | null)[]>
  for (const ind of INDICATORS) {
    let col = rows.map((r) => r.values[ind] ?? null)
    if (col.every((v) => v === null)) { zs[ind] = col; continue }
    used.push(ind)
    // 값이 없는 호실은 가장 나쁜 값 취급. 깊이는 값이 클수록 나쁘고, 나머지는 작을수록 나쁘다.
    const finite = col.filter((v): v is number => v !== null)
    const worst = ind === 'entranceDepth' ? Math.max(...finite) : Math.min(...finite)
    col = col.map((v) => v ?? worst)
    let z = zScores(col)
    if (ind === 'entranceDepth') z = z.map((v) => (v === null ? null : -v)) // 작을수록 좋게 부호 반전
    zs[ind] = z
  }
  const out = rows.map((r, i) => {
    const z = Object.fromEntries(INDICATORS.map((ind) => [ind, zs[ind][i]])) as Record<Indicator, number | null>
    const score = INDICATORS.reduce((s, ind) => s + weights[ind] * (z[ind] ?? 0), 0)
    return { id: r.id, z, score }
  })
  return { rows: out, used }
}

// 점수 순위로 등급을 매긴다. 상위 백분율 = (순위) / 전체 × 100, 동점은 같은 순위(가장 좋은 쪽).
export function gradeFor(topPct: number, g: Settings['grade']): Grade {
  return topPct <= g.sMax + 1e-9 ? 'S' : topPct <= g.aMax + 1e-9 ? 'A' : topPct <= g.bMax + 1e-9 ? 'B' : 'C'
}

export function rankAndGrade(scores: number[], g: Settings['grade']) {
  const n = scores.length
  return scores.map((s) => {
    const rank = scores.filter((x) => x > s + 1e-12).length + 1
    const topPct = (rank / n) * 100
    return { rank, topPct, grade: gradeFor(topPct, g) }
  })
}

export interface UnitScore {
  unitId: string
  floorId: string
  name: string
  category: string
  isAnchor: boolean
  area: number
  z: Record<Indicator, number | null>
  score: number
  score100: number // 최저 0 ~ 최고 100으로 환산한 상대 점수
  rank: number
  topPct: number
  grade: Grade
  rentPerM2: number // 원/㎡·월
  monthlyRent: number // 원/월
}

export interface ScoringResult {
  units: UnitScore[]
  byId: Map<string, UnitScore>
  used: Indicator[]
  radiusKey: string
  gradeSummary: Record<Grade, { count: number; area: number; rent: number }>
  totalRent: number
  excluded: string[] // 복도에 붙지 않아 등급을 매기지 못한 호실
}

export function computeScoring(
  project: Project, analysis: AnalysisResult, units: Unit[],
): ScoringResult {
  const S = project.settings
  const want = String(S.radii.selectedMetric)
  const radiusKey = analysis.radiusKeys.includes(want) ? want : 'n'
  const unitById = new Map(units.map((u) => [u.id, u]))
  const att = analysis.units.filter((r) => r.nodeId !== null && unitById.has(r.unitId))
  const excluded = analysis.units.filter((r) => r.nodeId === null).map((r) => unitById.get(r.unitId)?.name ?? r.unitId)

  const { rows, used } = scoreRows(
    att.map((r) => {
      const u = unitById.get(r.unitId)!
      return {
        id: r.unitId,
        values: {
          nain: r.metrics[radiusKey]?.nain ?? null,
          nach: r.metrics[radiusKey]?.nach ?? null,
          entranceDepth: r.entranceDepth,
          visibility: r.visibility,
          traffic: null, // Phase 5(유동 시뮬레이션)에서 채워진다
          floorBonus: S.floorAdjust[u.floorId] ?? 0,
          frontage: u.frontageWidth,
        },
      }
    }),
    S.weights,
  )

  const scores = rows.map((r) => r.score)
  const lo = Math.min(...scores), hi = Math.max(...scores)
  const rg = rankAndGrade(scores, S.grade)
  const out: UnitScore[] = rows.map((r, i) => {
    const u = unitById.get(r.id)!
    const rentPerM2 = S.rent.baseRentPerM2 * S.rent.multipliers[rg[i].grade]
    return {
      unitId: r.id, floorId: u.floorId, name: u.name, category: u.category, isAnchor: u.isAnchor, area: u.area,
      z: r.z, score: r.score, score100: hi - lo < 1e-12 ? 50 : ((r.score - lo) / (hi - lo)) * 100,
      rank: rg[i].rank, topPct: rg[i].topPct, grade: rg[i].grade,
      rentPerM2, monthlyRent: rentPerM2 * u.area,
    }
  })
  const gradeSummary = Object.fromEntries(GRADES.map((g) => [g, { count: 0, area: 0, rent: 0 }])) as ScoringResult['gradeSummary']
  for (const u of out) {
    gradeSummary[u.grade].count++
    gradeSummary[u.grade].area += u.area
    gradeSummary[u.grade].rent += u.monthlyRent
  }
  return {
    units: out, byId: new Map(out.map((u) => [u.unitId, u])), used, radiusKey, gradeSummary,
    totalRent: out.reduce((s, u) => s + u.monthlyRent, 0), excluded,
  }
}
