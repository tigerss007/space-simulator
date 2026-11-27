import type { Project, Unit } from './types'

// 선택한 배치안의 변경분을 적용한 호실 목록을 돌려준다. (원본은 바꾸지 않음)
export function effectiveUnits(project: Project, scenarioId: string | null): Unit[] {
  const sc = project.scenarios.find((s) => s.id === scenarioId)
  const ov = sc?.overrides.units
  if (!ov) return project.units
  return project.units.map((u) => (ov[u.id] ? { ...u, ...ov[u.id] } : u))
}
