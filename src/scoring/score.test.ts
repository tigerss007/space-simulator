import { describe, it, expect } from 'vitest'
import { zScores, scoreRows, rankAndGrade, gradeFor, computeScoring, WEIGHT_PRESETS } from './score'
import { createSampleProject } from '../model/sample'
import { analyze } from '../engine/analyze'
import { defaultSettings } from '../model/defaults'
import { effectiveUnits } from '../model/scenario'

const W0 = { nain: 0, nach: 0, entranceDepth: 0, visibility: 0, traffic: 0, floorBonus: 0, frontage: 0 }

describe('표준점수(z)', () => {
  it('[1,2,3,4] → 평균 2.5, 모집단 표준편차 √1.25', () => {
    const sd = Math.sqrt(1.25)
    const z = zScores([1, 2, 3, 4])
    expect(z[0]).toBeCloseTo(-1.5 / sd)
    expect(z[1]).toBeCloseTo(-0.5 / sd)
    expect(z[2]).toBeCloseTo(0.5 / sd)
    expect(z[3]).toBeCloseTo(1.5 / sd)
  })
  it('모두 같은 값이면 0, 값이 없으면 null', () => {
    expect(zScores([5, 5, 5])).toEqual([0, 0, 0])
    expect(zScores([1, null, 3])[1]).toBeNull()
  })
})

describe('점수 = Σ wi × z', () => {
  const rows = [1, 2, 3, 4].map((v, i) => ({ id: `u${i}`, values: { nain: v, entranceDepth: v } }))
  const sd = Math.sqrt(1.25)

  it('통합도 가중치 2 → 점수 = 2z', () => {
    const { rows: r } = scoreRows(rows, { ...W0, nain: 2 })
    expect(r[3].score).toBeCloseTo((2 * 1.5) / sd)
    expect(r[0].score).toBeCloseTo((2 * -1.5) / sd)
  })

  it('출입구 깊이는 작을수록 좋게 부호가 반전된다', () => {
    const { rows: r } = scoreRows(rows, { ...W0, entranceDepth: 1 })
    expect(r[0].score).toBeCloseTo(1.5 / sd) // 깊이 1(가장 얕음) = 최고
    expect(r[3].score).toBeCloseTo(-1.5 / sd)
  })

  it('가중치를 합산한다: nain 1 + 깊이 1이면 서로 상쇄', () => {
    const { rows: r } = scoreRows(rows, { ...W0, nain: 1, entranceDepth: 1 })
    for (const x of r) expect(x.score).toBeCloseTo(0)
  })

  it('모든 호실에 값이 없는 지표(통행량)는 제외된다', () => {
    const { used } = scoreRows(rows, { ...W0, traffic: 5, nain: 1 })
    expect(used).toContain('nain')
    expect(used).not.toContain('traffic')
  })

  it('가중치를 0으로 두면 그 지표는 점수에 영향이 없다', () => {
    const { rows: a } = scoreRows(rows, { ...W0, nain: 1 })
    const { rows: b } = scoreRows(rows, { ...W0, nain: 1, entranceDepth: 0 })
    expect(a.map((x) => x.score)).toEqual(b.map((x) => x.score))
  })
})

describe('등급(백분위)', () => {
  const g = { sMax: 10, aMax: 35, bMax: 70 }
  it('10개 호실: S 1개, A 2개, B 4개, C 3개', () => {
    const scores = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
    const grades = rankAndGrade(scores, g).map((x) => x.grade)
    expect(grades).toEqual(['S', 'A', 'A', 'B', 'B', 'B', 'B', 'C', 'C', 'C'])
  })
  it('동점은 같은 순위·같은 등급', () => {
    const r = rankAndGrade([5, 5, 1, 1, 1, 1, 1, 1, 1, 1], g)
    expect(r[0].rank).toBe(1)
    expect(r[1].rank).toBe(1)
    expect(r[0].grade).toBe(r[1].grade)
  })
  it('기준선 경계값 처리', () => {
    expect(gradeFor(10, g)).toBe('S')
    expect(gradeFor(10.1, g)).toBe('A')
    expect(gradeFor(35, g)).toBe('A')
    expect(gradeFor(70, g)).toBe('B')
    expect(gradeFor(70.1, g)).toBe('C')
  })
})

describe('샘플 프로젝트 점수·임대료', () => {
  const p = createSampleProject()
  const a = analyze(p)
  const r = computeScoring(p, a, effectiveUnits(p, null))

  it('모든 호실이 등급을 받고 S는 약 10%', () => {
    expect(r.units).toHaveLength(p.units.length)
    const s = r.units.filter((u) => u.grade === 'S').length
    expect(s).toBeGreaterThanOrEqual(5)
    expect(s).toBeLessThanOrEqual(8)
  })

  it('임대료 = 기준 임대료 × 등급 배수 × 면적, 합계가 맞는다', () => {
    for (const u of r.units) {
      const mult = p.settings.rent.multipliers[u.grade]
      expect(u.rentPerM2).toBeCloseTo(p.settings.rent.baseRentPerM2 * mult)
      expect(u.monthlyRent).toBeCloseTo(u.rentPerM2 * u.area)
    }
    expect(r.totalRent).toBeCloseTo(r.units.reduce((s, u) => s + u.monthlyRent, 0))
    const cnt = Object.values(r.gradeSummary).reduce((s, x) => s + x.count, 0)
    expect(cnt).toBe(r.units.length)
  })

  it('가중치를 바꾸면 등급이 바뀐다 (보행 중심 vs 층 보정 위주)', () => {
    const q = JSON.parse(JSON.stringify(p))
    q.settings.weights = { ...W0, floorBonus: 3 }
    const r2 = computeScoring(q, a, effectiveUnits(q, null))
    const f = (res: typeof r) => res.units.map((u) => u.grade).join('')
    expect(f(r2)).not.toBe(f(r))
    // 층 보정만 반영하면 1F 호실이 상위
    const top = r2.units.filter((u) => u.grade === 'S').every((u) => u.floorId === '1F')
    expect(top).toBe(true)
  })

  it('프리셋 3종이 있다', () => {
    expect(WEIGHT_PRESETS.map((x) => x.name)).toEqual(['기본', '보행 중심', '앵커 중심'])
    expect(defaultSettings().weights).toEqual(WEIGHT_PRESETS[0].weights)
  })
})
