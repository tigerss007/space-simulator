import { useStore } from '../store'
import type { Settings } from '../model/types'
import { INDICATORS, INDICATOR_LABEL, WEIGHT_PRESETS, GRADES, type Grade } from '../scoring/score'
import { NumberField } from './NumberField'
import { GRADE_COLORS, GRADE_TEXT } from './colors'
import { useScoring } from './useScoring'

const won = (v: number) => Math.round(v).toLocaleString()

// 오른쪽 패널: 점수 가중치, 등급 기준, 임대료 가정
export function ScorePanel() {
  const S = useStore((s) => s.project.settings)
  const floors = useStore((s) => s.project.floors)
  const update = useStore((s) => s.updateSettings)
  const scoring = useScoring()
  const set = (fn: (s: Settings) => Settings) => update(fn)
  const g = S.grade
  const gradeOk = g.sMax > 0 && g.sMax < g.aMax && g.aMax < g.bMax && g.bMax <= 100
  const presetOn = (w: Settings['weights']) => INDICATORS.every((k) => w[k] === S.weights[k])

  return (
    <div>
      <p className="hint">슬라이더를 움직이면 등급이 바로 다시 계산됩니다. 모든 값은 <b>보정 전 가정값</b>입니다.</p>

      <h4>가중치 프리셋</h4>
      <div className="chips">
        {WEIGHT_PRESETS.map((p) => (
          <button key={p.name} className={presetOn(p.weights) ? 'on' : ''} onClick={() => set((s) => ({ ...s, weights: { ...p.weights } }))}>{p.name}</button>
        ))}
      </div>

      <h4>점수 가중치</h4>
      {INDICATORS.map((k) => {
        const unused = scoring && !scoring.used.includes(k)
        return (
          <label key={k} className="wrow">
            <span className="wl">{INDICATOR_LABEL[k]}</span>
            <input
              type="range" min={0} max={2} step={0.05} value={S.weights[k]}
              onChange={(e) => set((s) => ({ ...s, weights: { ...s.weights, [k]: +e.target.value } }))}
            />
            <span className="wv">{S.weights[k].toFixed(2)}</span>
            {unused && <span className="dim wn">아직 반영되지 않음 (이후 단계에서 계산)</span>}
          </label>
        )
      })}

      <h4>지역 반경 (통합도·선택도에 사용)</h4>
      <select value={S.radii.selectedMetric} onChange={(e) => set((s) => ({ ...s, radii: { ...s.radii, selectedMetric: +e.target.value } }))}>
        {S.radii.metric.map((r) => <option key={r} value={r}>{r}m 이내</option>)}
      </select>

      <h4>층 보정값 (높을수록 유리한 층)</h4>
      <div className="row">
        {[...floors].sort((a, b) => b.level - a.level).map((f) => (
          <label key={f.id} className="inline">
            {f.name}
            <NumberField label={`${f.name} 층 보정`} step={0.1} width={56} value={S.floorAdjust[f.id] ?? 0}
              onChange={(v) => set((s) => ({ ...s, floorAdjust: { ...s.floorAdjust, [f.id]: v } }))} />
          </label>
        ))}
      </div>

      <h4>등급 기준 (상위 백분율)</h4>
      <div className="row">
        S ≤ <NumberField label="S 기준" width={52} min={1} max={99} value={g.sMax} onChange={(v) => set((s) => ({ ...s, grade: { ...s.grade, sMax: v } }))} />%
        A ≤ <NumberField label="A 기준" width={52} min={1} max={99} value={g.aMax} onChange={(v) => set((s) => ({ ...s, grade: { ...s.grade, aMax: v } }))} />%
        B ≤ <NumberField label="B 기준" width={52} min={1} max={100} value={g.bMax} onChange={(v) => set((s) => ({ ...s, grade: { ...s.grade, bMax: v } }))} />%
      </div>
      <p className="hint">나머지는 C등급입니다.{!gradeOk && <span className="err"> S &lt; A &lt; B 순서로 입력해 주세요.</span>}</p>

      <h4>임대료 가정</h4>
      <div className="row">
        기준 임대료 <NumberField label="기준 임대료" width={84} step={1000} min={0} value={S.rent.baseRentPerM2}
          onChange={(v) => set((s) => ({ ...s, rent: { ...s.rent, baseRentPerM2: v } }))} /> 원/㎡·월
      </div>
      <div className="row">
        등급 배수
        {GRADES.map((gr) => (
          <label key={gr} className="inline">
            <span className="gbadge" style={{ background: GRADE_COLORS[gr], color: GRADE_TEXT[gr] }}>{gr}</span>
            <NumberField label={`${gr} 배수`} width={52} step={0.05} min={0} value={S.rent.multipliers[gr as Grade]}
              onChange={(v) => set((s) => ({ ...s, rent: { ...s.rent, multipliers: { ...s.rent.multipliers, [gr]: v } } }))} />
          </label>
        ))}
      </div>
      {scoring && (
        <p className="hint">예상 월 임대료 합계: <b>{won(scoring.totalRent / 10000)}만원</b> (가정값, 상대 비교용)</p>
      )}
    </div>
  )
}
