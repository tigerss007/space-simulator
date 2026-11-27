import { describe, it, expect } from 'vitest'
import { makeGraph, splitCorridors, buildHorizontalGraph, buildGraph, type Link, type SegNode } from './graph'
import { computeSyntax, shortestCosts, linkCost } from './syntax'
import { isovistArea } from './visibility'
import { analyze } from './analyze'
import { createSampleProject } from '../model/sample'
import { defaultSettings } from '../model/defaults'
import type { Project, Vec2 } from '../model/types'

// ---- 테스트용 헬퍼 ----
const node = (id: number): SegNode => ({
  id, floorId: 'F', corridorId: 'c', a: [0, 0], b: [1, 0], length: 1, mid: [0, 0],
})
// 양방향 링크(각도 비용 c, 거리 m)로 이루어진 작은 그래프
function graphOf(n: number, edges: [number, number, number, number?][]) {
  const links: Link[] = []
  for (const [a, b, c, m = 10] of edges) {
    links.push({ from: a, to: b, angular: c, metric: m, kind: 'walk' })
    links.push({ from: b, to: a, angular: c, metric: m, kind: 'walk' })
  }
  return makeGraph(Array.from({ length: n }, (_, i) => node(i)), links)
}
const PURE = { metricWeight: 0, radius: null }

