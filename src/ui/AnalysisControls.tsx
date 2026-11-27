import { useStore } from '../store'
import type { HeatMetric } from './heat'
import { GRADES } from '../scoring/score'
import { GRADE_COLORS } from './colors'
import { useScoring } from './useScoring'
import { HEAT_GRADIENT, METRIC_HELP, METRIC_LABEL, RADIUS_LABEL, fmt, valueRange } from './heat'

const METRICS: HeatMetric[] = ['nain', 'nach', 'depth', 'visibility']

// 왼쪽 패널: 분석 보기 모드, 반경 선택, 범례
export function AnalysisControls() {
  const metric = useStore((s) => s.viewMetric)
  const setMetric = useStore((s) => s.setViewMetric)
  const analysis = useStore((s) => s.analysis)
  const status = useStore((s) => s.analysisStatus)
  const err = useStore((s) => s.analysisError)
  const rk = useStore((s) => s.radiusKey)
  const setRk = useStore((s) => s.setRadiusKey)
  const scoring = useScoring()
  const hm: HeatMetric | null = metric && metric !== 'grade' ? metric : null
  const usesRadius = hm === 'nain' || hm === 'nach'
  const range = analysis && hm ? valueRange(analysis, hm, rk) : null

  return (
    <>
      <h3>분석 보기 모드 {status === 'running' && <span className="dim">계산 중…</span>}</h3>
      <div className="chips">
        <button className={metric === null ? 'on' : ''} onClick={() => setMetric(null)}>끄기</button>
        {METRICS.map((m) => (
          <button key={m} className={metric === m ? 'on' : ''} disabled={!analysis} onClick={() => setMetric(m)}>
            {METRIC_LABEL[m]}
          </button>
        ))}
        <button disabled title="Phase 5에서 추가됩니다">통행량</button>
        <button className={metric === 'grade' ? 'on' : ''} disabled={!analysis} onClick={() => setMetric('grade')}>호실 등급</button>
      </div>
      {err && <p className="hint err">분석 오류: {err}</p>}
      {metric === 'grade' && scoring && (
        <>
          <p className="hint">점수 순위(상위 백분율)로 등급을 매깁니다. 진할수록 상위 등급입니다.</p>
          <ul className="legend one">
            {GRADES.map((g) => (
              <li key={g}><span className="dot" style={{ background: GRADE_COLORS[g], border: '1px solid #8a93a3' }} />{g}등급 {scoring.gradeSummary[g].count}개</li>
            ))}
          </ul>
        </>
      )}
      {hm && analysis && (
        <>
          {usesRadius && (
            <label className="slider">
              분석 반경
              <select value={rk} onChange={(e) => setRk(e.target.value)} style={{ width: '100%' }}>
                {analysis.radiusKeys.map((k) => (
                  <option key={k} value={k}>{RADIUS_LABEL(k)}</option>
                ))}
              </select>
            </label>
          )}
          <p className="hint">{METRIC_HELP[hm!]}</p>
          <div className="heatbar" style={{ background: HEAT_GRADIENT }} />
          <div className="heatlabels">
            <span>{metric === 'depth' ? '멀다(불리)' : '낮음'} {range && fmt(metric === 'depth' ? range[1] : range[0])}</span>
            <span>{range && fmt(metric === 'depth' ? range[0] : range[1])} {metric === 'depth' ? '가깝다(유리)' : '높음'}</span>
          </div>
        </>
      )}
      {analysis && (
        <p className="hint">구간 {analysis.stats.nodes}개 · 연결 {analysis.stats.links}개 (수직 {analysis.stats.verticalLinks}) · {analysis.stats.ms}ms</p>
      )}
    </>
  )
}
