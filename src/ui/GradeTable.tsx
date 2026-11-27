import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { useScoring } from './useScoring'
import { GRADES } from '../scoring/score'
import { GRADE_COLORS, GRADE_TEXT } from './colors'
import { fmt } from './heat'

type Col = 'rank' | 'floor' | 'name' | 'area' | 'score' | 'grade' | 'rentPerM2' | 'monthly'

// 호실 등급표 (정렬·필터)
export function GradeTable() {
  const project = useStore((s) => s.project)
  const setHover = useStore((s) => s.setHoverUnit)
  const scoring = useScoring()
  const [sort, setSort] = useState<{ col: Col; desc: boolean }>({ col: 'rank', desc: false })
  const [floor, setFloor] = useState('')
  const [grade, setGrade] = useState('')
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    if (!scoring) return []
    const level = new Map(project.floors.map((f) => [f.id, f.level]))
    const list = scoring.units.filter(
      (u) => (!floor || u.floorId === floor) && (!grade || u.grade === grade) && (!q || (u.name + u.category).includes(q)),
    )
    const key = (u: (typeof list)[number]): number | string =>
      ({ rank: u.rank, floor: level.get(u.floorId) ?? 0, name: u.name, area: u.area, score: u.score100,
         grade: u.rank, rentPerM2: u.rentPerM2, monthly: u.monthlyRent })[sort.col]
    return [...list].sort((a, b) => {
      const x = key(a), y = key(b)
      const c = typeof x === 'string' ? x.localeCompare(y as string, 'ko', { numeric: true }) : (x as number) - (y as number)
      return (sort.desc ? -c : c) || a.rank - b.rank
    })
  }, [scoring, project.floors, floor, grade, q, sort])

  if (!scoring) return <p className="hint">분석 계산 중…</p>
  const th = (col: Col, label: string) => (
    <th className="sortable" onClick={() => setSort((s) => ({ col, desc: s.col === col ? !s.desc : false }))}>
      {label}{sort.col === col ? (sort.desc ? ' ▼' : ' ▲') : ''}
    </th>
  )
  const sumRent = rows.reduce((s, u) => s + u.monthlyRent, 0)
  return (
    <div>
      <div className="filters">
        <select value={floor} onChange={(e) => setFloor(e.target.value)} aria-label="층 필터">
          <option value="">모든 층</option>
          {[...project.floors].sort((a, b) => b.level - a.level).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="등급 필터">
          <option value="">모든 등급</option>
          {GRADES.map((g) => <option key={g} value={g}>{g}등급</option>)}
        </select>
        <input placeholder="호실·업종 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="dim">{rows.length}개 호실 · 월 임대료 합계 {Math.round(sumRent / 10000).toLocaleString()}만원</span>
      </div>
      {scoring.excluded.length > 0 && <p className="hint err">복도에 붙지 않아 등급을 매기지 못한 호실: {scoring.excluded.join(', ')}</p>}
      <div className="tablewrap">
        <table>
          <thead>
            <tr>{th('rank', '순위')}{th('floor', '층')}{th('name', '호실')}<th>업종</th>{th('area', '면적(㎡)')}{th('score', '점수(0~100)')}{th('grade', '등급')}{th('rentPerM2', '임대료(원/㎡·월)')}{th('monthly', '월 임대료(만원)')}</tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.unitId} onMouseEnter={() => setHover(u.unitId)} onMouseLeave={() => setHover(null)}>
                <td>{u.rank}</td>
                <td>{project.floors.find((f) => f.id === u.floorId)?.name}</td>
                <td>{u.name}</td>
                <td>{u.category || '-'}{u.isAnchor ? ' ★' : ''}</td>
                <td>{u.area.toLocaleString()}</td>
                <td>{fmt(u.score100, 1)}</td>
                <td><span className="gbadge" style={{ background: GRADE_COLORS[u.grade], color: GRADE_TEXT[u.grade] }}>{u.grade}</span></td>
                <td>{Math.round(u.rentPerM2).toLocaleString()}</td>
                <td>{Math.round(u.monthlyRent / 10000).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
