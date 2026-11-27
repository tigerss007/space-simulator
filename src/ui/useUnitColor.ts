import { useCallback, useMemo } from 'react'
import { useStore, floorsByLevel } from '../store'
import type { Unit } from '../model/types'
import { GRADE_COLORS, FLOOR_COLORS, UNKNOWN_COLOR, categoryColor } from './colors'
import { heatColor, normalize, unitValue, valueRange } from './heat'
import { useScoring } from './useScoring'

// 3D 화면과 2D 편집기가 같은 기준으로 호실 색을 칠하도록 하는 훅
export function useUnitColor(): (u: Unit) => string {
  const project = useStore((s) => s.project)
  const colorMode = useStore((s) => s.colorMode)
  const analysis = useStore((s) => s.analysis)
  const metric = useStore((s) => s.viewMetric)
  const radiusKey = useStore((s) => s.radiusKey)
  const scoring = useScoring()
  const floorIndex = useMemo(() => Object.fromEntries(floorsByLevel(project).map((f, i) => [f.id, i])), [project])
  const heatMetric = metric && metric !== 'grade' ? metric : null
  const range = useMemo(() => (analysis && heatMetric ? valueRange(analysis, heatMetric, radiusKey) : null), [analysis, heatMetric, radiusKey])
  const unitRes = useMemo(() => new Map((analysis?.units ?? []).map((u) => [u.unitId, u])), [analysis])

  return useCallback(
    (u: Unit) => {
      if (metric === 'grade') {
        const g = scoring?.byId.get(u.id)?.grade
        return g ? GRADE_COLORS[g] : '#cfd3da'
      }
      if (heatMetric && range) {
        const r = unitRes.get(u.id)
        const v = r ? unitValue(r, heatMetric, radiusKey) : null
        return v === null ? '#cfd3da' : heatColor(normalize(v, range, heatMetric))
      }
      if (colorMode === 'plain') return '#c9ced6'
      if (colorMode === 'floor') return FLOOR_COLORS[(floorIndex[u.floorId] ?? 0) % FLOOR_COLORS.length]
      return u.category ? categoryColor(u.category) : UNKNOWN_COLOR
    },
    [metric, heatMetric, range, unitRes, radiusKey, colorMode, floorIndex, scoring],
  )
}
