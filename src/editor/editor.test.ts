import { describe, it, expect } from 'vitest'
import {
  addCorridor, addEntrance, addFloor, addUnit, addVertical, autoDoor, copyFloorContent, deleteItem, emptyProject,
  moveUnit, normalizeProject, polygonArea, pointInPolygon, rectPolygon, removeFloor, setUnitDoor, setUnitPolygon,
  setVerticalFloors, closestOnPolygon,
} from './ops'
import { applyTemplate, TEMPLATES } from './templates'
import { emptyHistory, pushHistory, redo, undo } from './history'
import { analyze } from '../engine/analyze'
import { createSampleProject } from '../model/sample'

describe('도형 계산', () => {
  it('면적(신발끈 공식)과 점-다각형 포함', () => {
    expect(polygonArea([[0, 0], [8, 0], [8, 14], [0, 14]])).toBe(112)
    expect(polygonArea([[0, 0], [4, 0], [0, 3]])).toBe(6) // 직각삼각형
    const L: [number, number][] = [[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]] // ㄱ자 모양 다각형
    expect(polygonArea(L)).toBe(75)
    expect(pointInPolygon([2, 8], L)).toBe(true)
    expect(pointInPolygon([8, 8], L)).toBe(false)
  })
  it('사각형은 모서리 순서와 관계없이 같은 다각형', () => {
    expect(rectPolygon([5, 5], [1, 2])).toEqual([[1, 2], [5, 2], [5, 5], [1, 5]])
  })
})

