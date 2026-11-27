import { useStore } from '../store'
import type { Settings } from '../model/types'
import { defaultSettings } from '../model/defaults'
import { NumberField } from './NumberField'

type V = Settings['vertical']
const COSTS: [keyof V, string, number][] = [
  ['escalatorUp', '에스컬레이터 상행 (한 층)', 0.1],
  ['escalatorDown', '에스컬레이터 하행 (한 층)', 0.1],
  ['scissorTransfer', '분절형 갈아타기 추가', 0.1],
  ['voidVisibleFactor', '보이드 보일 때 비용 배수', 0.05],
  ['elevatorBase', '엘리베이터 기본', 0.1],
  ['elevatorWaitFactor', '엘리베이터 대기 환산 (초당)', 0.005],
  ['elevatorPerFloor', '엘리베이터 층수 차이 추가', 0.05],
  ['stairsPerFloor', '계단 (한 층)', 0.1],
  ['stairsExponent', '계단 층수 지수', 0.1],
  ['rampPerFloor', '경사로 (한 층)', 0.1],
  ['scissorOffsetM', '분절형 도착-출발 거리(m)', 1],
]

export function SettingsEditor() {
  const settings = useStore((s) => s.project.settings)
  const update = useStore((s) => s.updateSettings)
  const A = settings.analysis
  return (
    <div>
      <p className="hint">모든 계수는 <b>보정 전 가정값</b>입니다. 배치안끼리 상대 비교할 때만 의미가 있습니다.</p>
      <h4>수직 이동 비용 (각도비용 환산값)</h4>
      <table className="kv">
        <tbody>
          {COSTS.map(([k, label, step]) => (
            <tr key={k}>
              <td>{label}</td>
              <td><NumberField label={label} step={step} min={0} value={settings.vertical[k]} onChange={(v) => update((s) => ({ ...s, vertical: { ...s.vertical, [k]: v } }))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>분석 설정</h4>
      <table className="kv">
        <tbody>
          <tr>
            <td>복도 구간 최대 길이(m)</td>
            <td><NumberField label="구간 길이" min={2} step={1} value={A.maxSegmentM} onChange={(v) => update((s) => ({ ...s, analysis: { ...s.analysis, maxSegmentM: v } }))} /></td>
          </tr>
          <tr>
            <td>거리 가중 (m당 비용)</td>
            <td><NumberField label="거리 가중" min={0} step={0.001} width={72} value={A.metricWeight} onChange={(v) => update((s) => ({ ...s, analysis: { ...s.analysis, metricWeight: v } }))} /></td>
          </tr>
          <tr>
            <td>복도 붙임 허용 거리(m)</td>
            <td><NumberField label="허용 거리" min={0.5} step={0.5} value={A.attachToleranceM} onChange={(v) => update((s) => ({ ...s, analysis: { ...s.analysis, attachToleranceM: v } }))} /></td>
          </tr>
          <tr>
            <td>metric 반경 목록(m)</td>
            <td>
              <input
                style={{ width: 110 }}
                defaultValue={settings.radii.metric.join(', ')}
                key={settings.radii.metric.join(',')}
                onBlur={(e) => {
                  const r = e.target.value.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0)
                  if (r.length) update((s) => ({ ...s, radii: { ...s.radii, metric: r } }))
                }}
              />
            </td>
          </tr>
        </tbody>
      </table>
      <p className="hint">거리 가중은 각도비용이 같은 길 중에서 가까운 쪽을 고르게 하는 작은 값입니다. 0이면 순수 각도 비용입니다.</p>
      <button onClick={() => update((s) => ({ ...s, vertical: defaultSettings().vertical, analysis: defaultSettings().analysis, radii: defaultSettings().radii }))}>
        기본값으로 되돌리기
      </button>
    </div>
  )
}
