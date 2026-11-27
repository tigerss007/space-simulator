import { useStore } from '../store'
import type { Vertical } from '../model/types'
import { NumberField } from './NumberField'
import { VERTICAL_LABELS } from './colors'

// 수직동선 간이 편집: 위치 이동, 에스컬레이터 방식·방향, 엘리베이터 대기시간.
// (평면 편집기는 Phase 4에서 추가됩니다.)
export function VerticalEditor() {
  const project = useStore((s) => s.project)
  const update = useStore((s) => s.updateVertical)
  const floorName = (id: string) => project.floors.find((f) => f.id === id)?.name ?? id

  return (
    <div>
      <p className="hint">값을 바꾸면 분석이 바로 다시 계산됩니다. 위치는 복도 가까이(허용 거리 안)에 두어야 연결됩니다.</p>
      {project.verticals.map((v) => {
        const p = v.connects[0]?.point ?? [0, 0]
        const move = (x: number, y: number) =>
          update(v.id, (vv) => ({ ...vv, connects: vv.connects.map((c) => ({ ...c, point: [x, y] })) }))
        const esc = v.escalator
        const setEsc = (patch: Partial<NonNullable<Vertical['escalator']>>) =>
          update(v.id, (vv) => ({ ...vv, escalator: { direction: 'both', layout: 'continuous', ...vv.escalator, ...patch } }))
        return (
          <fieldset key={v.id} className="vcard">
            <legend>{v.name ?? v.id} <span className="dim">({VERTICAL_LABELS[v.type]})</span></legend>
            <div className="row">
              위치 x <NumberField label="x" value={p[0]} onChange={(x) => move(x, p[1])} />
              y <NumberField label="y" value={p[1]} onChange={(y) => move(p[0], y)} />
            </div>
            <div className="dim">연결 층: {v.connects.map((c) => floorName(c.floorId)).join(' · ')}</div>
            {v.type === 'escalator' && (
              <>
                <div className="row">
                  방식
                  <select value={esc?.layout ?? 'continuous'} onChange={(e) => setEsc({ layout: e.target.value as 'continuous' | 'scissor' | 'skip' })}>
                    <option value="continuous">연속형</option>
                    <option value="scissor">분절형</option>
                    <option value="skip">스킵형</option>
                  </select>
                  방향
                  <select value={esc?.direction ?? 'both'} onChange={(e) => setEsc({ direction: e.target.value as 'up' | 'down' | 'both' })}>
                    <option value="both">상·하행</option>
                    <option value="up">상행만</option>
                    <option value="down">하행만</option>
                  </select>
                </div>
                {esc?.layout === 'skip' && (
                  <div className="row">
                    서지 않는 층:
                    {v.connects.map((c) => (
                      <label key={c.floorId} className="inline">
                        <input
                          type="checkbox"
                          checked={!!esc.skippedFloors?.includes(c.floorId)}
                          onChange={(e) => {
                            const cur = new Set(esc.skippedFloors ?? [])
                            if (e.target.checked) cur.add(c.floorId)
                            else cur.delete(c.floorId)
                            setEsc({ skippedFloors: [...cur] })
                          }}
                        />
                        {floorName(c.floorId)}
                      </label>
                    ))}
                  </div>
                )}
                <label className="inline">
                  <input type="checkbox" checked={!!v.voidVisible} onChange={(e) => update(v.id, (vv) => ({ ...vv, voidVisible: e.target.checked }))} />
                  보이드(아트리움)로 위층이 보임
                </label>
              </>
            )}
            {v.type === 'elevator' && (
              <div className="row">
                평균 대기 <NumberField label="대기" value={v.elevator?.avgWaitSec ?? 30} min={0} onChange={(s) => update(v.id, (vv) => ({ ...vv, elevator: { avgWaitSec: s } }))} /> 초
              </div>
            )}
          </fieldset>
        )
      })}
    </div>
  )
}