describe('프로젝트 편집', () => {
  const base = () => {
    let p = emptyProject('테스트')
    p = addCorridor(p, 'F1', [[0, 0], [20, 0]]).project
    return p
  }

  it('호실을 그리면 면적·문·전면 폭이 자동으로 채워진다', () => {
    const { project: p, id } = addUnit(base(), 'F1', rectPolygon([0, 2], [8, 12]))
    const u = p.units.find((x) => x.id === id)!
    expect(u.area).toBe(80)
    const d = p.unitDoors.find((x) => x.unitId === id)!
    expect(d.point).toEqual([4, 2]) // 복도에 가장 가까운 아래 변의 중점
    expect(u.frontageWidth).toBe(8)
  })

  it('복도가 없으면 문이 없고, 복도를 나중에 그리면 문이 생긴다', () => {
    let p = emptyProject('x')
    p = addUnit(p, 'F1', rectPolygon([0, 2], [8, 12])).project
    expect(p.unitDoors).toHaveLength(0)
    p = addCorridor(p, 'F1', [[0, 0], [20, 0]]).project
    expect(p.unitDoors).toHaveLength(1)
  })

  it('호실을 옮기면 문도 같이 옮겨진다', () => {
    const { project: p, id } = addUnit(base(), 'F1', rectPolygon([0, 2], [8, 12]))
    const q = moveUnit(p, id, 10, 0)
    expect(q.units[0].polygon[0]).toEqual([10, 2])
    expect(q.unitDoors[0].point).toEqual([14, 2])
  })

  it('꼭짓점을 끌어 모양을 바꾸면 면적이 다시 계산된다', () => {
    const { project: p, id } = addUnit(base(), 'F1', rectPolygon([0, 2], [8, 12]))
    const q = setUnitPolygon(p, id, rectPolygon([0, 2], [10, 12]))
    expect(q.units[0].area).toBe(100)
    expect(q.units[0].frontageWidth).toBe(10)
  })

  it('문을 직접 지정할 수 있다', () => {
    const { project: p, id } = addUnit(base(), 'F1', rectPolygon([0, 2], [8, 12]))
    const q = setUnitDoor(p, id, [2, 2])
    expect(q.unitDoors[0].point).toEqual([2, 2])
  })

  it('복도를 지우면 그 복도에 붙은 문은 사라진다', () => {
    const { project: p } = addUnit(base(), 'F1', rectPolygon([0, 2], [8, 12]))
    const q = deleteItem(p, { kind: 'corridor', id: p.corridors[0].id })
    expect(q.unitDoors).toHaveLength(0)
  })

  it('호실 삭제 시 문도 삭제', () => {
    const { project: p, id } = addUnit(base(), 'F1', rectPolygon([0, 2], [8, 12]))
    const q = deleteItem(p, { kind: 'unit', id })
    expect(q.units).toHaveLength(0)
    expect(q.unitDoors).toHaveLength(0)
  })

  it('층 추가: 위층/지하층의 이름·높이·level', () => {
    let p = emptyProject('x')
    p = addFloor(p, 'above').project
    p = addFloor(p, 'below').project
    const names = p.floors.map((f) => [f.name, f.level, f.elevation])
    expect(names).toEqual([['1F', 0, 0], ['2F', 1, 5], ['B1', -1, -5]])
  })

  it('층 삭제: 그 층의 모든 것과 수직동선 연결이 함께 정리된다', () => {
    let p = emptyProject('x')
    const f2 = addFloor(p, 'above')
    p = f2.project
    p = addVertical(p, 'elevator', [5, 5]).project
    p = addCorridor(p, f2.floor.id, [[0, 0], [10, 0]]).project
    p = addEntrance(p, f2.floor.id, [0, 0], '주출입구').project
    expect(p.verticals[0].connects).toHaveLength(2)
    const q = removeFloor(p, f2.floor.id)
    expect(q.floors).toHaveLength(1)
    expect(q.corridors).toHaveLength(0)
    expect(q.entrances).toHaveLength(0)
    expect(q.verticals[0].connects).toHaveLength(1)
  })

  it('수직동선: 기본은 모든 층 연결, 연결 층을 바꿀 수 있다', () => {
    let p = emptyProject('x')
    p = addFloor(p, 'above').project
    p = addFloor(p, 'above').project
    const { project, id } = addVertical(p, 'escalator', [3, 4])
    expect(project.verticals[0].connects).toHaveLength(3)
    const only = setVerticalFloors(project, id, [project.floors[0].id, project.floors[2].id])
    expect(only.verticals[0].connects.map((c) => c.floorId)).toEqual([project.floors[0].id, project.floors[2].id])
    expect(only.verticals[0].connects.every((c) => c.point[0] === 3)).toBe(true)
  })

  it('출입구 삭제 시 외부 요인의 방향 참조가 비워진다', () => {
    const s = createSampleProject()
    const q = deleteItem(s, { kind: 'entrance', id: 'ent-blvd' })
    expect(q.external.nearbyCommercial[0].directionEntranceId).toBe('')
    expect(q.external.transit[0].directionEntranceId).toBe('ent-subway')
  })

  it('층 복사: 다른 층의 호실·복도·문이 새 id로 복사된다', () => {
    const s = createSampleProject()
    const q = copyFloorContent(s, '1F', '2F')
    const u1 = q.units.filter((u) => u.floorId === '1F')
    const u2 = q.units.filter((u) => u.floorId === '2F')
    expect(u2).toHaveLength(u1.length)
    expect(u2[0].name.startsWith('2F')).toBe(true)
    expect(new Set(q.units.map((u) => u.id)).size).toBe(q.units.length)
    expect(q.unitDoors.filter((d) => u2.some((u) => u.id === d.unitId))).toHaveLength(u2.length)
  })

  it('normalizeProject는 샘플을 바꾸지 않는다 (멱등)', () => {
    const s = createSampleProject()
    const n = normalizeProject(s)
    expect(n.units).toEqual(s.units)
    expect(n.unitDoors).toEqual(s.unitDoors)
  })

  it('autoDoor / closestOnPolygon', () => {
    const u = { id: 'u', floorId: 'F1', name: 'u', polygon: rectPolygon([0, 2], [8, 12]), area: 80, frontageWidth: 8, category: '', isAnchor: false, locked: false }
    expect(autoDoor(u, [{ id: 'c', floorId: 'F1', points: [[0, 0], [20, 0]] }])!.point).toEqual([4, 2])
    expect(closestOnPolygon([4, 0], u.polygon).dist).toBe(2)
  })
})

