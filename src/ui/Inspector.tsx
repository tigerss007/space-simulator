import { useMemo } from 'react'
import { useStore } from '../store'
import { effectiveUnits } from '../model/scenario'
import { deleteItem, moveVertical, resetUnitDoor, setVerticalFloors, updateEntrance, updateUnit, updateVerticalProps, VERTICAL_NAME } from '../editor/ops'
import type { EntranceType, VerticalType } from '../model/types'
import { dist } from '../engine/geom'
import { NumberField } from './NumberField'
import { TextField } from './TextField'
import { CATEGORY_COLORS } from './colors'

const ENT_TYPES: EntranceType[] = ['주출입구', '부출입구', '지하철연결', '주차장연결']

// 오른쪽 '편집' 탭: 2D 편집기에서 선택한 요소의 속성을 고친다
export function Inspector() {
  const project = useStore((s) => s.project)
  const sel = useStore((s) => s.selection)
  const scenarioId = useStore((s) => s.scenarioId)
  const commit = useStore((s) => s.commit)
  const setCat = useStore((s) => s.setUnitCategory)
  const select = useStore((s) => s.select)
  const centerMode = useStore((s) => s.centerMode)
  const setCenterMode = useStore((s) => s.setCenterMode)
  const units = useMemo(() => effectiveUnits(project, scenarioId), [project, scenarioId])
  const scName = project.scenarios.find((x) => x.id === scenarioId)?.name
  const del = () => { if (sel) { commit((p) => deleteItem(p, sel)); select(null) } }

  if (centerMode === '3d')
    return (
      <div>
        <p className="hint">평면 편집은 2D 화면에서 합니다.</p>
        <button className="primary" onClick={() => setCenterMode('split')}>2D 편집 켜기</button>
      </div>
    )
  if (!sel)
    return (
      <div>
        <p className="hint">2D 화면에서 호실·복도·출입구·수직동선을 눌러 선택하면 여기서 속성을 고칠 수 있습니다.</p>
        <ul className="hint tips">
          <li>빈 프로젝트라면 왼쪽 '층 편집'의 <b>템플릿</b>으로 시작하면 편해요.</li>
          <li>복도를 먼저 그리고, 그 양옆에 호실을 그리세요. 문은 자동으로 만들어집니다.</li>
          <li>층을 늘렸다면 '다른 층에서 복사'로 같은 평면을 빠르게 채울 수 있어요.</li>
        </ul>
      </div>
    )

  if (sel.kind === 'unit') {
    const u = units.find((x) => x.id === sel.id)
    const door = project.unitDoors.find((d) => d.unitId === sel.id)
    if (!u) return null
    return (
      <div>
        <h4>호실</h4>
        <table className="kv"><tbody>
          <tr><td>이름</td><td><TextField label="호실 이름" value={u.name} onCommit={(v) => commit((p) => updateUnit(p, u.id, { name: v }))} /></td></tr>
          <tr><td>업종</td><td>
            <TextField label="업종" value={u.category} list="cats" placeholder="(비워 둘 수 있음)" onCommit={(v) => setCat(u.id, v, u.isAnchor)} />
            <datalist id="cats">{Object.keys(CATEGORY_COLORS).map((c) => <option key={c} value={c} />)}</datalist>
          </td></tr>
          <tr><td>앵커</td><td><input type="checkbox" checked={u.isAnchor} onChange={(e) => setCat(u.id, u.category, e.target.checked)} /></td></tr>
          <tr><td>잠금 (자동 배치 제외)</td><td><input type="checkbox" checked={u.locked} onChange={(e) => commit((p) => updateUnit(p, u.id, { locked: e.target.checked }))} /></td></tr>
          <tr><td>면적</td><td>{u.area.toLocaleString()}㎡ <span className="dim">(자동)</span></td></tr>
          <tr><td>전면 폭</td><td>{u.frontageWidth}m <span className="dim">(문이 있는 변)</span></td></tr>
          <tr><td>문</td><td>{door ? `(${door.point[0]}, ${door.point[1]})` : <span className="err">없음 — 복도에 붙지 않았어요</span>}</td></tr>
        </tbody></table>
        {scName && <p className="hint">업종·앵커는 현재 보고 있는 <b>{scName}</b>의 변경으로 저장됩니다.</p>}
        <div className="row">
          <button onClick={() => commit((p) => resetUnitDoor(p, u.id))}>문 자동 재배치</button>
          <button onClick={del}>호실 삭제</button>
        </div>
      </div>
    )
  }

  if (sel.kind === 'corridor') {
    const c = project.corridors.find((x) => x.id === sel.id)
    if (!c) return null
    const len = c.points.slice(1).reduce((s, p, i) => s + dist(p, c.points[i]), 0)
    return (
      <div>
        <h4>복도</h4>
        <p className="hint">점 {c.points.length}개 · 길이 {len.toFixed(1)}m. 모서리 점을 끌면 모양이 바뀝니다.</p>
        <div className="row"><button onClick={del}>복도 삭제</button></div>
      </div>
    )
  }

  if (sel.kind === 'entrance') {
    const e = project.entrances.find((x) => x.id === sel.id)
    if (!e) return null
    return (
      <div>
        <h4>출입구</h4>
        <table className="kv"><tbody>
          <tr><td>이름</td><td><TextField label="출입구 이름" value={e.name} onCommit={(v) => commit((p) => updateEntrance(p, e.id, { name: v }))} /></td></tr>
          <tr><td>종류</td><td>
            <select value={e.type} onChange={(ev) => commit((p) => updateEntrance(p, e.id, { type: ev.target.value as EntranceType }))}>
              {ENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </td></tr>
        </tbody></table>
        <p className="hint">출입구 깊이는 '주출입구'에서 계산합니다.</p>
        <div className="row"><button onClick={del}>출입구 삭제</button></div>
      </div>
    )
  }

  const v = project.verticals.find((x) => x.id === sel.id)
  if (!v) return null
  const p0 = v.connects[0]?.point ?? [0, 0]
  const sorted = [...project.floors].sort((a, b) => b.level - a.level)
  return (
    <div>
      <h4>수직동선</h4>
      <table className="kv"><tbody>
        <tr><td>이름</td><td><TextField label="수직동선 이름" value={v.name ?? ''} onCommit={(n) => commit((p) => updateVerticalProps(p, v.id, (x) => ({ ...x, name: n })))} /></td></tr>
        <tr><td>종류</td><td>
          <select value={v.type} onChange={(e) => {
            const type = e.target.value as VerticalType
            commit((p) => updateVerticalProps(p, v.id, (x) => ({
              ...x, type,
              escalator: type === 'escalator' ? (x.escalator ?? { direction: 'both', layout: 'continuous' }) : undefined,
              elevator: type === 'elevator' ? (x.elevator ?? { avgWaitSec: 30 }) : undefined,
            })))
          }}>
            {(Object.keys(VERTICAL_NAME) as VerticalType[]).map((t) => <option key={t} value={t}>{VERTICAL_NAME[t]}</option>)}
          </select>
        </td></tr>
        <tr><td>위치 (x, y)</td><td>
          <NumberField label="x" width={52} step={0.5} value={p0[0]} onChange={(x) => commit((p) => moveVertical(p, v.id, [x, p0[1]]))} />{' '}
          <NumberField label="y" width={52} step={0.5} value={p0[1]} onChange={(y) => commit((p) => moveVertical(p, v.id, [p0[0], y]))} />
        </td></tr>
      </tbody></table>
      <h4>연결 층</h4>
      <div className="row">
        {sorted.map((f) => (
          <label key={f.id} className="inline">
            <input type="checkbox" checked={v.connects.some((c) => c.floorId === f.id)}
              onChange={(e) => {
                const cur = new Set(v.connects.map((c) => c.floorId))
                if (e.target.checked) cur.add(f.id); else cur.delete(f.id)
                commit((p) => setVerticalFloors(p, v.id, project.floors.filter((x) => cur.has(x.id)).map((x) => x.id)))
              }} />
            {f.name}
          </label>
        ))}
      </div>
      <p className="hint">에스컬레이터 방식·방향, 엘리베이터 대기시간 같은 세부 설정은 '수직동선' 탭에서 바꿉니다.</p>
      <div className="row"><button onClick={del}>수직동선 삭제</button></div>
    </div>
  )
}