describe('지표 계산 (손계산 비교)', () => {
  it('일직선 3노드 A-B-C (링크 비용 1)', () => {
    // A: B=1, C=2 → TD=3, NC=3 → NAIN = 3^1.2/5, CH=0 → NACH = log(1)/log(6) = 0
    // B: A=1, C=1 → TD=2, NC=3 → NAIN = 3^1.2/4, CH=2(A→C, C→A) → NACH = log(3)/log(5)
    const m = computeSyntax(graphOf(3, [[0, 1, 1], [1, 2, 1]]), PURE)
    expect(m[0].td).toBeCloseTo(3); expect(m[0].nc).toBe(3)
    expect(m[0].nain).toBeCloseTo(Math.pow(3, 1.2) / 5)
    expect(m[0].ch).toBeCloseTo(0); expect(m[0].nach).toBeCloseTo(0)
    expect(m[1].td).toBeCloseTo(2)
    expect(m[1].nain).toBeCloseTo(Math.pow(3, 1.2) / 4)
    expect(m[1].ch).toBeCloseTo(2)
    expect(m[1].nach).toBeCloseTo(Math.log(3) / Math.log(5))
    expect(m[2].nain).toBeCloseTo(m[0].nain)
  })

  it('네 노드 고리(같은 길이 최단경로 2개는 절반씩 분배)', () => {
    // A-B-C-D-A, 비용 1. B에서: A=1, C=1, D=2 → TD=4, NC=4.
    // B를 지나는 쌍: A→C, C→A 각각 경로 2개 중 1개 → 0.5+0.5 = 1
    const m = computeSyntax(graphOf(4, [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 0, 1]]), PURE)
    expect(m[1].td).toBeCloseTo(4)
    expect(m[1].ch).toBeCloseTo(1)
    expect(m[1].nach).toBeCloseTo(Math.log(2) / Math.log(7))
    expect(m[1].nain).toBeCloseTo(Math.pow(4, 1.2) / 6)
  })

  it('T자(중심 1 + 잎 3): 중심의 선택도', () => {
    // 중심 0, 잎 1,2,3. 잎→다른 잎 쌍 6개가 모두 중심을 지남 → CH=6, TD=3
    const m = computeSyntax(graphOf(4, [[0, 1, 1], [0, 2, 1], [0, 3, 1]]), PURE)
    expect(m[0].ch).toBeCloseTo(6)
    expect(m[0].td).toBeCloseTo(3)
    expect(m[0].nach).toBeCloseTo(Math.log(7) / Math.log(6))
    // 잎 1: 중심=1, 나머지 잎=2씩 → TD=5
    expect(m[1].td).toBeCloseTo(5)
    expect(m[1].ch).toBeCloseTo(0)
  })

  it('metric 반경: 10m씩 떨어진 4노드 일직선 A-B-C-D, 반경 15m', () => {
    // 각 노드는 반경 안의 이웃만 본다. A: {A,B} / B: {A,B,C} / C: {B,C,D} / D: {C,D}
    // 출발점 반경 밖의 쌍은 세지 않으므로 중간 노드를 지나는 쌍이 없다 → CH=0
    const g = graphOf(4, [[0, 1, 1, 10], [1, 2, 1, 10], [2, 3, 1, 10]])
    const m = computeSyntax(g, { metricWeight: 0, radius: 15 })
    expect(m.map((x) => x.nc)).toEqual([2, 3, 3, 2])
    expect(m[0].td).toBeCloseTo(1)
    expect(m[1].td).toBeCloseTo(2)
    expect(m.every((x) => Math.abs(x.ch) < 1e-9)).toBe(true)
  })

  it('metric 반경 25m: A→C, C→A가 B를 지난다', () => {
    // A: {A,B,C} / B: {전체} / C: {전체} / D: {B,C,D}
    const g = graphOf(4, [[0, 1, 1, 10], [1, 2, 1, 10], [2, 3, 1, 10]])
    const m = computeSyntax(g, { metricWeight: 0, radius: 25 })
    expect(m.map((x) => x.nc)).toEqual([3, 4, 4, 3])
    expect(m[1].td).toBeCloseTo(1 + 1 + 2)
    expect(m[1].ch).toBeCloseTo(2) // A→C, C→A (B 출발은 중간 통과가 아님)
    expect(m[1].nach).toBeCloseTo(Math.log(3) / Math.log(7))
  })

  it('한 방향 링크(에스컬레이터 상행 전용)는 비대칭이다', () => {
    const g = makeGraph([node(0), node(1)], [{ from: 0, to: 1, angular: 1, metric: 5, kind: 'escalator' }])
    const m = computeSyntax(g, PURE)
    expect(m[0].nc).toBe(2); expect(m[0].td).toBeCloseTo(1)
    expect(m[1].nc).toBe(1); expect(m[1].td).toBeCloseTo(0)
  })

  it('거리 가중치(metricWeight)가 비용에 더해진다', () => {
    const g = graphOf(2, [[0, 1, 1, 10]])
    const d = shortestCosts(g, 0, (l) => linkCost(l, 0.01))
    expect(d[1]).toBeCloseTo(1 + 0.01 * 10)
  })

  it('도달할 수 없는 노드는 Infinity, 지표에는 포함되지 않는다', () => {
    const g = makeGraph([node(0), node(1), node(2)], [
      { from: 0, to: 1, angular: 1, metric: 1, kind: 'walk' },
      { from: 1, to: 0, angular: 1, metric: 1, kind: 'walk' },
    ])
    expect(shortestCosts(g, 0, (l) => l.angular)[2]).toBe(Infinity)
    expect(computeSyntax(g, PURE)[0].nc).toBe(2)
  })
})

// ---- 복도 → 세그먼트 그래프 ----
const proj = (corridors: { id: string; points: Vec2[] }[], max = 100): Project => {
  const p = createSampleProject()
  p.settings.analysis.maxSegmentM = max
  return { ...p, floors: [p.floors[1]], corridors: corridors.map((c) => ({ ...c, floorId: '1F' })), units: [], unitDoors: [], verticals: [], entrances: [] }
}

