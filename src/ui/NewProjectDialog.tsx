import { useState } from 'react'
import { useStore } from '../store'
import { emptyProject } from '../editor/ops'
import { applyTemplate, TEMPLATES, type TemplateId } from '../editor/templates'

// 새 프로젝트 만들기: 빈 프로젝트 또는 기본 도형 템플릿으로 시작
export function NewProjectDialog() {
  const open = useStore((s) => s.showNew)
  const setOpen = useStore((s) => s.setShowNew)
  const setProject = useStore((s) => s.setProject)
  const setCenterMode = useStore((s) => s.setCenterMode)
  const [name, setName] = useState('새 프로젝트')
  const [tpl, setTpl] = useState<TemplateId | 'empty'>('rect')
  if (!open) return null
  const create = () => {
    if (!window.confirm('현재 작업은 JSON으로 저장하지 않았다면 사라집니다. 새 프로젝트를 만들까요?')) return
    const p0 = emptyProject(name.trim() || '새 프로젝트')
    const p = tpl === 'empty' ? p0 : applyTemplate(p0, p0.floors[0].id, tpl)
    setProject(p, '새 프로젝트를 만들었습니다. 2D 화면에서 호실·복도를 그려 보세요.')
    setCenterMode('split')
    setOpen(false)
  }
  return (
    <div className="overlay" onClick={() => setOpen(false)}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>새 프로젝트</h2>
        <label className="block">프로젝트 이름
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', padding: 6 }} />
        </label>
        <p><b>시작 모양</b></p>
        <label className="block"><input type="radio" name="tpl" checked={tpl === 'empty'} onChange={() => setTpl('empty')} /> 빈 프로젝트 <span className="dim">— 1층만 있고 아무것도 없음</span></label>
        {TEMPLATES.map((t) => (
          <label key={t.id} className="block"><input type="radio" name="tpl" checked={tpl === t.id} onChange={() => setTpl(t.id)} /> {t.name} <span className="dim">— {t.desc}</span></label>
        ))}
        <p className="hint">나중에 층을 늘리거나 모양을 바꿀 수 있습니다.</p>
        <div className="row">
          <button className="primary" onClick={create}>만들기</button>
          <button onClick={() => setOpen(false)}>취소</button>
        </div>
      </div>
    </div>
  )
}
