import type { Project } from '../model/types'
import type { AnalysisResult } from '../engine/analyze'
import { GRADES, INDICATORS, INDICATOR_LABEL, type ScoringResult } from '../scoring/score'

// 파일 이름은 어떤 브라우저·운영체제에서도 깨지지 않도록 영문+날짜로 만든다. (프로젝트 이름은 파일 안에 들어 있다)
export const fileStamp = () => new Date().toISOString().slice(0, 10)

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a) // 일부 브라우저는 문서에 붙어 있어야 파일 이름을 지킨다
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// 등급표를 xlsx로 내보낸다. (브라우저 안에서만 만들어지며 서버로 전송되지 않는다)
export async function exportXlsx(project: Project, analysis: AnalysisResult, scoring: ScoringResult, scenarioName: string) {
  const XLSX = await import('xlsx')
  const S = project.settings
  const floorName = (id: string) => project.floors.find((f) => f.id === id)?.name ?? id
  const res = new Map(analysis.units.map((u) => [u.unitId, u]))
  const rk = scoring.radiusKey

  const unitRows = [...scoring.units].sort((a, b) => a.rank - b.rank).map((u) => {
    const r = res.get(u.unitId)!
    const row: Record<string, string | number> = {
      순위: u.rank, 층: floorName(u.floorId), 호실: u.name, 업종: u.category || '', 앵커: u.isAnchor ? '예' : '',
      '면적(㎡)': u.area, '점수(0~100)': +u.score100.toFixed(1), 점수원값: +u.score.toFixed(3), 등급: u.grade,
      '통합도(NAIN)': +(r.metrics[rk]?.nain ?? 0).toFixed(3), '선택도(NACH)': +(r.metrics[rk]?.nach ?? 0).toFixed(3),
      출입구깊이: r.entranceDepth === null ? '' : +r.entranceDepth.toFixed(3), '가시성(㎡)': Math.round(r.visibility),
      '임대료(원/㎡·월)': Math.round(u.rentPerM2), '월임대료(원)': Math.round(u.monthlyRent),
    }
    for (const k of INDICATORS) row[`z_${INDICATOR_LABEL[k]}`] = u.z[k] === null ? '' : +u.z[k]!.toFixed(3)
    return row
  })

  const summary = [
    ...GRADES.map((g) => ({ 등급: g, 호실수: scoring.gradeSummary[g].count, '면적(㎡)': scoring.gradeSummary[g].area, '월임대료(원)': Math.round(scoring.gradeSummary[g].rent) })),
    { 등급: '합계', 호실수: scoring.units.length, '면적(㎡)': scoring.units.reduce((s, u) => s + u.area, 0), '월임대료(원)': Math.round(scoring.totalRent) },
  ]

  const assumptions: (string | number)[][] = [
    ['※ 보정 전 가정값입니다. 절대값 예측이 아니라 배치안끼리의 상대 비교용입니다.'],
    [],
    ['프로젝트', project.meta.name],
    ['배치안', scenarioName],
    ['지역 반경(m)', rk === 'n' ? '전체' : rk],
    [],
    ['점수 가중치'],
    ...INDICATORS.map((k) => [INDICATOR_LABEL[k], S.weights[k]]),
    [],
    ['등급 기준(상위 %)', `S ≤ ${S.grade.sMax}`, `A ≤ ${S.grade.aMax}`, `B ≤ ${S.grade.bMax}`, '나머지 C'],
    ['기준 임대료(원/㎡·월)', S.rent.baseRentPerM2],
    ['등급 배수', ...GRADES.map((g) => `${g} ${S.rent.multipliers[g]}`)],
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unitRows), '호실 등급표')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), '등급 요약')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(assumptions), '가정값')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `space-simulator_grades_${fileStamp()}.xlsx`)
}

// 3D 화면을 PNG로 저장한다.
export function exportPng(): boolean {
  const canvas = document.querySelector('canvas')
  if (!canvas) return false
  canvas.toBlob((b) => b && download(b, `space-simulator_3d_${fileStamp()}.png`), 'image/png')
  return true
}