describe('세그먼트 그래프', () => {
  it('ㄱ자 복도: 직각으로 꺾이면 각도 비용 1', () => {
    const g = buildHorizontalGraph(proj([{ id: 'c', points: [[0, 0], [10, 0], [10, 10]] }]))
    expect(g.nodes).toHaveLength(2)
    expect(g.links).toHaveLength(2)
    for (const l of g.links) expect(l.angular).toBeCloseTo(1)
  })

  it('유턴(180도)은 2, 45도 꺾임은 0.5', () => {
    const u = buildHorizontalGraph(proj([{ id: 'c', points: [[0, 0], [10, 0], [0, 0.0001]] }]))
    expect(u.links[0].angular).toBeCloseTo(2, 1)
    const d = buildHorizontalGraph(proj([{ id: 'c', points: [[0, 0], [10, 0], [20, 10]] }]))
    expect(d.links[0].angular).toBeCloseTo(0.5, 1)
  })

  it('일직선 복도를 최대 길이로 쪼개면 같은 방향 이음매는 비용 0', () => {
    const g = buildHorizontalGraph(proj([{ id: 'c', points: [[0, 0], [30, 0]] }], 10))
    expect(g.nodes).toHaveLength(3)
    for (const l of g.links) expect(l.angular).toBeCloseTo(0)
    expect(g.nodes.every((n) => Math.abs(n.length - 10) < 1e-9)).toBe(true)
  })

  it('T자 교차: 가로 복도가 둘로 쪼개지고 세로 복도 끝과 이어진다', () => {
    const g = buildHorizontalGraph(proj([
      { id: 'h', points: [[0, 0], [20, 0]] },
      { id: 'v', points: [[10, 10], [10, 0]] },
    ]))
    expect(g.nodes).toHaveLength(3)
    const v = g.nodes.find((n) => n.corridorId === 'v')!
    const toH = g.links.filter((l) => l.from === v.id)
    expect(toH).toHaveLength(2)
    for (const l of toH) expect(l.angular).toBeCloseTo(1)
    // 가로 두 조각 사이 직진은 0
    const hs = g.nodes.filter((n) => n.corridorId === 'h')
    expect(g.links.find((l) => l.from === hs[0].id && l.to === hs[1].id)!.angular).toBeCloseTo(0)
  })

  it('십자 교차(X): 4개 세그먼트', () => {
    const pieces = splitCorridors([
      { id: 'h', points: [[0, 5], [10, 5]] },
      { id: 'v', points: [[5, 0], [5, 10]] },
    ], 100)
    expect(pieces).toHaveLength(4)
  })
})

// ---- 수직 연결 링크 ----
function threeFloor(vertical: Project['verticals'][number]): Project {
  const base = createSampleProject()
  const floors = base.floors.slice(1) // 1F, 2F, 3F (level 0,1,2)
  return {
    ...base, floors, units: [], unitDoors: [], entrances: [],
    corridors: floors.map((f) => ({ id: `c-${f.id}`, floorId: f.id, points: [[0, 0], [40, 0]] as Vec2[] })),
    verticals: [vertical],
  }
}
const pts = (ids: string[], p: Vec2 = [20, 0]) => ids.map((floorId) => ({ floorId, point: p }))
const vlinks = (p: Project) => buildGraph(p).links.filter((l) => l.kind !== 'walk')
const floorOfNode = (p: Project, id: number) => buildGraph(p).nodes[id].floorId

