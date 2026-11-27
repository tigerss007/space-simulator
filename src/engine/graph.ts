import type { Floor, Project, Vec2, Vertical } from '../model/types'
import { add, closestOnSegment, dist, lineParams, norm, scale, sub, turnAngleDeg, len } from './geom'

// ===== 세그먼트 그래프 (docs/SPEC.md 4-1, 4-2) =====
// 노드 = 복도 세그먼트, 링크 = 맞닿은 세그먼트(각도 비용) 또는 수직 연결(환산 비용).

export interface SegNode {
  id: number
  floorId: string
  corridorId: string
  a: Vec2
  b: Vec2
  length: number
  mid: Vec2
}

export type LinkKind = 'walk' | 'escalator' | 'elevator' | 'stairs' | 'ramp' | 'bridge'

export interface Link {
  from: number
  to: number
  angular: number // 각도 비용(수직 링크는 환산값)
  metric: number // 실제 이동 거리(m). 반경 분석과 거리 가중에 사용
  kind: LinkKind
  verticalId?: string
}

export interface Graph {
  nodes: SegNode[]
  links: Link[]
  adj: Link[][]
  warnings: string[]
}

const keyOf = (p: Vec2) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`

interface Piece {
  corridorId: string
  a: Vec2
  b: Vec2
}

// 한 층의 복도들을 교차점·꺾이는 점에서 끊고, maxLen보다 길면 같은 길이로 더 쪼갠다.
export function splitCorridors(
  corridors: { id: string; points: Vec2[] }[],
  maxLen: number,
): Piece[] {
  const raws: Piece[] = []
  for (const c of corridors)
    for (let i = 0; i + 1 < c.points.length; i++) {
      if (dist(c.points[i], c.points[i + 1]) > 1e-9) raws.push({ corridorId: c.id, a: c.points[i], b: c.points[i + 1] })
    }
  const vertices = raws.flatMap((r) => [r.a, r.b])
  const snap = (p: Vec2): Vec2 => vertices.find((v) => dist(v, p) < 0.02) ?? p

  const pieces: Piece[] = []
  raws.forEach((S, si) => {
    const r = sub(S.b, S.a)
    const L = len(r)
    const tTol = 0.01 / L
    const cuts: number[] = []
    raws.forEach((T, ti) => {
      if (si === ti) return
      const s = sub(T.b, T.a)
      const hit = lineParams(S.a, r, T.a, s)
      if (!hit) return
      const uTol = 0.01 / len(s)
      if (hit.t > tTol && hit.t < 1 - tTol && hit.u >= -uTol && hit.u <= 1 + uTol) cuts.push(hit.t)
    })
    cuts.sort((x, y) => x - y)
    const pts: Vec2[] = [S.a]
    for (const t of cuts) {
      const p = snap(add(S.a, scale(r, t)))
      if (dist(p, pts[pts.length - 1]) > 0.02) pts.push(p)
    }
    if (dist(S.b, pts[pts.length - 1]) > 0.02) pts.push(S.b)
    else pts[pts.length - 1] = S.b

    for (let i = 0; i + 1 < pts.length; i++) {
      const n = Math.max(1, Math.ceil(dist(pts[i], pts[i + 1]) / maxLen - 1e-9))
      let prev = pts[i]
      for (let k = 1; k <= n; k++) {
        const next = k === n ? pts[i + 1] : add(pts[i], scale(sub(pts[i + 1], pts[i]), k / n))
        pieces.push({ corridorId: S.corridorId, a: prev, b: next })
        prev = next
      }
    }
  })
  return pieces
}

export function makeGraph(nodes: SegNode[], links: Link[], warnings: string[] = []): Graph {
  const adj: Link[][] = nodes.map(() => [])
  for (const l of links) adj[l.from].push(l)
  return { nodes, links, adj, warnings }
}

// 수평(층 안) 그래프: 세그먼트 노드와 맞닿은 세그먼트 사이의 각도 비용 링크
export function buildHorizontalGraph(project: Project): Graph {
  const maxLen = Math.max(1, project.settings.analysis.maxSegmentM)
  const nodes: SegNode[] = []
  for (const floor of project.floors) {
    const cors = project.corridors.filter((c) => c.floorId === floor.id)
    for (const p of splitCorridors(cors, maxLen)) {
      nodes.push({
        id: nodes.length, floorId: floor.id, corridorId: p.corridorId, a: p.a, b: p.b,
        length: dist(p.a, p.b), mid: scale(add(p.a, p.b), 0.5),
      })
    }
  }
  const groups = new Map<string, { id: number; end: 'a' | 'b' }[]>()
  for (const n of nodes) {
    for (const end of ['a', 'b'] as const) {
      const k = `${n.floorId}|${keyOf(n[end])}`
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push({ id: n.id, end })
    }
  }
  const links: Link[] = []
  for (const g of groups.values()) {
    for (const x of g) for (const y of g) {
      if (x.id === y.id) continue
      const n = nodes[x.id]
      const m = nodes[y.id]
      // x 세그먼트로 접합점에 들어와서(진행 방향) y 세그먼트로 나가는(진행 방향) 꺾임
      const into = x.end === 'b' ? sub(n.b, n.a) : sub(n.a, n.b)
      const out = y.end === 'a' ? sub(m.b, m.a) : sub(m.a, m.b)
      links.push({
        from: x.id, to: y.id, kind: 'walk',
        angular: turnAngleDeg(into, out) / 90,
        metric: (n.length + m.length) / 2,
      })
    }
  }
  return makeGraph(nodes, links)
}

// 층 위의 점에서 가장 가까운 세그먼트 (corridorId가 있으면 그 복도를 우선)
export function nearestNode(
  g: Graph, floorId: string, p: Vec2, corridorId?: string,
): { id: number; dist: number; point: Vec2 } | null {
  const pick = (filter: (n: SegNode) => boolean) => {
    let best: { id: number; dist: number; point: Vec2 } | null = null
    for (const n of g.nodes) {
      if (n.floorId !== floorId || !filter(n)) continue
      const c = closestOnSegment(p, n.a, n.b)
      if (!best || c.dist < best.dist - 1e-9) best = { id: n.id, dist: c.dist, point: c.point }
    }
    return best
  }
  return (corridorId ? pick((n) => n.corridorId === corridorId) : null) ?? pick(() => true)
}

// ---- 수직 연결 ----
const lvl = (f: Floor) => f.level

// 수직 이동의 실제 이동 거리(m) 근사: 에스컬레이터는 경사 30°, 계단은 약 1.8배, 경사로 1:10
function travelLength(type: Vertical['type'], dz: number, horiz: number): number {
  switch (type) {
    case 'escalator': return 2 * dz + horiz
    case 'elevator': return dz + horiz
    case 'stairs': return 1.8 * dz + horiz
    case 'ramp': return 10 * dz + horiz
    default: return horiz
  }
}

export function addVerticalLinks(g: Graph, project: Project): void {
  const V = project.settings.vertical
  const tol = project.settings.analysis.attachToleranceM
  const floorOf = new Map(project.floors.map((f) => [f.id, f]))
  const nameOf = (v: Vertical) => v.name ?? v.id

  for (const v of project.verticals) {
    let stops = v.connects
      .filter((c) => floorOf.has(c.floorId))
      .sort((a, b) => lvl(floorOf.get(a.floorId)!) - lvl(floorOf.get(b.floorId)!))
    if (v.type === 'escalator' && v.escalator?.layout === 'skip') {
      const skip = new Set(v.escalator.skippedFloors ?? [])
      stops = stops.filter((c) => !skip.has(c.floorId))
    }
    // 각 정차 층에서 복도에 붙이기
    const att = stops.map((c) => ({ ...c, floor: floorOf.get(c.floorId)!, node: nearestNode(g, c.floorId, c.point) }))
    const ok = att.filter((a) => {
      if (a.node && a.node.dist <= tol) return true
      g.warnings.push(`수직동선 '${nameOf(v)}'의 ${a.floor.name} 연결점이 복도에서 ${tol}m 넘게 떨어져 있어 연결되지 않았습니다.`)
      return false
    })

    const push = (
      from: number, to: number, angular: number, ptA: Vec2, ptB: Vec2, fa: Floor, fb: Floor,
      kind: LinkKind,
    ) => {
      const dz = Math.abs(fb.elevation - fa.elevation)
      const metric =
        dist(g.nodes[from].mid, ptA) + dist(g.nodes[to].mid, ptB) + travelLength(v.type, dz, dist(ptA, ptB))
      g.links.push({ from, to, angular, metric, kind, verticalId: v.id })
    }

    if (v.type === 'elevator') {
      const wait = (v.elevator?.avgWaitSec ?? 30) * V.elevatorWaitFactor
      for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) {
        const dl = Math.abs(lvl(ok[j].floor) - lvl(ok[i].floor))
        const cost = V.elevatorBase + wait + V.elevatorPerFloor * Math.max(0, dl - 1)
        push(ok[i].node!.id, ok[j].node!.id, cost, ok[i].point, ok[j].point, ok[i].floor, ok[j].floor, 'elevator')
        push(ok[j].node!.id, ok[i].node!.id, cost, ok[j].point, ok[i].point, ok[j].floor, ok[i].floor, 'elevator')
      }
      continue
    }

    for (let i = 0; i + 1 < ok.length; i++) {
      const lo = ok[i]
      const hi = ok[i + 1]
      const dl = Math.abs(lvl(hi.floor) - lvl(lo.floor))
      const both = (cost: number, kind: LinkKind) => {
        push(lo.node!.id, hi.node!.id, cost, lo.point, hi.point, lo.floor, hi.floor, kind)
        push(hi.node!.id, lo.node!.id, cost, hi.point, lo.point, hi.floor, lo.floor, kind)
      }
      if (v.type === 'escalator') {
        const dir = v.escalator?.direction ?? 'both'
        const layout = v.escalator?.layout ?? 'continuous'
        const f = v.voidVisible ? V.voidVisibleFactor : 1 // 위층이 보이면 올라갈 동기가 생기는 효과
        const transfer = layout === 'scissor' ? V.scissorTransfer : 0
        const up = V.escalatorUp * dl * f + transfer
        const down = V.escalatorDown * dl * f + transfer
        // 분절형: 도착한 지점에서 다음 출발 지점까지 복도를 걸어야 하므로, 도착 지점을 어긋나게 둔다.
        const arrive = (node: typeof lo.node, pt: Vec2): { id: number; pt: Vec2 } => {
          if (layout !== 'scissor' || !node) return { id: node!.id, pt }
          const seg = g.nodes[node.id]
          const d = norm(sub(seg.b, seg.a))
          for (const sign of [1, -1]) {
            const shifted = add(pt, scale(d, sign * V.scissorOffsetM))
            const n = nearestNode(g, seg.floorId, shifted)
            if (n && n.dist < 0.5) return { id: n.id, pt: shifted }
          }
          return { id: node.id, pt }
        }
        if (dir === 'up' || dir === 'both') {
          const to = arrive(hi.node, hi.point)
          push(lo.node!.id, to.id, up, lo.point, to.pt, lo.floor, hi.floor, 'escalator')
        }
        if (dir === 'down' || dir === 'both') {
          const to = arrive(lo.node, lo.point)
          push(hi.node!.id, to.id, down, hi.point, to.pt, hi.floor, lo.floor, 'escalator')
        }
      } else if (v.type === 'stairs') {
        both(V.stairsPerFloor * Math.pow(dl, V.stairsExponent), 'stairs')
      } else if (v.type === 'ramp') {
        both(V.rampPerFloor * dl, 'ramp')
      } else {
        both(0, 'bridge') // 외부 데크·브릿지는 수평 세그먼트처럼 취급
      }
    }
  }
  g.adj = g.nodes.map(() => [])
  for (const l of g.links) g.adj[l.from].push(l)
}

export function buildGraph(project: Project): Graph {
  const g = buildHorizontalGraph(project)
  addVerticalLinks(g, project)
  return g
}
