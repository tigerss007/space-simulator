import type { Graph, Link } from './graph'

// ===== 스페이스 신텍스 지표 (docs/SPEC.md 4-3) =====
// 링크 비용 = 각도 비용 + metricWeight × 거리(m). metricWeight=0이면 순수 각도 비용.
// 정의:
//  - TD  : 출발 노드에서 도달 가능한 모든 노드까지의 최단 비용 합 (자기 자신은 0)
//  - NC  : 도달 가능한 노드 수 (자기 자신 포함)
//  - NAIN = NC^1.2 / (TD + 2)
//  - CH  : 모든 (출발, 도착) 순서쌍의 최단경로가 이 노드를 "중간에" 지나가는 횟수.
//          최단경로가 여럿이면 균등 분배(Brandes). 경로 양방향을 각각 센다.
//  - NACH = log(CH + 1) / log(TD + 3)

const EPS = 1e-9
export const linkCost = (l: Link, metricWeight: number) => l.angular + metricWeight * l.metric

class MinHeap {
  private k: number[] = []
  private v: number[] = []
  get size() { return this.k.length }
  push(key: number, val: number) {
    const k = this.k, v = this.v
    let i = k.length
    k.push(key); v.push(val)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (k[p] <= key) break
      k[i] = k[p]; v[i] = v[p]; i = p
    }
    k[i] = key; v[i] = val
  }
  pop(): [number, number] {
    const k = this.k, v = this.v
    const topK = k[0], topV = v[0]
    const lastK = k.pop()!, lastV = v.pop()!
    const n = k.length
    if (n > 0) {
      let i = 0
      for (;;) {
        let c = 2 * i + 1
        if (c >= n) break
        if (c + 1 < n && k[c + 1] < k[c]) c++
        if (k[c] >= lastK) break
        k[i] = k[c]; v[i] = v[c]; i = c
      }
      k[i] = lastK; v[i] = lastV
    }
    return [topK, topV]
  }
}

// 출발 노드 s에서 모든 노드까지의 최단 비용 (도달 불가 = Infinity)
export function shortestCosts(
  g: Graph, s: number, cost: (l: Link) => number, inBall?: Uint8Array | null,
): Float64Array {
  const dist = new Float64Array(g.nodes.length).fill(Infinity)
  const done = new Uint8Array(g.nodes.length)
  const heap = new MinHeap()
  dist[s] = 0
  heap.push(0, s)
  while (heap.size) {
    const [d, v] = heap.pop()
    if (done[v]) continue
    done[v] = 1
    for (const l of g.adj[v]) {
      const w = l.to
      if (done[w] || (inBall && !inBall[w])) continue
      const nd = d + cost(l)
      if (nd < dist[w]) { dist[w] = nd; heap.push(nd, w) }
    }
  }
  return dist
}

// 실제 이동 거리가 radius 이하인 노드 집합 (반경 분석용)
export function metricBall(g: Graph, s: number, radius: number): Uint8Array {
  const d = shortestCosts(g, s, (l) => l.metric)
  const ball = new Uint8Array(g.nodes.length)
  for (let i = 0; i < d.length; i++) if (d[i] <= radius + EPS) ball[i] = 1
  return ball
}

export interface NodeSyntax {
  td: number
  nc: number
  nain: number
  ch: number
  nach: number
}

// radius: null = 각도 반경 n(전체), 숫자 = metric 반경(m)
export function computeSyntax(
  g: Graph, opts: { metricWeight: number; radius: number | null },
): NodeSyntax[] {
  const n = g.nodes.length
  const cost = (l: Link) => linkCost(l, opts.metricWeight)
  const td = new Float64Array(n)
  const nc = new Float64Array(n)
  const ch = new Float64Array(n)

  const dist = new Float64Array(n)
  const sigma = new Float64Array(n)
  const delta = new Float64Array(n)
  const done = new Uint8Array(n)
  const preds: number[][] = Array.from({ length: n }, () => [])

  for (let s = 0; s < n; s++) {
    const ball = opts.radius === null ? null : metricBall(g, s, opts.radius)
    dist.fill(Infinity); sigma.fill(0); delta.fill(0); done.fill(0)
    for (const p of preds) p.length = 0
    dist[s] = 0; sigma[s] = 1
    const heap = new MinHeap()
    heap.push(0, s)
    const order: number[] = []
    while (heap.size) {
      const [d, v] = heap.pop()
      if (done[v]) continue
      done[v] = 1
      order.push(v)
      for (const l of g.adj[v]) {
        const w = l.to
        if (done[w] || (ball && !ball[w])) continue
        const nd = d + cost(l)
        if (nd < dist[w] - EPS) { dist[w] = nd; sigma[w] = sigma[v]; preds[w] = [v]; heap.push(nd, w) }
        else if (Math.abs(nd - dist[w]) <= EPS) { sigma[w] += sigma[v]; preds[w].push(v) }
      }
    }
    let sum = 0
    for (const v of order) sum += dist[v]
    td[s] = sum
    nc[s] = order.length
    for (let i = order.length - 1; i >= 0; i--) {
      const w = order[i]
      for (const v of preds[w]) delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w])
      if (w !== s) ch[w] += delta[w]
    }
  }

  return Array.from({ length: n }, (_, i) => ({
    td: td[i],
    nc: nc[i],
    nain: Math.pow(nc[i], 1.2) / (td[i] + 2),
    ch: ch[i],
    nach: Math.log(ch[i] + 1) / Math.log(td[i] + 3),
  }))
}
