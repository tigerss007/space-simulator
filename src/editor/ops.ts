import type { Corridor, Entrance, EntranceType, Floor, Project, Unit, UnitDoor, Vec2, Vertical, VerticalType } from '../model/types'
import { defaultSettings, emptyExternal } from '../model/defaults'
import { closestOnSegment, dist } from '../engine/geom'

// ===== 편집 로직 (순수 함수). 모두 새 Project를 돌려주고 원본은 바꾸지 않는다. =====

let counter = 0
export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`

export function polygonArea(poly: Vec2[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return Math.abs(a) / 2
}

export const roundTo = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d
export const rectPolygon = (a: Vec2, b: Vec2): Vec2[] => {
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])]
  const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])]
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
}

// 점에서 다각형 경계까지의 최근접점
export function closestOnPolygon(p: Vec2, poly: Vec2[]): { point: Vec2; dist: number; edge: number } {
  let best = { point: poly[0], dist: Infinity, edge: 0 }
  for (let i = 0; i < poly.length; i++) {
    const c = closestOnSegment(p, poly[i], poly[(i + 1) % poly.length])
    if (c.dist < best.dist) best = { point: c.point, dist: c.dist, edge: i }
  }
  return best
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// 층의 복도 중 점에서 가장 가까운 복도
export function nearestCorridor(p: Vec2, corridors: Corridor[]): { corridor: Corridor; point: Vec2; dist: number } | null {
  let best: { corridor: Corridor; point: Vec2; dist: number } | null = null
  for (const c of corridors)
    for (let i = 0; i + 1 < c.points.length; i++) {
      const r = closestOnSegment(p, c.points[i], c.points[i + 1])
      if (!best || r.dist < best.dist) best = { corridor: c, point: r.point, dist: r.dist }
    }
  return best
}

// 자동 문: 복도에 가장 가까운 변의 중점
export function autoDoor(unit: Unit, corridors: Corridor[]): UnitDoor | null {
  let best: { d: number; point: Vec2; corridorId: string } | null = null
  const poly = unit.polygon
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const n = nearestCorridor(mid, corridors)
    if (n && (!best || n.dist < best.d - 1e-9)) best = { d: n.dist, point: mid, corridorId: n.corridor.id }
  }
  return best ? { unitId: unit.id, corridorId: best.corridorId, point: [roundTo(best.point[0]), roundTo(best.point[1])] } : null
}

// 편집 뒤 파생값을 맞춘다: 면적, 문(없으면 자동 배치·변이 어긋나면 경계로 되붙임), 전면 폭, 고아 데이터 정리
export function normalizeProject(p: Project): Project {
  const floorIds = new Set(p.floors.map((f) => f.id))
  const units = p.units.filter((u) => floorIds.has(u.floorId))
  const corridors = p.corridors.filter((c) => floorIds.has(c.floorId))
  const corById = new Map(corridors.map((c) => [c.id, c]))
  const unitById = new Map(units.map((u) => [u.id, u]))

  const doors: UnitDoor[] = []
  for (const d of p.unitDoors) {
    const u = unitById.get(d.unitId)
    const c = corById.get(d.corridorId)
    if (!u || !c || c.floorId !== u.floorId) continue
    const onEdge = closestOnPolygon(d.point, u.polygon)
    doors.push(onEdge.dist > 0.25 ? { ...d, point: [roundTo(onEdge.point[0]), roundTo(onEdge.point[1])] } : d)
  }
  const has = new Set(doors.map((d) => d.unitId))
  for (const u of units) {
    if (has.has(u.id)) continue
    const d = autoDoor(u, corridors.filter((c) => c.floorId === u.floorId))
    if (d) doors.push(d)
  }
  const doorOf = new Map(doors.map((d) => [d.unitId, d]))

  const fixed = units.map((u) => {
    const area = roundTo(polygonArea(u.polygon))
    const d = doorOf.get(u.id)
    let frontage = u.frontageWidth
    if (d) {
      const e = closestOnPolygon(d.point, u.polygon).edge
      frontage = roundTo(dist(u.polygon[e], u.polygon[(e + 1) % u.polygon.length]))
    }
    return area === u.area && frontage === u.frontageWidth ? u : { ...u, area, frontageWidth: frontage }
  })
  return { ...p, units: fixed, corridors, unitDoors: doors }
}

// ---- 프로젝트·층 ----
export function emptyProject(name: string): Project {
  const floor: Floor = { id: 'F1', name: '1F', level: 0, elevation: 0, height: 5 }
  return {
    meta: { name, site: '', createdAt: new Date().toISOString(), unit: 'm' },
    floors: [floor], units: [], corridors: [], unitDoors: [], entrances: [], verticals: [],
    external: emptyExternal(), settings: defaultSettings(), scenarios: [],
  }
}

const floorLabel = (level: number) => (level >= 0 ? `${level + 1}F` : `B${-level}`)

export function addFloor(p: Project, where: 'above' | 'below'): { project: Project; floor: Floor } {
  const sorted = [...p.floors].sort((a, b) => a.level - b.level)
  const ref = where === 'above' ? sorted[sorted.length - 1] : sorted[0]
  const level = ref ? (where === 'above' ? ref.level + 1 : ref.level - 1) : 0
  const height = ref?.height ?? 5
  const elevation = !ref ? 0 : where === 'above' ? ref.elevation + ref.height : ref.elevation - height
  let name = floorLabel(level)
  while (p.floors.some((f) => f.name === name)) name += "'"
  const floor: Floor = { id: uid('F'), name, level, elevation, height }
  return { project: { ...p, floors: [...p.floors, floor] }, floor }
}

export function updateFloor(p: Project, id: string, patch: Partial<Omit<Floor, 'id'>>): Project {
  return { ...p, floors: p.floors.map((f) => (f.id === id ? { ...f, ...patch } : f)) }
}

export function removeFloor(p: Project, id: string): Project {
  const { [id]: _removed, ...floorAdjust } = p.settings.floorAdjust
  void _removed
  return normalizeProject({
    ...p,
    floors: p.floors.filter((f) => f.id !== id),
    units: p.units.filter((u) => u.floorId !== id),
    corridors: p.corridors.filter((c) => c.floorId !== id),
    entrances: p.entrances.filter((e) => e.floorId !== id),
    verticals: p.verticals
      .map((v) => ({ ...v, connects: v.connects.filter((c) => c.floorId !== id) }))
      .filter((v) => v.connects.length > 0),
    settings: { ...p.settings, floorAdjust },
  })
}

export function clearFloorContent(p: Project, floorId: string): Project {
  const dropE = new Set(p.entrances.filter((e) => e.floorId === floorId).map((e) => e.id))
  return normalizeProject({
    ...p,
    units: p.units.filter((u) => u.floorId !== floorId),
    corridors: p.corridors.filter((c) => c.floorId !== floorId),
    entrances: p.entrances.filter((e) => e.floorId !== floorId),
    external: clearEntranceRefs(p.external, dropE),
  })
}

// 다른 층의 호실·복도·출입구를 이 층으로 복사 (수직동선은 복사하지 않는다)
export function copyFloorContent(p: Project, fromId: string, toId: string): Project {
  const base = clearFloorContent(p, toId)
  const cMap = new Map<string, string>()
  const corridors = p.corridors.filter((c) => c.floorId === fromId).map((c) => {
    const id = uid('cor'); cMap.set(c.id, id)
    return { ...c, id, floorId: toId, points: c.points.map((q) => [...q] as Vec2) }
  })
  const uMap = new Map<string, string>()
  const toName = p.floors.find((f) => f.id === toId)?.name ?? ''
  const fromName = p.floors.find((f) => f.id === fromId)?.name ?? ''
  const units = p.units.filter((u) => u.floorId === fromId).map((u) => {
    const id = uid('u'); uMap.set(u.id, id)
    return { ...u, id, floorId: toId, name: fromName && u.name.startsWith(fromName) ? toName + u.name.slice(fromName.length) : u.name, polygon: u.polygon.map((q) => [...q] as Vec2) }
  })
  const unitDoors = p.unitDoors.filter((d) => uMap.has(d.unitId) && cMap.has(d.corridorId))
    .map((d) => ({ unitId: uMap.get(d.unitId)!, corridorId: cMap.get(d.corridorId)!, point: [...d.point] as Vec2 }))
  const entrances = p.entrances.filter((e) => e.floorId === fromId).map((e) => ({ ...e, id: uid('ent'), floorId: toId, point: [...e.point] as Vec2 }))
  return normalizeProject({
    ...base, corridors: [...base.corridors, ...corridors], units: [...base.units, ...units],
    unitDoors: [...base.unitDoors, ...unitDoors], entrances: [...base.entrances, ...entrances],
  })
}

function clearEntranceRefs(ex: Project['external'], ids: Set<string>): Project['external'] {
  if (!ids.size) return ex
  const fix = <T extends { directionEntranceId: string }>(a: T[]) => a.map((x) => (ids.has(x.directionEntranceId) ? { ...x, directionEntranceId: '' } : x))
  return { ...ex, nearbyCommercial: fix(ex.nearbyCommercial), largeRetail: fix(ex.largeRetail), transit: fix(ex.transit), attractors: fix(ex.attractors) }
}

// ---- 요소 추가·수정·삭제 ----
export function addUnit(p: Project, floorId: string, polygon: Vec2[]): { project: Project; id: string } {
  const floor = p.floors.find((f) => f.id === floorId)
  let n = p.units.filter((u) => u.floorId === floorId).length + 1
  const used = new Set(p.units.map((u) => u.name))
  let name = `${floor?.name ?? ''}-${n}`
  while (used.has(name)) name = `${floor?.name ?? ''}-${++n}`
  const unit: Unit = { id: uid('u'), floorId, name, polygon, area: roundTo(polygonArea(polygon)), frontageWidth: 0, category: '', isAnchor: false, locked: false }
  return { project: normalizeProject({ ...p, units: [...p.units, unit] }), id: unit.id }
}

export function updateUnit(p: Project, id: string, patch: Partial<Unit>): Project {
  return { ...p, units: p.units.map((u) => (u.id === id ? { ...u, ...patch } : u)) }
}

export function setUnitPolygon(p: Project, id: string, polygon: Vec2[]): Project {
  return normalizeProject(updateUnit(p, id, { polygon }))
}

export function translatePoints(pts: Vec2[], dx: number, dy: number): Vec2[] {
  return pts.map(([x, y]) => [roundTo(x + dx), roundTo(y + dy)] as Vec2)
}

// 호실을 평행 이동할 때 문도 함께 움직인다
export function moveUnit(p: Project, id: string, dx: number, dy: number): Project {
  const u = p.units.find((x) => x.id === id)
  if (!u) return p
  return normalizeProject({
    ...p,
    units: p.units.map((x) => (x.id === id ? { ...x, polygon: translatePoints(x.polygon, dx, dy) } : x)),
    unitDoors: p.unitDoors.map((d) => (d.unitId === id ? { ...d, point: [roundTo(d.point[0] + dx), roundTo(d.point[1] + dy)] as Vec2 } : d)),
  })
}

export function setUnitDoor(p: Project, unitId: string, point: Vec2): Project {
  const u = p.units.find((x) => x.id === unitId)
  if (!u) return p
  const n = nearestCorridor(point, p.corridors.filter((c) => c.floorId === u.floorId))
  if (!n) return p
  const door: UnitDoor = { unitId, corridorId: n.corridor.id, point }
  return normalizeProject({ ...p, unitDoors: [...p.unitDoors.filter((d) => d.unitId !== unitId), door] })
}

export function resetUnitDoor(p: Project, unitId: string): Project {
  return normalizeProject({ ...p, unitDoors: p.unitDoors.filter((d) => d.unitId !== unitId) })
}

export function addCorridor(p: Project, floorId: string, points: Vec2[]): { project: Project; id: string } {
  const c: Corridor = { id: uid('cor'), floorId, points }
  return { project: normalizeProject({ ...p, corridors: [...p.corridors, c] }), id: c.id }
}

export function setCorridorPoints(p: Project, id: string, points: Vec2[]): Project {
  return normalizeProject({ ...p, corridors: p.corridors.map((c) => (c.id === id ? { ...c, points } : c)) })
}

export function addEntrance(p: Project, floorId: string, point: Vec2, type: EntranceType): { project: Project; id: string } {
  const n = p.entrances.length + 1
  const e: Entrance = { id: uid('ent'), floorId, point, name: `${type} ${n}`, type }
  return { project: { ...p, entrances: [...p.entrances, e] }, id: e.id }
}

export function updateEntrance(p: Project, id: string, patch: Partial<Entrance>): Project {
  return { ...p, entrances: p.entrances.map((e) => (e.id === id ? { ...e, ...patch } : e)) }
}

export const VERTICAL_NAME: Record<VerticalType, string> = {
  escalator: '에스컬레이터', elevator: '엘리베이터', stairs: '계단', ramp: '경사로', bridge: '브릿지',
}

// 새 수직동선: 기본으로 모든 층에 같은 위치로 연결한다 (연결 층은 나중에 바꿀 수 있다)
export function addVertical(p: Project, type: VerticalType, point: Vec2): { project: Project; id: string } {
  const n = p.verticals.filter((v) => v.type === type).length + 1
  const v: Vertical = {
    id: uid('vert'), name: `${VERTICAL_NAME[type]} ${n}`, type,
    connects: p.floors.map((f) => ({ floorId: f.id, point })),
    ...(type === 'escalator' ? { escalator: { direction: 'both' as const, layout: 'continuous' as const } } : {}),
    ...(type === 'elevator' ? { elevator: { avgWaitSec: 30 } } : {}),
  }
  return { project: { ...p, verticals: [...p.verticals, v] }, id: v.id }
}

export function updateVerticalProps(p: Project, id: string, fn: (v: Vertical) => Vertical): Project {
  return { ...p, verticals: p.verticals.map((v) => (v.id === id ? fn(v) : v)) }
}

export function moveVertical(p: Project, id: string, point: Vec2): Project {
  return updateVerticalProps(p, id, (v) => ({ ...v, connects: v.connects.map((c) => ({ ...c, point })) }))
}

export function setVerticalFloors(p: Project, id: string, floorIds: string[]): Project {
  return updateVerticalProps(p, id, (v) => {
    const ref = v.connects[0]?.point ?? [0, 0]
    const keep = v.connects.filter((c) => floorIds.includes(c.floorId))
    const add = floorIds.filter((f) => !keep.some((c) => c.floorId === f)).map((floorId) => ({ floorId, point: ref }))
    return { ...v, connects: [...keep, ...add] }
  })
}

export type SelKind = 'unit' | 'corridor' | 'entrance' | 'vertical'
export interface Selection { kind: SelKind; id: string }

export function deleteItem(p: Project, sel: Selection): Project {
  switch (sel.kind) {
    case 'unit':
      return normalizeProject({ ...p, units: p.units.filter((u) => u.id !== sel.id), unitDoors: p.unitDoors.filter((d) => d.unitId !== sel.id) })
    case 'corridor':
      return normalizeProject({ ...p, corridors: p.corridors.filter((c) => c.id !== sel.id) })
    case 'entrance':
      return { ...p, entrances: p.entrances.filter((e) => e.id !== sel.id), external: clearEntranceRefs(p.external, new Set([sel.id])) }
    case 'vertical':
      return { ...p, verticals: p.verticals.filter((v) => v.id !== sel.id) }
  }
}
