import type { Vec2 } from '../model/types'

export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]
export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]]
export const scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k]
export const len = (a: Vec2) => Math.hypot(a[0], a[1])
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1])
export const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0]
export const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1]
export const norm = (a: Vec2): Vec2 => {
  const l = len(a)
  return l < 1e-12 ? [0, 0] : [a[0] / l, a[1] / l]
}

// 두 진행 방향 사이의 꺾임 각도(도). 직진 0, 직각 90, 유턴 180.
export function turnAngleDeg(from: Vec2, to: Vec2): number {
  const a = norm(from)
  const b = norm(to)
  return (Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * 180) / Math.PI
}

// 점 p에서 선분 ab까지의 최근접점과 거리
export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; dist: number; t: number } {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2))
  const point = add(a, scale(ab, t))
  return { point, dist: dist(p, point), t }
}

// 선분 p→p+r 과 q→q+s 의 교차 매개변수 (t: 첫 선분, u: 둘째 선분). 평행이면 null.
export function lineParams(p: Vec2, r: Vec2, q: Vec2, s: Vec2): { t: number; u: number } | null {
  const rxs = cross(r, s)
  if (Math.abs(rxs) < 1e-12) return null
  const qp = sub(q, p)
  return { t: cross(qp, s) / rxs, u: cross(qp, r) / rxs }
}
