import { describe, it, expect } from 'vitest'
import { createSampleProject } from './sample'
import { parseProject, serializeProject, validateProject } from './storage'
import { effectiveUnits } from './scenario'

describe('샘플 프로젝트', () => {
  const p = createSampleProject()

  it('검증을 통과한다', () => {
    expect(validateProject(p)).toEqual([])
  })

  it('지하 1층 + 지상 1~3층, 층당 호실 15~25개', () => {
    expect(p.floors.map((f) => f.name)).toEqual(['B1', '1F', '2F', '3F'])
    for (const f of p.floors) {
      const n = p.units.filter((u) => u.floorId === f.id).length
      expect(n).toBeGreaterThanOrEqual(15)
      expect(n).toBeLessThanOrEqual(25)
    }
  })

  it('모든 호실에 문이 있고 면적이 다각형과 일치한다', () => {
    for (const u of p.units) {
      expect(p.unitDoors.some((d) => d.unitId === u.id)).toBe(true)
      const [[x0, y0], , [x1, y1]] = u.polygon
      expect(u.area).toBeCloseTo((x1 - x0) * (y1 - y0))
    }
  })

  it('수직동선 구성: 연속형·분절형 에스컬레이터, 엘리베이터 2, 계단 2', () => {
    const esc = p.verticals.filter((v) => v.type === 'escalator').map((v) => v.escalator?.layout)
    expect(esc.sort()).toEqual(['continuous', 'scissor'])
    expect(p.verticals.filter((v) => v.type === 'elevator')).toHaveLength(2)
    expect(p.verticals.filter((v) => v.type === 'stairs')).toHaveLength(2)
  })

  it('주출입구 2곳, 지하철 연결 1곳', () => {
    expect(p.entrances.filter((e) => e.type === '주출입구')).toHaveLength(2)
    expect(p.entrances.filter((e) => e.type === '지하철연결')).toHaveLength(1)
  })

  it('외부 요인이 가리키는 출입구가 모두 존재한다', () => {
    const ids = new Set(p.entrances.map((e) => e.id))
    const e = p.external
    const dirs = [...e.nearbyCommercial, ...e.largeRetail, ...e.transit, ...e.attractors].map((x) => x.directionEntranceId)
    for (const d of dirs) expect(ids.has(d)).toBe(true)
    expect(e.residential.bands.map((b) => b.walkMin)).toEqual([5, 10, 15])
  })

  it('배치안 A는 3층, B는 1층에 앵커를 둔다', () => {
    const anchors = (id: string) => effectiveUnits(p, id).filter((u) => u.isAnchor).map((u) => u.floorId)
    expect(new Set(anchors('scn-a'))).toEqual(new Set(['3F']))
    expect(new Set(anchors('scn-b'))).toEqual(new Set(['1F']))
    expect(effectiveUnits(p, null).some((u) => u.isAnchor)).toBe(false)
  })
})

describe('저장/불러오기', () => {
  it('직렬화 후 다시 읽으면 동일하다', () => {
    const p = createSampleProject()
    const r = parseProject(serializeProject(p))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.project).toEqual(p)
  })

  it('잘못된 파일은 한국어 오류를 돌려준다', () => {
    expect(parseProject('not json').ok).toBe(false)
    const bad = createSampleProject()
    bad.units[0].floorId = '없는층'
    const r = parseProject(JSON.stringify(bad))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toContain('없는층')
  })
})
