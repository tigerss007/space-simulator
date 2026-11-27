import type { Project } from './types'

const LS_KEY = 'space-simulator:project:v1'

export type ParseResult = { ok: true; project: Project } | { ok: false; errors: string[] }

// 최소한의 구조·참조 검증. 잘못된 파일을 불러와 화면이 깨지는 것을 막는다.
export function validateProject(p: unknown): string[] {
  const errors: string[] = []
  if (!p || typeof p !== 'object') return ['프로젝트 파일 형식이 올바르지 않습니다.']
  const o = p as Record<string, unknown>
  for (const key of ['floors', 'units', 'corridors', 'unitDoors', 'entrances', 'verticals', 'scenarios']) {
    if (!Array.isArray(o[key])) errors.push(`'${key}' 항목이 없거나 배열이 아닙니다.`)
  }
  if (!o.meta || typeof o.meta !== 'object') errors.push("'meta' 항목이 없습니다.")
  if (!o.settings || typeof o.settings !== 'object') errors.push("'settings' 항목이 없습니다.")
  if (!o.external || typeof o.external !== 'object') errors.push("'external' 항목이 없습니다.")
  if (errors.length) return errors

  const proj = p as Project
  const floorIds = new Set(proj.floors.map((f) => f.id))
  if (floorIds.size !== proj.floors.length) errors.push('층 id가 중복되었습니다.')
  const isPt = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isFinite(n))
  const isPoly = (v: unknown) => Array.isArray(v) && v.length >= 3 && v.every(isPt)

  for (const u of proj.units) {
    if (!floorIds.has(u.floorId)) errors.push(`호실 '${u.id}'의 층 '${u.floorId}'가 없습니다.`)
    if (!isPoly(u.polygon)) errors.push(`호실 '${u.id}'의 다각형 좌표가 올바르지 않습니다.`)
  }
  for (const c of proj.corridors) {
    if (!floorIds.has(c.floorId)) errors.push(`복도 '${c.id}'의 층 '${c.floorId}'가 없습니다.`)
    if (!Array.isArray(c.points) || c.points.length < 2 || !c.points.every(isPt)) errors.push(`복도 '${c.id}'의 좌표가 올바르지 않습니다.`)
  }
  for (const e of proj.entrances) {
    if (!floorIds.has(e.floorId)) errors.push(`출입구 '${e.id}'의 층 '${e.floorId}'가 없습니다.`)
    if (!isPt(e.point)) errors.push(`출입구 '${e.id}'의 좌표가 올바르지 않습니다.`)
  }
  for (const v of proj.verticals) {
    if (!Array.isArray(v.connects)) errors.push(`수직동선 '${v.id}'에 connects가 없습니다.`)
    else for (const c of v.connects) if (!floorIds.has(c.floorId) || !isPt(c.point)) errors.push(`수직동선 '${v.id}'의 연결 정보가 올바르지 않습니다.`)
  }
  const unitIds = new Set(proj.units.map((u) => u.id))
  const corIds = new Set(proj.corridors.map((c) => c.id))
  for (const d of proj.unitDoors) {
    if (!unitIds.has(d.unitId) || !corIds.has(d.corridorId)) errors.push(`문 정보(호실 '${d.unitId}')가 존재하지 않는 호실/복도를 가리킵니다.`)
  }
  return errors
}

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 2)
}

export function parseProject(text: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['JSON 형식이 아닙니다. 이 도구에서 저장한 파일인지 확인해 주세요.'] }
  }
  const errors = validateProject(data)
  return errors.length ? { ok: false, errors } : { ok: true, project: data as Project }
}

// ---- 브라우저 자동저장 (localStorage는 막혀 있을 수 있어 항상 try/catch) ----
export function saveToLocal(p: Project): void {
  try {
    localStorage.setItem(LS_KEY, serializeProject(p))
  } catch {
    /* 저장 공간이 없거나 차단된 경우: 조용히 무시 */
  }
}

export function loadFromLocal(): Project | null {
  try {
    const text = localStorage.getItem(LS_KEY)
    if (!text) return null
    const r = parseProject(text)
    return r.ok ? r.project : null
  } catch {
    return null
  }
}

export function clearLocal(): void {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* 무시 */
  }
}
