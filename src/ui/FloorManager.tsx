import { useState } from 'react'
import { useStore, floorsByLevel } from '../store'
import { addFloor, copyFloorContent, removeFloor, updateFloor } from '../editor/ops'
import { applyTemplate, TEMPLATES, type TemplateId } from '../editor/templates'
import { NumberField } from './NumberField'
import { TextField } from './TextField'

// 왼쪽 패널: 층 추가·편집·삭제, 템플릿 적용, 다른 층에서 복사
export function FloorManager() {
  const project = useStore((s) => s.project)
  const floorId = useStore((s) => s.editFloorId)
  const setFloor = useStore((s) => s.setEditFloor)
  const commit = useStore((s) => s.commit)
  const centerMode = useStore((s) => s.centerMode)
  const setCenterMode = useStore((s) => s.setCenterMode)
  const [tpl, setTpl] = useState<TemplateId>('rect')
  const [copyFrom, setCopyFrom] = useState('')
  const floors = floorsByLevel(project)
  const f = floors.find((x) => x.id === floorId)
  const hasContent = (id: string) =>
    project.units.some((u) => u.floorId === id) || project.corridors.some((c) => c.floorId === id) || project.entrances.some((e) => e.floorId === id)
  const others = floors.filter((x) => x.id !== floorId && hasContent(x.id))
  const sure = (msg: string) => window.confirm(msg)

  const add = (where: 'above' | 'below') => {
    let newId = ''
    commit((p) => { const r = addFloor(p, where); newId = r.floor.id; return r.project })
    setFloor(newId)
    if (centerMode === '3d') setCenterMode('split')
  }

  return (
    <>
      <h3>층 편집</h3>
      <div className="seg">
        <button className={centerMode === '3d' ? 'on' : ''} onClick={() => setCenterMode('3d')}>3D</button>
        <button className={centerMode === 'split' ? 'on' : ''} onClick={() => setCenterMode('split')}>나란히</button>
        <button className={centerMode === '2d' ? 'on' : ''} onClick={() => setCenterMode('2d')}>2D 편집</button>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button onClick={() => add('above')}>+ 위층</button>
        <button onClick={() => add('below')}>+ 지하층</button>
        <button
          disabled={floors.length <= 1}
          onClick={() => f && sure(`'${f.name}'과(와) 그 층의 호실·복도·출입구를 모두 지울까요?`) && commit((p) => removeFloor(p, f.id))}
        >층 삭제</button>
      </div>
      {f && (
        <>
          <div className="dim" style={{ marginTop: 6 }}>편집 중인 층 선택</div>
          <select value={floorId} onChange={(e) => setFloor(e.target.value)} style={{ width: '100%' }}>
            {[...floors].reverse().map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <table className="kv"><tbody>
            <tr><td>층 이름</td><td><TextField label="층 이름" width={70} value={f.name} onCommit={(v) => v.trim() && commit((p) => updateFloor(p, f.id, { name: v.trim() }))} /></td></tr>
            <tr><td>바닥 높이(m)</td><td><NumberField label="바닥 높이" step={0.5} value={f.elevation} onChange={(v) => commit((p) => updateFloor(p, f.id, { elevation: v }))} /></td></tr>
            <tr><td>층고(m)</td><td><NumberField label="층고" step={0.5} min={2} value={f.height} onChange={(v) => commit((p) => updateFloor(p, f.id, { height: v }))} /></td></tr>
          </tbody></table>

          <div className="dim">기본 도형 템플릿</div>
          <div className="row">
            <select value={tpl} onChange={(e) => setTpl(e.target.value as TemplateId)}>
              {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button onClick={() => (!hasContent(f.id) || sure(`'${f.name}'의 기존 호실·복도·출입구가 지워지고 템플릿으로 바뀝니다. 계속할까요?`)) && commit((p) => applyTemplate(p, f.id, tpl))}>적용</button>
          </div>
          <p className="hint">{TEMPLATES.find((t) => t.id === tpl)?.desc}</p>

          {others.length > 0 && (
            <>
              <div className="dim">다른 층에서 복사</div>
              <div className="row">
                <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                  <option value="">층 선택</option>
                  {others.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <button disabled={!copyFrom || !others.some((x) => x.id === copyFrom)}
                  onClick={() => (!hasContent(f.id) || sure(`'${f.name}'의 기존 내용이 지워지고 복사됩니다. 계속할까요?`)) && commit((p) => copyFloorContent(p, copyFrom, f.id))}>복사</button>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
