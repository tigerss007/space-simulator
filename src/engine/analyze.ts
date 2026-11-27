import type { Project, Vec2 } from '../model/types'
import { buildGraph, nearestNode } from './graph'
import { computeSyntax, linkCost, shortestCosts, type NodeSyntax } from './syntax'
import { isovistArea, outwardNormal, polygonEdges, type Bounds, type Edge } from './visibility'

export interface NodeResult {
  id: number
  floorId: string
  a: Vec2
  b: Vec2
  mid: Vec2
  length: number
  depth: number | null // 주출입구에서 이 세그먼트까지의 최소 3D 비용
  metrics: Record<string, NodeSyntax> // 키: 'n'(각도 전체) 또는 metric 반경(m) 문자열
}

export interface UnitResult {
  unitId: string
  floorId: string
  nodeId: number | null
  doorMissing: boolean
  entranceDepth: number | null
  visibility: number // ㎡
  metrics: Record<string, { nain: number; nach: number }>
}

export interface AnalysisResult {
  radiusKeys: string[]
  nodes: NodeResult[]
  units: UnitResult[]
  warnings: string[]
  stats: { nodes: number; links: number; verticalLinks: number; ms: number }
}

export function analyze(project: Project): AnalysisResult {
  const t0 = Date.now()
  const g = buildGraph(project)
  const S = project.settings
  const w = S.analysis.metricWeight
  const warnings = [...g.warnings]

  // 반경별 지표
  const radii: (number | null)[] = [null, ...S.radii.metric]
  const radiusKeys = radii.map((r) => (r === null ? 'n' : String(r)))
  const syntax = radii.map((r) => computeSyntax(g, { metricWeight: w, radius: r }))

  // 출입구 깊이: 주출입구(없으면 모든 출입구)에서의 최소 비용
  let mains = project.entrances.filter((e) => e.type === '주출입구')
  if (!mains.length) mains = project.entrances
  const depth = new Float64Array(g.nodes.length).fill(Infinity)
  for (const e of mains) {
    const at = nearestNode(g, e.floorId, e.point)
    if (!at || at.dist > S.analysis.attachToleranceM) {
      warnings.push(`출입구 '${e.name}'가 복도에서 ${S.analysis.attachToleranceM}m 넘게 떨어져 있어 깊이 계산에서 제외했습니다.`)
      continue
    }
    const d = shortestCosts(g, at.id, (l) => linkCost(l, w))
    for (let i = 0; i < d.length; i++) depth[i] = Math.min(depth[i], d[i])
  }
  const depthOrNull = (i: number) => (Number.isFinite(depth[i]) ? depth[i] : null)

  // 가시성 준비: 층별 경계와 장애물(호실 벽)
  const bounds = new Map<string, Bounds>()
  const walls = new Map<string, Edge[]>()
  for (const f of project.floors) {
    const pts: Vec2[] = [
      ...project.units.filter((u) => u.floorId === f.id).flatMap((u) => u.polygon),
      ...project.corridors.filter((c) => c.floorId === f.id).flatMap((c) => c.points),
    ]
    if (!pts.length) continue
    bounds.set(f.id, {
      minX: Math.min(...pts.map((p) => p[0])), maxX: Math.max(...pts.map((p) => p[0])),
      minY: Math.min(...pts.map((p) => p[1])), maxY: Math.max(...pts.map((p) => p[1])),
    })
    walls.set(f.id, project.units.filter((u) => u.floorId === f.id).flatMap((u) => polygonEdges(u.polygon)))
  }

  const units: UnitResult[] = project.units.map((u) => {
    const door = project.unitDoors.find((d) => d.unitId === u.id)
    let node: { id: number; dist: number } | null = null
    if (door) node = nearestNode(g, u.floorId, door.point, door.corridorId)
    if (node && node.dist > S.analysis.attachToleranceM) node = null
    if (!node) warnings.push(`호실 '${u.name}'이(가) 복도에 붙어 있지 않아 분석에서 제외했습니다.`)
    const b = bounds.get(u.floorId)
    const visibility =
      door && b
        ? isovistArea(door.point, outwardNormal(u.polygon, door.point), walls.get(u.floorId) ?? [], b,
            S.analysis.visibilityRays, S.analysis.visibilityRangeM)
        : 0
    const metrics: UnitResult['metrics'] = {}
    radiusKeys.forEach((k, ri) => {
      const m = node ? syntax[ri][node.id] : null
      metrics[k] = { nain: m?.nain ?? 0, nach: m?.nach ?? 0 }
    })
    return {
      unitId: u.id, floorId: u.floorId, nodeId: node?.id ?? null, doorMissing: !door || !node,
      entranceDepth: node ? depthOrNull(node.id) : null, visibility, metrics,
    }
  })

  const nodes: NodeResult[] = g.nodes.map((n) => ({
    id: n.id, floorId: n.floorId, a: n.a, b: n.b, mid: n.mid, length: n.length,
    depth: depthOrNull(n.id),
    metrics: Object.fromEntries(radiusKeys.map((k, ri) => [k, syntax[ri][n.id]])),
  }))

  return {
    radiusKeys, nodes, units, warnings,
    stats: {
      nodes: g.nodes.length, links: g.links.length,
      verticalLinks: g.links.filter((l) => l.kind !== 'walk').length, ms: Date.now() - t0,
    },
  }
}
