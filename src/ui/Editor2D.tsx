import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore, floorsByLevel } from '../store'
import { effectiveUnits } from '../model/scenario'
import type { EntranceType, Vec2, VerticalType } from '../model/types'
import { closestOnSegment, dist } from '../engine/geom'
import {
  addCorridor, addEntrance, addUnit, addVertical, closestOnPolygon, deleteItem, moveUnit, moveVertical, nearestCorridor,
  pointInPolygon, polygonArea, rectPolygon, roundTo, setCorridorPoints, setUnitDoor, setUnitPolygon, translatePoints,
  updateEntrance, VERTICAL_NAME, type Selection,
} from '../editor/ops'
import { ENTRANCE_COLORS, VERTICAL_COLORS } from './colors'
import { useUnitColor } from './useUnitColor'

type Tool = 'select' | 'rect' | 'poly' | 'corridor' | 'door' | 'entrance' | 'vertical'
type Draft = { kind: 'rect' | 'poly' | 'corridor'; pts: Vec2[] }
type Drag =
  | { type: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { type: 'rect' }
  | { type: 'unit'; id: string; start: Vec2; applied: Vec2; sx: number; sy: number; started: boolean }
  | { type: 'unit-v'; id: string; idx: number; orig: Vec2[]; sx: number; sy: number; started: boolean }
  | { type: 'cor'; id: string; start: Vec2; orig: Vec2[]; sx: number; sy: number; started: boolean }
  | { type: 'cor-v'; id: string; idx: number; orig: Vec2[]; sx: number; sy: number; started: boolean }
  | { type: 'pt'; kind: 'entrance' | 'vertical'; id: string; sx: number; sy: number; started: boolean }

const TOOLS: [Tool, string, string][] = [
  ['select', '선택·이동', '호실·복도·출입구·수직동선을 눌러 선택하고 끌어서 옮깁니다. 선택한 도형의 모서리 점을 끌면 모양이 바뀝니다. 빈 곳을 끌면 화면이 이동합니다.'],
  ['rect', '호실(사각형)', '끌어서 사각형 호실을 그립니다. 격자에 자동으로 맞춰집니다.'],
  ['poly', '호실(다각형)', '꼭짓점을 차례로 누르세요. 첫 점을 다시 누르거나 더블클릭(또는 Enter)하면 완성됩니다. Backspace는 마지막 점 취소.'],
  ['corridor', '복도', '복도 중심선의 점을 차례로 누르세요. 더블클릭(또는 Enter)으로 끝냅니다. 다른 복도 위에서 끝내면 자동으로 이어집니다(T자 교차).'],
  ['door', '문 지정', '호실의 변을 눌러 문 위치를 정합니다. (문은 호실을 그리면 복도 쪽 변에 자동으로 생깁니다)'],
  ['entrance', '출입구', '눌러서 출입구를 놓습니다. 종류는 오른쪽 선택에서 고르세요. 복도 끝이나 복도 위에 놓으세요.'],
  ['vertical', '수직동선', '눌러서 수직동선을 놓습니다. 처음에는 모든 층에 연결되며, 오른쪽 "편집" 탭에서 연결 층을 바꿀 수 있습니다.'],
]
const V_LETTER: Record<VerticalType, string> = { escalator: '에', elevator: '엘', stairs: '계', ramp: '경', bridge: '브' }
const ENT_TYPES: EntranceType[] = ['주출입구', '부출입구', '지하철연결', '주차장연결']

export function Editor2D() {
  const project = useStore((s) => s.project)
  const scenarioId = useStore((s) => s.scenarioId)
  const floorId = useStore((s) => s.editFloorId)
  const setFloor = useStore((s) => s.setEditFloor)
  const selection = useStore((s) => s.selection)
  const select = useStore((s) => s.select)
  const commit = useStore((s) => s.commit)
  const beginEdit = useStore((s) => s.beginEdit)
  const live = useStore((s) => s.live)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const canUndo = useStore((s) => s.history.past.length > 0)
  const canRedo = useStore((s) => s.history.future.length > 0)
  const colorOf = useUnitColor()

  const wrap = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 600, h: 400 })
  const [view, setView] = useState({ cx: 40, cy: 20, s: 8 })
  const [tool, setTool] = useState<Tool>('select')
  const [grid, setGrid] = useState(1)
  const [snapOn, setSnapOn] = useState(true)
  const [entType, setEntType] = useState<EntranceType>('주출입구')
  const [vType, setVType] = useState<VerticalType>('escalator')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [cursor, setCursor] = useState<Vec2 | null>(null)
  const drag = useRef<Drag | null>(null)
  const space = useRef(false)

  const floors = useMemo(() => floorsByLevel(project), [project])
  const floor = floors.find((f) => f.id === floorId)
  const units = useMemo(() => effectiveUnits(project, scenarioId).filter((u) => u.floorId === floorId), [project, scenarioId, floorId])
  const corridors = useMemo(() => project.corridors.filter((c) => c.floorId === floorId), [project, floorId])
  const doors = useMemo(() => project.unitDoors.filter((d) => units.some((u) => u.id === d.unitId)), [project, units])
  const entrances = useMemo(() => project.entrances.filter((e) => e.floorId === floorId), [project, floorId])
  const verticals = useMemo(
    () => project.verticals.map((v) => ({ v, c: v.connects.find((c) => c.floorId === floorId) })).filter((x) => x.c),
    [project, floorId],
  )
  const below = useMemo(() => {
    const i = floors.findIndex((f) => f.id === floorId)
    return i > 0 ? floors[i - 1] : null
  }, [floors, floorId])
  const ghost = useMemo(() => (below ? project.units.filter((u) => u.floorId === below.id) : []), [project, below])

  // ---- 화면 크기 / 맞춰 보기 ----
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const fit = useCallback(() => {
    const pts: Vec2[] = [...units.flatMap((u) => u.polygon), ...corridors.flatMap((c) => c.points), ...entrances.map((e) => e.point)]
    if (!pts.length) { setView({ cx: 40, cy: 20, s: Math.max(2, Math.min(size.w / 100, size.h / 60)) }); return }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const s = Math.max(1, Math.min((size.w - 60) / Math.max(x1 - x0, 5), (size.h - 60) / Math.max(y1 - y0, 5)))
    setView({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s })
  }, [units, corridors, entrances, size.w, size.h])
  // 편집 층이 바뀌면 한 번 맞춰 보기
  const fitted = useRef('')
  useEffect(() => {
    if (fitted.current !== floorId && size.w > 50) { fitted.current = floorId; fit() }
  }, [floorId, size.w, fit])

  const toScreen = useCallback((p: Vec2): [number, number] => [size.w / 2 + (p[0] - view.cx) * view.s, size.h / 2 - (p[1] - view.cy) * view.s], [size, view])
  const toWorld = useCallback((sx: number, sy: number): Vec2 => [view.cx + (sx - size.w / 2) / view.s, view.cy - (sy - size.h / 2) / view.s], [size, view])
  const evPos = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = wrap.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  // ---- 스냅 ----
  const snap = (raw: Vec2, opt: { corridorProj?: boolean; skipId?: string } = {}): Vec2 => {
    const r = 10 / view.s
    let best: Vec2 | null = null
    let bd = r
    const consider = (p: Vec2) => { const d = dist(p, raw); if (d < bd) { bd = d; best = p } }
    for (const u of units) if (u.id !== opt.skipId) u.polygon.forEach(consider)
    for (const c of corridors) if (c.id !== opt.skipId) c.points.forEach(consider)
    if (best) return best
    if (opt.corridorProj) {
      for (const c of corridors) {
        if (c.id === opt.skipId) continue
        for (let i = 0; i + 1 < c.points.length; i++) {
          const q = closestOnSegment(raw, c.points[i], c.points[i + 1])
          if (q.dist < r) return [roundTo(q.point[0]), roundTo(q.point[1])]
        }
      }
    }
    if (snapOn) return [roundTo(Math.round(raw[0] / grid) * grid), roundTo(Math.round(raw[1] / grid) * grid)]
    return [roundTo(raw[0]), roundTo(raw[1])]
  }

  // ---- 눌러서 찾기 ----
  const hit = (raw: Vec2): { sel: Selection; vertex?: number } | null => {
    const tp = 12 / view.s
    if (selection?.kind === 'unit') {
      const u = units.find((x) => x.id === selection.id)
      const i = u?.polygon.findIndex((p) => dist(p, raw) < tp) ?? -1
      if (u && i >= 0) return { sel: selection, vertex: i }
    }
    for (const c of corridors) {
      const i = c.points.findIndex((p) => dist(p, raw) < tp)
      if (i >= 0) return { sel: { kind: 'corridor', id: c.id }, vertex: i }
    }
    for (const e of entrances) if (dist(e.point, raw) < tp * 1.3) return { sel: { kind: 'entrance', id: e.id } }
    for (const { v, c } of verticals) if (dist(c!.point, raw) < tp * 1.3) return { sel: { kind: 'vertical', id: v.id } }
    for (let i = units.length - 1; i >= 0; i--) if (pointInPolygon(raw, units[i].polygon)) return { sel: { kind: 'unit', id: units[i].id } }
    const n = nearestCorridor(raw, corridors)
    if (n && n.dist < Math.max(0.7, 8 / view.s)) return { sel: { kind: 'corridor', id: n.corridor.id } }
    return null
  }

  // ---- 그리기 마무리 ----
  const dedupe = (pts: Vec2[]) => pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]) > 0.01)
  const finishDraft = (d: Draft | null = draft) => {
    if (!d) return
    const pts = dedupe(d.pts)
    if (d.kind === 'poly' && pts.length >= 3 && polygonArea(pts) > 0.5) {
      let id = ''
      commit((p) => { const r = addUnit(p, floorId, pts); id = r.id; return r.project })
      select({ kind: 'unit', id })
    } else if (d.kind === 'corridor' && pts.length >= 2) {
      let id = ''
      commit((p) => { const r = addCorridor(p, floorId, pts); id = r.id; return r.project })
      select({ kind: 'corridor', id })
    }
    setDraft(null)
  }

  // ---- 포인터 ----
  const onPointerDown = (e: React.PointerEvent) => {
    wrap.current?.focus()
    const [sx, sy] = evPos(e)
    const raw = toWorld(sx, sy)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    if (e.button === 1 || e.button === 2 || space.current) {
      drag.current = { type: 'pan', sx, sy, cx: view.cx, cy: view.cy }
      return
    }
    if (e.button !== 0 || !floor) return

    if (tool === 'select') {
      const h = hit(raw)
      if (!h) { select(null); drag.current = { type: 'pan', sx, sy, cx: view.cx, cy: view.cy }; return }
      select(h.sel)
      if (h.sel.kind === 'unit') {
        const u = units.find((x) => x.id === h.sel.id)!
        drag.current = h.vertex !== undefined
          ? { type: 'unit-v', id: u.id, idx: h.vertex, orig: u.polygon, sx, sy, started: false }
          : { type: 'unit', id: u.id, start: raw, applied: [0, 0], sx, sy, started: false }
      } else if (h.sel.kind === 'corridor') {
        const c = corridors.find((x) => x.id === h.sel.id)!
        drag.current = h.vertex !== undefined
          ? { type: 'cor-v', id: c.id, idx: h.vertex, orig: c.points, sx, sy, started: false }
          : { type: 'cor', id: c.id, start: raw, orig: c.points, sx, sy, started: false }
      } else {
        drag.current = { type: 'pt', kind: h.sel.kind, id: h.sel.id, sx, sy, started: false }
      }
      return
    }
    if (tool === 'rect') {
      const a = snap(raw)
      drag.current = { type: 'rect' }
      setDraft({ kind: 'rect', pts: [a, a] })
      return
    }
    if (tool === 'poly' || tool === 'corridor') {
      const p = snap(raw, { corridorProj: tool === 'corridor' })
      const kind = tool
      if (draft && draft.kind === kind) {
        if (kind === 'poly' && draft.pts.length >= 3 && dist(toScreen(draft.pts[0]), [sx, sy]) < 10) { finishDraft(); return }
        setDraft({ kind, pts: [...draft.pts, p] })
      } else setDraft({ kind, pts: [p] })
      return
    }
    if (tool === 'door') {
      let best: { id: string; point: Vec2; d: number } | null = null
      for (const u of units) {
        const c = closestOnPolygon(raw, u.polygon)
        if (!best || c.dist < best.d) best = { id: u.id, point: [roundTo(c.point[0]), roundTo(c.point[1])], d: c.dist }
      }
      if (best && best.d < Math.max(2, 14 / view.s)) {
        const b = best
        commit((p) => setUnitDoor(p, b.id, b.point))
        select({ kind: 'unit', id: b.id })
      }
      return
    }
    if (tool === 'entrance') {
      const pt = snap(raw, { corridorProj: true })
      let id = ''
      commit((p) => { const r = addEntrance(p, floorId, pt, entType); id = r.id; return r.project })
      select({ kind: 'entrance', id })
      return
    }
    if (tool === 'vertical') {
      const pt = snap(raw, { corridorProj: true })
      let id = ''
      commit((p) => { const r = addVertical(p, vType, pt); id = r.id; return r.project })
      select({ kind: 'vertical', id })
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const [sx, sy] = evPos(e)
    const raw = toWorld(sx, sy)
    const d = drag.current
    if (d?.type === 'pan') {
      setView((v) => ({ ...v, cx: d.cx - (sx - d.sx) / v.s, cy: d.cy + (sy - d.sy) / v.s }))
      return
    }
    const moved = (x: { sx: number; sy: number; started: boolean }) => x.started || Math.hypot(sx - x.sx, sy - x.sy) > 3
    const start = (x: { started: boolean }) => { if (!x.started) { x.started = true; beginEdit() } }
    if (d?.type === 'rect') {
      const p = snap(raw)
      setDraft((dr) => (dr ? { ...dr, pts: [dr.pts[0], p] } : dr))
      setCursor(p)
      return
    }
    if (d?.type === 'unit' && moved(d)) {
      start(d)
      // 이동량은 시작점 기준 격자에 맞춘다
      const total: Vec2 = [roundTo(snapDelta(raw[0] - d.start[0])), roundTo(snapDelta(raw[1] - d.start[1]))]
      const dx = roundTo(total[0] - d.applied[0]), dy = roundTo(total[1] - d.applied[1])
      if (dx || dy) { live((p) => moveUnit(p, d.id, dx, dy)); d.applied = total }
      return
    }
    if (d?.type === 'unit-v' && moved(d)) {
      start(d)
      const p = snap(raw, { skipId: d.id })
      live((pr) => setUnitPolygon(pr, d.id, d.orig.map((q, i) => (i === d.idx ? p : q))))
      setCursor(p)
      return
    }
    if (d?.type === 'cor' && moved(d)) {
      start(d)
      const dx = roundTo(snapDelta(raw[0] - d.start[0])), dy = roundTo(snapDelta(raw[1] - d.start[1]))
      live((pr) => setCorridorPoints(pr, d.id, translatePoints(d.orig, dx, dy)))
      return
    }
    if (d?.type === 'cor-v' && moved(d)) {
      start(d)
      const p = snap(raw, { corridorProj: true, skipId: d.id })
      live((pr) => setCorridorPoints(pr, d.id, d.orig.map((q, i) => (i === d.idx ? p : q))))
      setCursor(p)
      return
    }
    if (d?.type === 'pt' && moved(d)) {
      start(d)
      const p = snap(raw, { corridorProj: true })
      live((pr) => (d.kind === 'entrance' ? updateEntrance(pr, d.id, { point: p }) : moveVertical(pr, d.id, p)))
      setCursor(p)
      return
    }
    setCursor(tool === 'select' || tool === 'door' ? [roundTo(raw[0]), roundTo(raw[1])] : snap(raw, { corridorProj: tool === 'corridor' || tool === 'entrance' || tool === 'vertical' }))
  }

  // 끌어 옮길 때의 이동량: 격자에 맞춘다
  const snapDelta = (v: number) => (snapOn ? Math.round(v / grid) * grid : v)

  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (d?.type === 'rect' && draft) {
      const [a, b] = draft.pts
      if (Math.abs(a[0] - b[0]) >= 0.5 && Math.abs(a[1] - b[1]) >= 0.5) {
        let id = ''
        commit((p) => { const r = addUnit(p, floorId, rectPolygon(a, b)); id = r.id; return r.project })
        select({ kind: 'unit', id })
      }
      setDraft(null)
    }
  }

  // 휠 확대/축소 (마우스 위치 기준)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const mx = e.clientX - r.left, my = e.clientY - r.top
      setView((v) => {
        const wx = v.cx + (mx - el.clientWidth / 2) / v.s
        const wy = v.cy - (my - el.clientHeight / 2) / v.s
        const s = Math.max(1, Math.min(80, v.s * Math.exp(-e.deltaY * 0.0015)))
        return { s, cx: wx - (mx - el.clientWidth / 2) / s, cy: wy + (my - el.clientHeight / 2) / s }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ') { space.current = true; e.preventDefault(); return }
    if (e.key === 'Enter') finishDraft()
    else if (e.key === 'Escape') { setDraft(null); drag.current = null; select(null) }
    else if (e.key === 'Backspace' && draft) setDraft(draft.pts.length > 1 ? { ...draft, pts: draft.pts.slice(0, -1) } : null)
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selection) commit((p) => deleteItem(p, selection))
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
  }

  // 도구를 바꾸면 그리던 것을 취소한다
  useEffect(() => setDraft(null), [tool, floorId])

  // ---- 그리기(렌더) ----
  const ptsStr = (pts: Vec2[]) => pts.map((p) => toScreen(p).join(',')).join(' ')
  const gridLines = (() => {
    let g = grid
    while (g * view.s < 9) g *= 5
    const [x0, y1] = toWorld(0, 0)
    const [x1, y0] = toWorld(size.w, size.h)
    const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = []
    for (let x = Math.floor(x0 / g) * g; x <= x1; x += g) {
      const [sx] = toScreen([x, 0])
      lines.push({ x1: sx, y1: 0, x2: sx, y2: size.h, major: Math.abs(Math.round(x / (g * 5)) * g * 5 - x) < 1e-6 })
    }
    for (let y = Math.floor(y0 / g) * g; y <= y1; y += g) {
      const [, sy] = toScreen([0, y])
      lines.push({ x1: 0, y1: sy, x2: size.w, y2: sy, major: Math.abs(Math.round(y / (g * 5)) * g * 5 - y) < 1e-6 })
    }
    return lines
  })()
  const scaleBar = (() => {
    const target = 90 / view.s
    const nice = [1, 2, 5, 10, 20, 50, 100].find((n) => n >= target) ?? 100
    return { m: nice, px: nice * view.s }
  })()
  const draftPts = draft ? (cursor && draft.kind !== 'rect' ? [...draft.pts, cursor] : draft.pts) : []
  const selUnit = selection?.kind === 'unit' ? units.find((u) => u.id === selection.id) : undefined
  const selCor = selection?.kind === 'corridor' ? corridors.find((c) => c.id === selection.id) : undefined
  const hint = TOOLS.find((t) => t[0] === tool)![2]

  return (
    <div className="ed">
      <div className="edbar">
        <div className="seg">
          {TOOLS.map(([t, label]) => (
            <button key={t} className={tool === t ? 'on' : ''} onClick={() => setTool(t)}>{label}</button>
          ))}
        </div>
        {tool === 'entrance' && (
          <select value={entType} onChange={(e) => setEntType(e.target.value as EntranceType)} aria-label="출입구 종류">
            {ENT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        )}
        {tool === 'vertical' && (
          <select value={vType} onChange={(e) => setVType(e.target.value as VerticalType)} aria-label="수직동선 종류">
            {(Object.keys(VERTICAL_NAME) as VerticalType[]).map((t) => <option key={t} value={t}>{VERTICAL_NAME[t]}</option>)}
          </select>
        )}
        <span className="sep" />
        <label className="inline">편집 층
          <select value={floorId} onChange={(e) => setFloor(e.target.value)} aria-label="편집 층">
            {[...floors].reverse().map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label className="inline">격자
          <select value={grid} onChange={(e) => setGrid(+e.target.value)} aria-label="격자 크기">
            {[0.5, 1, 2, 5].map((g) => <option key={g} value={g}>{g}m</option>)}
          </select>
        </label>
        <label className="inline"><input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} />격자 맞춤</label>
        <span className="sep" />
        <button onClick={undo} disabled={!canUndo} title="되돌리기 (Ctrl+Z)">되돌리기</button>
        <button onClick={redo} disabled={!canRedo} title="다시하기 (Ctrl+Y)">다시하기</button>
        <button onClick={() => selection && commit((p) => deleteItem(p, selection))} disabled={!selection} title="선택 삭제 (Delete)">삭제</button>
        <button onClick={fit}>전체 보기</button>
      </div>
      <div
        ref={wrap}
        className={`edcanvas tool-${tool}`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => { if (e.key === ' ') space.current = false }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <svg width={size.w} height={size.h}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onDoubleClick={() => (tool === 'poly' || tool === 'corridor') && finishDraft()}>
          <rect width={size.w} height={size.h} fill="#fbfcfd" />
          {gridLines.map((l, i) => <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.major ? '#d3d8e0' : '#eceff3'} strokeWidth={1} />)}

          {ghost.map((u) => <polygon key={u.id} points={ptsStr(u.polygon)} fill="none" stroke="#b5bcc8" strokeDasharray="4 4" />)}

          {corridors.map((c) => (
            <polyline key={`b${c.id}`} points={ptsStr(c.points)} fill="none" stroke="#9aa5b8" strokeOpacity={0.28}
              strokeWidth={Math.max(6, 6 * view.s)} strokeLinejoin="round" strokeLinecap="butt" />
          ))}

          {units.map((u) => {
            const sel = selection?.kind === 'unit' && selection.id === u.id
            const c = u.polygon.reduce((a, p) => [a[0] + p[0] / u.polygon.length, a[1] + p[1] / u.polygon.length], [0, 0] as Vec2)
            const [cx, cy] = toScreen(c)
            const xs = u.polygon.map((p) => toScreen(p)[0])
            const wpx = Math.max(...xs) - Math.min(...xs)
            return (
              <g key={u.id}>
                <polygon points={ptsStr(u.polygon)} fill={colorOf(u)} fillOpacity={0.62} stroke={sel ? '#e4572e' : '#3a3f4b'} strokeWidth={sel ? 3 : 1.2} />
                {wpx > 46 && (
                  <text x={cx} y={cy - 2} textAnchor="middle" fontSize={11} fill="#1d2433" pointerEvents="none">
                    {u.name}{u.isAnchor ? ' ★' : ''}
                    <tspan x={cx} dy={13} fontSize={10} fill="#4a5163">{u.category || ''}</tspan>
                  </text>
                )}
                {u.locked && <text x={cx} y={cy + 24} textAnchor="middle" fontSize={11} pointerEvents="none">🔒</text>}
              </g>
            )
          })}

          {doors.map((d) => {
            const n = nearestCorridor(d.point, corridors)
            const [dx, dy] = toScreen(d.point)
            return (
              <g key={d.unitId} pointerEvents="none">
                {n && <line x1={dx} y1={dy} x2={toScreen(n.point)[0]} y2={toScreen(n.point)[1]} stroke="#6b7383" strokeDasharray="3 3" />}
                <circle cx={dx} cy={dy} r={4} fill="#fff" stroke="#1d2433" strokeWidth={1.5} />
              </g>
            )
          })}

          {corridors.map((c) => {
            const sel = selCor?.id === c.id
            return (
              <g key={`l${c.id}`}>
                <polyline points={ptsStr(c.points)} fill="none" stroke={sel ? '#e4572e' : '#1d2433'} strokeWidth={sel ? 3 : 2} strokeLinejoin="round" />
                {c.points.map((p, i) => { const [x, y] = toScreen(p); return <circle key={i} cx={x} cy={y} r={sel ? 5 : 3} fill={sel ? '#fff' : '#1d2433'} stroke="#1d2433" /> })}
              </g>
            )
          })}

          {entrances.map((e) => {
            const [x, y] = toScreen(e.point)
            const sel = selection?.kind === 'entrance' && selection.id === e.id
            return (
              <g key={e.id}>
                <circle cx={x} cy={y} r={9} fill={ENTRANCE_COLORS[e.type]} stroke={sel ? '#e4572e' : '#fff'} strokeWidth={sel ? 3 : 2} />
                <text x={x + 13} y={y + 4} fontSize={11} fill="#1d2433" pointerEvents="none">{e.name}</text>
              </g>
            )
          })}

          {verticals.map(({ v, c }) => {
            const [x, y] = toScreen(c!.point)
            const sel = selection?.kind === 'vertical' && selection.id === v.id
            return (
              <g key={v.id}>
                <rect x={x - 9} y={y - 9} width={18} height={18} rx={3} fill={VERTICAL_COLORS[v.type]} stroke={sel ? '#e4572e' : '#fff'} strokeWidth={sel ? 3 : 2} />
                <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff" pointerEvents="none">{V_LETTER[v.type]}</text>
                <text x={x + 13} y={y + 4} fontSize={10} fill="#1d2433" pointerEvents="none">{v.name ?? ''}</text>
              </g>
            )
          })}

          {selUnit && selUnit.polygon.map((p, i) => { const [x, y] = toScreen(p); return <rect key={i} x={x - 4} y={y - 4} width={8} height={8} fill="#fff" stroke="#e4572e" strokeWidth={2} /> })}

          {draft?.kind === 'rect' && draft.pts.length === 2 && (() => {
            const poly = rectPolygon(draft.pts[0], draft.pts[1])
            const area = polygonArea(poly)
            const [x, y] = toScreen(poly[2])
            return (
              <g pointerEvents="none">
                <polygon points={ptsStr(poly)} fill="#e4572e" fillOpacity={0.2} stroke="#e4572e" strokeWidth={2} strokeDasharray="5 3" />
                <text x={x + 6} y={y - 6} fontSize={11} fill="#b23c17">{roundTo(Math.abs(draft.pts[1][0] - draft.pts[0][0]), 1)}m × {roundTo(Math.abs(draft.pts[1][1] - draft.pts[0][1]), 1)}m = {Math.round(area)}㎡</text>
              </g>
            )
          })()}
          {draft && draft.kind !== 'rect' && (
            <g pointerEvents="none">
              {draft.kind === 'poly' && draftPts.length >= 3
                ? <polygon points={ptsStr(draftPts)} fill="#e4572e" fillOpacity={0.15} stroke="#e4572e" strokeWidth={2} strokeDasharray="5 3" />
                : <polyline points={ptsStr(draftPts)} fill="none" stroke="#e4572e" strokeWidth={2} strokeDasharray="5 3" />}
              {draft.pts.map((p, i) => { const [x, y] = toScreen(p); return <circle key={i} cx={x} cy={y} r={i === 0 && draft.kind === 'poly' ? 6 : 4} fill="#fff" stroke="#e4572e" strokeWidth={2} /> })}
            </g>
          )}
          {cursor && tool !== 'select' && (() => { const [x, y] = toScreen(cursor); return <circle cx={x} cy={y} r={5} fill="none" stroke="#e4572e" strokeWidth={1.5} pointerEvents="none" /> })()}

          <g pointerEvents="none">
            <line x1={14} y1={size.h - 18} x2={14 + scaleBar.px} y2={size.h - 18} stroke="#1d2433" strokeWidth={2} />
            <text x={14} y={size.h - 24} fontSize={11} fill="#1d2433">{scaleBar.m}m</text>
          </g>
        </svg>
        <div className="edstatus">
          <b>{floor?.name}</b> · {tool === 'select' ? '' : `[${TOOLS.find((t) => t[0] === tool)![1]}] `}{hint}
          {cursor && <span className="coord"> ({cursor[0].toFixed(1)}, {cursor[1].toFixed(1)}) m</span>}
        </div>
      </div>
    </div>
  )
}