describe('수직 연결 링크 비용', () => {
  it('연속형 에스컬레이터: 한 층 1.0, 양방향, 보이드면 ×0.8', () => {
    const v = { id: 'e', type: 'escalator' as const, connects: pts(['1F', '2F', '3F']), escalator: { direction: 'both' as const, layout: 'continuous' as const } }
    const l = vlinks(threeFloor(v))
    expect(l).toHaveLength(4)
    for (const x of l) expect(x.angular).toBeCloseTo(1.0)
    const l2 = vlinks(threeFloor({ ...v, voidVisible: true }))
    for (const x of l2) expect(x.angular).toBeCloseTo(0.8)
  })

  it('에스컬레이터 방향 비대칭: 상행만이면 아래층으로 가는 링크가 없다, 상·하행 비용 따로', () => {
    const v = { id: 'e', type: 'escalator' as const, connects: pts(['1F', '2F']), escalator: { direction: 'up' as const, layout: 'continuous' as const } }
    const p = threeFloor(v)
    const l = vlinks(p)
    expect(l).toHaveLength(1)
    expect(floorOfNode(p, l[0].from)).toBe('1F')
    expect(floorOfNode(p, l[0].to)).toBe('2F')

    const both = threeFloor({ ...v, escalator: { direction: 'both', layout: 'continuous' } })
    both.settings.vertical.escalatorUp = 1.0
    both.settings.vertical.escalatorDown = 0.6
    const gl = buildGraph(both)
    const up = gl.links.find((x) => x.kind === 'escalator' && gl.nodes[x.from].floorId === '1F')!
    const down = gl.links.find((x) => x.kind === 'escalator' && gl.nodes[x.from].floorId === '2F')!
    expect(up.angular).toBeCloseTo(1.0)
    expect(down.angular).toBeCloseTo(0.6)
  })

  it('분절형: 층마다 +0.5, 도착 지점이 어긋나 그 층 복도를 걸어야 한다', () => {
    const v = { id: 'e', type: 'escalator' as const, connects: pts(['1F', '2F']), escalator: { direction: 'up' as const, layout: 'scissor' as const } }
    const p = threeFloor(v)
    p.settings.analysis.maxSegmentM = 8
    const g = buildGraph(p)
    const l = g.links.find((x) => x.kind === 'escalator')!
    expect(l.angular).toBeCloseTo(1.5)
    const fromMid = g.nodes[l.from].mid
    const toMid = g.nodes[l.to].mid
    expect(Math.abs(fromMid[0] - toMid[0])).toBeGreaterThan(5) // 위층 도착점은 출발 x와 다른 세그먼트
    // 연속형이면 같은 위치
    const c = buildGraph(threeFloor({ ...v, escalator: { direction: 'up', layout: 'continuous' } }))
    const lc = c.links.find((x) => x.kind === 'escalator')!
    expect(c.nodes[lc.to].mid[0]).toBeCloseTo(c.nodes[lc.from].mid[0])
  })

  it('스킵형: skippedFloors에는 링크가 없고 건너뛴 층 사이 비용은 층수만큼', () => {
    const v = { id: 'e', type: 'escalator' as const, connects: pts(['1F', '2F', '3F']), escalator: { direction: 'up' as const, layout: 'skip' as const, skippedFloors: ['2F'] } }
    const p = threeFloor(v)
    const g = buildGraph(p)
    const l = g.links.filter((x) => x.kind === 'escalator')
    expect(l).toHaveLength(1)
    expect(g.nodes[l[0].from].floorId).toBe('1F')
    expect(g.nodes[l[0].to].floorId).toBe('3F')
    expect(l[0].angular).toBeCloseTo(2.0)
  })

  it('엘리베이터: 1.5 + 대기 25초×0.02 = 2.0, 두 층 차이는 +0.1', () => {
    const v = { id: 'v', type: 'elevator' as const, connects: pts(['1F', '2F', '3F']), elevator: { avgWaitSec: 25 } }
    const p = threeFloor(v)
    const g = buildGraph(p)
    const cost = (a: string, b: string) => g.links.find((l) => g.nodes[l.from].floorId === a && g.nodes[l.to].floorId === b)!.angular
    expect(cost('1F', '2F')).toBeCloseTo(2.0)
    expect(cost('3F', '2F')).toBeCloseTo(2.0)
    expect(cost('1F', '3F')).toBeCloseTo(2.1)
  })

  it('계단: 한 층 2.5, 세 층 연속이면 층수^1.5로 급증', () => {
    const one = vlinks(threeFloor({ id: 's', type: 'stairs', connects: pts(['1F', '2F']) }))
    expect(one[0].angular).toBeCloseTo(2.5)
    const base = createSampleProject()
    const four = {
      ...threeFloor({ id: 's', type: 'stairs', connects: pts(['1F', '3F']) }),
      floors: [base.floors[1], base.floors[3]], // 1F(level 0), 3F(level 2): 두 층 차이
      corridors: [
        { id: 'c1', floorId: '1F', points: [[0, 0], [40, 0]] as Vec2[] },
        { id: 'c3', floorId: '3F', points: [[0, 0], [40, 0]] as Vec2[] },
      ],
    }
    const l = vlinks(four)
    expect(l[0].angular).toBeCloseTo(2.5 * Math.pow(2, 1.5))
    expect(2.5 * Math.pow(3, 1.5)).toBeGreaterThan(3 * 2.5 * 1.5) // 3층 차이는 선형보다 훨씬 크다
  })

  it('복도에서 너무 먼 수직동선은 연결하지 않고 경고한다', () => {
    const p = threeFloor({ id: 'e', name: '먼 에스컬', type: 'escalator', connects: pts(['1F', '2F'], [20, 50]), escalator: { direction: 'both', layout: 'continuous' } })
    const g = buildGraph(p)
    expect(g.links.filter((l) => l.kind !== 'walk')).toHaveLength(0)
    expect(g.warnings.some((w) => w.includes('먼 에스컬'))).toBe(true)
  })

  it('모든 링크는 metricLength를 가진다', () => {
    const g = buildGraph(createSampleProject())
    expect(g.links.every((l) => Number.isFinite(l.metric) && l.metric >= 0)).toBe(true)
  })
})

