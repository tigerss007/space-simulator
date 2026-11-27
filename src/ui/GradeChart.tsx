import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore } from '../store'
import { useScoring } from './useScoring'
import { GRADES } from '../scoring/score'
import { GRADE_COLORS } from './colors'

// 층별 등급 분포 (누적 막대) + 등급별 요약표
export function GradeChart() {
  const project = useStore((s) => s.project)
  const scoring = useScoring()
  const data = useMemo(() => {
    if (!scoring) return []
    return [...project.floors].sort((a, b) => b.level - a.level).map((f) => {
      const row: Record<string, number | string> = { floor: f.name, S: 0, A: 0, B: 0, C: 0 }
      for (const u of scoring.units) if (u.floorId === f.id) row[u.grade] = (row[u.grade] as number) + 1
      return row
    })
  }, [scoring, project.floors])
  if (!scoring) return <p className="hint">분석 계산 중…</p>
  const total = scoring.units.length
  return (
    <div className="chartwrap">
      <div className="chartbox">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }} barCategoryGap={10}>
            <CartesianGrid horizontal={false} stroke="#e4e7ec" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="floor" tick={{ fontSize: 12 }} width={36} />
            <Tooltip formatter={(v, n) => [`${v}개`, `${n}등급`]} />
            {GRADES.map((g) => (
              <Bar key={g} dataKey={g} stackId="g" fill={GRADE_COLORS[g]} stroke="#ffffff" strokeWidth={2} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <ul className="chartlegend">
          {GRADES.map((g) => (
            <li key={g}><span className="dot" style={{ background: GRADE_COLORS[g], border: '1px solid #8a93a3' }} />{g}등급</li>
          ))}
        </ul>
      </div>
      <table className="gsum">
        <thead><tr><th>등급</th><th>호실 수</th><th>비율</th><th>면적(㎡)</th><th>월 임대료(만원)</th></tr></thead>
        <tbody>
          {GRADES.map((g) => {
            const s = scoring.gradeSummary[g]
            return (
              <tr key={g}>
                <td><span className="gbadge" style={{ background: GRADE_COLORS[g], color: g === 'S' || g === 'A' ? '#fff' : '#1d2433' }}>{g}</span></td>
                <td>{s.count}</td><td>{total ? Math.round((s.count / total) * 100) : 0}%</td>
                <td>{s.area.toLocaleString()}</td><td>{Math.round(s.rent / 10000).toLocaleString()}</td>
              </tr>
            )
          })}
          <tr className="total"><td>합계</td><td>{total}</td><td>100%</td>
            <td>{GRADES.reduce((a, g) => a + scoring.gradeSummary[g].area, 0).toLocaleString()}</td>
            <td>{Math.round(scoring.totalRent / 10000).toLocaleString()}</td></tr>
        </tbody>
      </table>
    </div>
  )
}
