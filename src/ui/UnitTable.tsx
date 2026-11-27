import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { effectiveUnits } from '../model/scenario'
import { fmt } from './heat'

type Col = 'floor' | 'name' | 'nain' | 'nach' | 'depth' | 'vis'

// 호실별 분석 결과표 (헤더를 누르면 정렬)
export function UnitTable() {
  const project = useStore((s) => s.project)
  const scenarioId = useStore((s) => s.scenarioId)
  const analysis = useStore((s) => s.analysis)
  const rk = useStore((s) => s.radiusKey)
  const setHover = useStore((s) => s.setHoverUnit)
  const [sort, setSort] = useState<{ col: Col; desc: boolean }>({ col: 'floor', desc: false })

  const rows = useMemo(() => {
    if (!analysis) return []
    const units = new Map(effectiveUnits(project, scenarioId).map((u) => [u.id, u]))
    const level = new Map(project.floors.map((f) => [f.id, f.level]))
    const list = analysis.units.map((r) => {
      const u = units.get(r.unitId)!
      return {
        id: r.unitId, floor: level.get(r.floorId) ?? 0, floorName: project.floors.find((f) => f.id === r.floorId)?.name ?? '',
        name: u.name, category: u.category, anchor: u.isAnchor,
        nain: r.metrics[rk]?.nain ?? null, nach: r.metrics[rk]?.nach ?? null, depth: r.entranceDepth, vis: r.visibility,
      }
    })
    const key = (r: (typeof list)[number]) => (sort.col === 'floor' ? r.floor : sort.col === 'name' ? r.name : (r[sort.col] ?? -Infinity))
    list.sort((a, b) => {
      const x = key(a), y = key(b)
      const c = typeof x === 'string' ? x.localeCompare(y as string, 'ko', { numeric: true }) : (x as number) - (y as number)
      return (sort.desc ? -c : c) || a.name.localeCompare(b.name, 'ko', { numeric: true })
    })
    return list
  }, [analysis, project, scenarioId, rk, sort])

  if (!analysis) return <p className="hint">분석 계산 중…</p>
  const th = (col: Col, label: string) => (
    <th onClick={() => setSort((s) => ({ col, desc: s.col === col ? !s.desc : false }))} className="sortable">
      {label}{sort.col === col ? (sort.desc ? ' ▼' : ' ▲') : ''}
    </th>
  )
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>{th('floor', '층')}{th('name', '호실')}<th>업종</th>{th('nain', '통합도')}{th('nach', '선택도')}{th('depth', '출입구 깊이')}{th('vis', '가시성(㎡)')}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)}>
              <td>{r.floorName}</td><td>{r.name}</td>
              <td>{r.category || '-'}{r.anchor ? ' ★' : ''}</td>
              <td>{fmt(r.nain)}</td><td>{fmt(r.nach)}</td><td>{fmt(r.depth)}</td><td>{fmt(r.vis, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