describe('가시성(아이소비스트)', () => {
  it('장애물 없는 10×10 구역에서 바닥 중앙 문의 반원 시야는 약 100㎡ (위쪽 전체)', () => {
    const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 }
    const a = isovistArea([5, 0], [0, 1], [], bounds, 720, 100)
    expect(a).toBeGreaterThan(95)
    expect(a).toBeLessThanOrEqual(100.5)
  })
  it('장애물이 시야를 가리면 면적이 줄어든다', () => {
    const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 }
    const open = isovistArea([5, 0], [0, 1], [], bounds, 360, 100)
    const wall = isovistArea([5, 0], [0, 1], [{ a: [2, 3], b: [8, 3] }], bounds, 360, 100)
    expect(wall).toBeLessThan(open)
  })
})

describe('샘플 프로젝트 통합 분석', () => {
  const p = createSampleProject()
  const r = analyze(p)

  it('모든 호실이 복도에 붙고 모든 호실에 깊이가 계산된다', () => {
    expect(r.units).toHaveLength(p.units.length)
    expect(r.units.every((u) => u.nodeId !== null)).toBe(true)
    expect(r.units.every((u) => u.entranceDepth !== null)).toBe(true)
    expect(r.warnings).toEqual([])
  })

  it('주출입구가 있는 1층이 3층보다 출입구 깊이가 작다', () => {
    const avg = (f: string) => {
      const us = r.units.filter((u) => u.floorId === f)
      return us.reduce((s, u) => s + (u.entranceDepth ?? 0), 0) / us.length
    }
    expect(avg('1F')).toBeLessThan(avg('2F'))
    expect(avg('2F')).toBeLessThan(avg('3F'))
  })

  it('같은 입력이면 항상 같은 결과다', () => {
    expect(analyze(p).units).toEqual(r.units)
  })

  it('에스컬레이터 위치를 옮기면 상층부 출입구 깊이가 달라진다', () => {
    const moved = JSON.parse(JSON.stringify(p)) as Project
    const esc = moved.verticals.find((v) => v.id === 'esc-atrium')!
    esc.connects = esc.connects.map((c) => ({ ...c, point: [74, 20] as Vec2 }))
    const r2 = analyze(moved)
    const d1 = r.units.filter((u) => u.floorId === '3F').map((u) => u.entranceDepth)
    const d2 = r2.units.filter((u) => u.floorId === '3F').map((u) => u.entranceDepth)
    expect(d2).not.toEqual(d1)
  })

  it('가시성은 모든 호실에서 0보다 크다', () => {
    expect(r.units.every((u) => u.visibility > 0)).toBe(true)
  })
})

describe('설정 기본값', () => {
  it('분석 설정 기본값이 있다', () => {
    expect(defaultSettings().analysis.maxSegmentM).toBeGreaterThan(0)
  })
})