describe('템플릿과 분석 연결 (완료 기준)', () => {
  for (const t of TEMPLATES) {
    it(`${t.name}: 빈 프로젝트에 적용하면 경고 없이 분석까지 돌아간다`, () => {
      const p0 = emptyProject('새 프로젝트')
      const p = applyTemplate(p0, p0.floors[0].id, t.id)
      expect(p.units.length).toBeGreaterThanOrEqual(15)
      expect(p.unitDoors).toHaveLength(p.units.length)
      const r = analyze(p)
      expect(r.warnings).toEqual([])
      expect(r.units.every((u) => u.nodeId !== null && u.entranceDepth !== null && u.visibility > 0)).toBe(true)
    })
  }

  it('호실이 서로 겹치지 않는다', () => {
    for (const t of TEMPLATES) {
      const p0 = emptyProject('x')
      const p = applyTemplate(p0, p0.floors[0].id, t.id)
      const total = p.units.reduce((s, u) => s + u.area, 0)
      // 호실 중심이 다른 호실 안에 들어가지 않는지
      for (const a of p.units) {
        const c: [number, number] = [a.polygon.reduce((s, q) => s + q[0], 0) / 4, a.polygon.reduce((s, q) => s + q[1], 0) / 4]
        const inside = p.units.filter((b) => pointInPolygon(c, b.polygon))
        expect(inside).toHaveLength(1)
      }
      expect(total).toBeGreaterThan(0)
    }
  })

  it('직접 그린 건물(복도+호실+출입구+층 추가+수직동선)도 분석된다', () => {
    let p = emptyProject('직접 그림')
    const f2 = addFloor(p, 'above')
    p = f2.project
    for (const f of p.floors) {
      p = addCorridor(p, f.id, [[0, 0], [40, 0]]).project
      for (let i = 0; i < 4; i++) p = addUnit(p, f.id, rectPolygon([i * 10, 2], [i * 10 + 10, 12])).project
    }
    p = addEntrance(p, p.floors[0].id, [0, 0], '주출입구').project
    p = addVertical(p, 'escalator', [20, 0]).project
    const r = analyze(p)
    expect(r.warnings).toEqual([])
    expect(r.units).toHaveLength(8)
    expect(r.units.every((u) => u.entranceDepth !== null)).toBe(true)
    // 2층은 에스컬레이터를 타야 하므로 1층보다 깊다
    const d = (fid: string) => Math.min(...r.units.filter((u) => u.floorId === fid).map((u) => u.entranceDepth!))
    expect(d(p.floors[1].id)).toBeGreaterThan(d(p.floors[0].id))
  })
})

describe('되돌리기/다시하기', () => {
  it('기록을 쌓고 되돌리고 다시 한다', () => {
    let h = emptyHistory<number>()
    h = pushHistory(h, 1) // 1에서 2로 바꿈
    h = pushHistory(h, 2) // 2에서 3으로 바꿈
    const u1 = undo(h, 3)!
    expect(u1.value).toBe(2)
    const u2 = undo(u1.history, u1.value)!
    expect(u2.value).toBe(1)
    expect(undo(u2.history, u2.value)).toBeNull()
    const r1 = redo(u2.history, u2.value)!
    expect(r1.value).toBe(2)
  })
  it('새 편집을 하면 다시하기 기록이 지워진다', () => {
    let h = emptyHistory<number>()
    h = pushHistory(h, 1)
    const u = undo(h, 2)!
    expect(u.history.future).toEqual([2])
    expect(pushHistory(u.history, 1).future).toEqual([])
  })
  it('기록 개수 상한', () => {
    let h = emptyHistory<number>()
    for (let i = 0; i < 150; i++) h = pushHistory(h, i)
    expect(h.past.length).toBe(100)
  })
})
