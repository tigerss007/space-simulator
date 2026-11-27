import type { Vec2 } from '../model/types'
import { add, closestOnSegment, cross, norm, scale, sub } from './geom'

// ===== 가시성 (간이 아이소비스트) =====
// 호실 문 지점에서 복도 쪽 반원으로 광선을 쏴서, 벽(다른 호실 변)이나 층 경계에 막히는 지점까지의
// 다각형 면적(㎡)을 구한다. 값이 클수록 문 앞에서 멀리·넓게 보인다.

export interface Edge { a: Vec2; b: Vec2 }
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

const boundsEdges = (b: Bounds): Edge[] => [
  { a: [b.minX, b.minY], b: [b.maxX, b.minY] },
  { a: [b.maxX, b.minY], b: [b.maxX, b.maxY] },
  { a: [b.maxX, b.maxY], b: [b.minX, b.maxY] },
  { a: [b.minX, b.maxY], b: [b.minX, b.minY] },
]

// 광선 origin + t·dir 이 선분과 만나는 최소 t (없으면 Infinity)
function rayHit(origin: Vec2, dir: Vec2, e: Edge): number {
  const s = sub(e.b, e.a)
  const rxs = cross(dir, s)
  if (Math.abs(rxs) < 1e-12) return Infinity
  const qp = sub(e.a, origin)
  const t = cross(qp, s) / rxs
  const u = cross(qp, dir) / rxs
  return t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9 ? t : Infinity
}

// 호실 다각형에서 문과 가장 가까운 변의 바깥쪽 법선
export function outwardNormal(polygon: Vec2[], door: Vec2): Vec2 {
  const c: Vec2 = [
    polygon.reduce((s, p) => s + p[0], 0) / polygon.length,
    polygon.reduce((s, p) => s + p[1], 0) / polygon.length,
  ]
  let best = { d: Infinity, n: [0, 1] as Vec2 }
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length]
    const d = closestOnSegment(door, a, b).dist
    if (d < best.d) {
      const e = norm(sub(b, a))
      let n: Vec2 = [-e[1], e[0]]
      if ((c[0] - a[0]) * n[0] + (c[1] - a[1]) * n[1] > 0) n = scale(n, -1)
      best = { d, n }
    }
  }
  return best.n
}

export function isovistArea(
  origin: Vec2, normal: Vec2, obstacles: Edge[], bounds: Bounds, rays: number, range: number,
): number {
  const walls = [...obstacles, ...boundsEdges(bounds)]
  const o = add(origin, scale(normal, 0.05)) // 자기 벽면에 걸리지 않게 살짝 띄운다
  const base = Math.atan2(normal[1], normal[0])
  const pts: Vec2[] = [o]
  for (let i = 0; i <= rays; i++) {
    const ang = base - Math.PI / 2 + (Math.PI * i) / rays
    const dir: Vec2 = [Math.cos(ang), Math.sin(ang)]
    let t = range
    for (const w of walls) t = Math.min(t, rayHit(o, dir, w))
    pts.push(add(o, scale(dir, t)))
  }
  let area = 0
  for (let i = 1; i + 1 < pts.length; i++) area += Math.abs(cross(sub(pts[i], pts[0]), sub(pts[i + 1], pts[0]))) / 2
  return area
}

export const polygonEdges = (poly: Vec2[]): Edge[] => poly.map((p, i) => ({ a: p, b: poly[(i + 1) % poly.length] }))
