import { create } from 'zustand'
import type { Project, Settings, Vertical } from './model/types'
import type { AnalysisResult } from './engine/analyze'
import { runAnalysis } from './engine/client'
import { emptyHistory, pushHistory, redo as redoH, undo as undoH, type History } from './editor/history'
import { normalizeProject, type Selection } from './editor/ops'
import { createSampleProject } from './model/sample'
import { loadFromLocal, saveToLocal } from './model/storage'

export type LayoutMode = 'all' | 'explode' | 'single' // 전체 / 층 분리 / 한 층만
export type CenterMode = '3d' | '2d' | 'split' // 가운데 화면: 3D / 2D 편집 / 나란히
export type ColorMode = 'category' | 'floor' | 'plain' // 업종 / 층 / 단색
export type ViewMetric = 'nain' | 'nach' | 'depth' | 'visibility' | 'grade' // 통합도 / 선택도 / 출입구 깊이 / 가시성 / 호실 등급

interface State {
  project: Project
  scenarioId: string | null
  layoutMode: LayoutMode
  explodeGap: number // 층 분리 간격(m)
  visible: Record<string, boolean> // 층별 표시 여부
  singleFloorId: string
  colorMode: ColorMode
  hoverUnitId: string | null
  centerMode: CenterMode
  editFloorId: string // 2D 편집 중인 층
  selection: Selection | null
  history: History<Project>
  analysis: AnalysisResult | null
  analysisStatus: 'idle' | 'running' | 'error'
  analysisError: string | null
  viewMetric: ViewMetric | null // null이면 업종/층 색상 보기
  radiusKey: string // 'n' 또는 metric 반경(m)
  showGuide: boolean
  showNew: boolean
  notice: { kind: 'info' | 'error'; text: string } | null

  setProject: (p: Project, notice?: string) => void
  resetToSample: () => void
  setProjectName: (name: string) => void
  setScenario: (id: string | null) => void
  setLayoutMode: (m: LayoutMode) => void
  setExplodeGap: (g: number) => void
  toggleFloor: (id: string) => void
  setAllFloors: (on: boolean) => void
  setSingleFloor: (id: string) => void
  setColorMode: (m: ColorMode) => void
  setHoverUnit: (id: string | null) => void
  setCenterMode: (m: CenterMode) => void
  setEditFloor: (id: string) => void
  select: (s: Selection | null) => void
  commit: (fn: (p: Project) => Project) => void // 되돌리기 기록을 남기며 편집
  beginEdit: () => void // 끌기 시작 전에 한 번 호출해 기록을 남긴다
  live: (fn: (p: Project) => Project) => void // 끄는 중 실시간 반영(기록 없음)
  undo: () => void
  redo: () => void
  setUnitCategory: (unitId: string, category: string, isAnchor: boolean) => void
  setViewMetric: (m: ViewMetric | null) => void
  setRadiusKey: (k: string) => void
  updateVertical: (id: string, fn: (v: Vertical) => Vertical) => void
  updateSettings: (fn: (s: Settings) => Settings) => void
  setShowGuide: (v: boolean) => void
  setShowNew: (v: boolean) => void
  setNotice: (n: State['notice']) => void
}

const GUIDE_KEY = 'space-simulator:guide-seen'

function guideSeen(): boolean {
  try {
    return localStorage.getItem(GUIDE_KEY) === '1'
  } catch {
    return false
  }
}

export function markGuideSeen() {
  try {
    localStorage.setItem(GUIDE_KEY, '1')
  } catch {
    /* 무시 */
  }
}

// 되돌리기/다시하기 뒤에 선택·편집 층이 사라진 경우를 정리한다
function syncAfterEdit(s: State, project: Project, history: History<Project>): Partial<State> {
  const ids = new Set(project.floors.map((f) => f.id))
  const sel = s.selection
  const selOk = !sel || (sel.kind === 'unit' ? project.units.some((x) => x.id === sel.id)
    : sel.kind === 'corridor' ? project.corridors.some((x) => x.id === sel.id)
    : sel.kind === 'entrance' ? project.entrances.some((x) => x.id === sel.id)
    : project.verticals.some((x) => x.id === sel.id))
  return {
    project, history,
    selection: selOk ? sel : null,
    editFloorId: ids.has(s.editFloorId) ? s.editFloorId : defaultSingle(project),
    singleFloorId: ids.has(s.singleFloorId) ? s.singleFloorId : defaultSingle(project),
    visible: Object.fromEntries(project.floors.map((f) => [f.id, s.visible[f.id] ?? true])),
  }
}

const sortedFloors = (p: Project) => [...p.floors].sort((a, b) => a.level - b.level)
const allVisible = (p: Project) => Object.fromEntries(p.floors.map((f) => [f.id, true]))
const defaultSingle = (p: Project) => (p.floors.find((f) => f.level === 0) ?? sortedFloors(p)[0])?.id ?? ''

// 자동저장된 작업이 있으면 그것을, 없으면 샘플을 연다.
const initial = loadFromLocal() ?? createSampleProject()

export const useStore = create<State>((set, get) => ({
  project: initial,
  scenarioId: initial.scenarios[0]?.id ?? null,
  layoutMode: 'explode',
  explodeGap: 6,
  visible: allVisible(initial),
  singleFloorId: defaultSingle(initial),
  colorMode: 'category',
  hoverUnitId: null,
  centerMode: '3d',
  editFloorId: defaultSingle(initial),
  selection: null,
  history: emptyHistory<Project>(),
  analysis: null,
  analysisStatus: 'idle',
  analysisError: null,
  viewMetric: null,
  radiusKey: 'n',
  showGuide: !guideSeen(),
  showNew: false,
  notice: null,

  setProject: (p, notice) =>
    set({
      project: p,
      scenarioId: p.scenarios[0]?.id ?? null,
      visible: allVisible(p),
      singleFloorId: defaultSingle(p),
      editFloorId: defaultSingle(p),
      selection: null,
      history: emptyHistory<Project>(),
      hoverUnitId: null,
      notice: notice ? { kind: 'info', text: notice } : null,
    }),
  resetToSample: () => get().setProject(createSampleProject(), '샘플 프로젝트를 불러왔습니다.'),
  setProjectName: (name) => set((s) => ({ project: { ...s.project, meta: { ...s.project.meta, name } } })),
  setScenario: (id) => set({ scenarioId: id }),
  setLayoutMode: (layoutMode) => set({ layoutMode }),
  setExplodeGap: (explodeGap) => set({ explodeGap }),
  toggleFloor: (id) => set((s) => ({ visible: { ...s.visible, [id]: !s.visible[id] } })),
  setAllFloors: (on) => set((s) => ({ visible: Object.fromEntries(s.project.floors.map((f) => [f.id, on])) })),
  setSingleFloor: (singleFloorId) => set({ singleFloorId }),
  setColorMode: (colorMode) => set({ colorMode }),
  setHoverUnit: (hoverUnitId) => set({ hoverUnitId }),
  setCenterMode: (centerMode) => set({ centerMode }),
  setEditFloor: (editFloorId) => set({ editFloorId, selection: null }),
  select: (selection) => set({ selection }),
  commit: (fn) =>
    set((s) => {
      const next = normalizeProject(fn(s.project))
      return next === s.project ? s : { project: next, history: pushHistory(s.history, s.project) }
    }),
  beginEdit: () => set((s) => ({ history: pushHistory(s.history, s.project) })),
  live: (fn) => set((s) => ({ project: normalizeProject(fn(s.project)) })),
  undo: () =>
    set((s) => {
      const r = undoH(s.history, s.project)
      return r ? syncAfterEdit(s, r.value, r.history) : s
    }),
  redo: () =>
    set((s) => {
      const r = redoH(s.history, s.project)
      return r ? syncAfterEdit(s, r.value, r.history) : s
    }),
  setUnitCategory: (unitId, category, isAnchor) =>
    get().commit((p) => {
      const sid = get().scenarioId
      const sc = p.scenarios.find((x) => x.id === sid)
      if (sc) {
        // 배치안을 보고 있을 때는 그 배치안의 변경으로 저장한다
        return { ...p, scenarios: p.scenarios.map((x) => x.id === sid ? { ...x, overrides: { ...x.overrides, units: { ...x.overrides.units, [unitId]: { category, isAnchor } } } } : x) }
      }
      return { ...p, units: p.units.map((u) => (u.id === unitId ? { ...u, category, isAnchor } : u)) }
    }),
  setViewMetric: (viewMetric) => set({ viewMetric }),
  setRadiusKey: (radiusKey) => set({ radiusKey }),
  updateVertical: (id, fn) =>
    set((s) => ({ project: { ...s.project, verticals: s.project.verticals.map((v) => (v.id === id ? fn(v) : v)) } })),
  updateSettings: (fn) => set((s) => ({ project: { ...s.project, settings: fn(s.project.settings) } })),
  setShowGuide: (showGuide) => set({ showGuide }),
  setShowNew: (showNew) => set({ showNew }),
  setNotice: (notice) => set({ notice }),
}))

// 층이 추가·삭제되면 층 표시 상태와 선택된 층을 맞춘다.
useStore.subscribe((s, prev) => {
  if (s.project.floors === prev.project.floors) return
  const ids = new Set(s.project.floors.map((f) => f.id))
  const visible = Object.fromEntries(s.project.floors.map((f) => [f.id, s.visible[f.id] ?? true]))
  const same = Object.keys(visible).length === Object.keys(s.visible).length && Object.keys(visible).every((k) => visible[k] === s.visible[k])
  const patch: Partial<State> = {}
  if (!same) patch.visible = visible
  if (!ids.has(s.editFloorId)) patch.editFloorId = defaultSingle(s.project)
  if (!ids.has(s.singleFloorId)) patch.singleFloorId = defaultSingle(s.project)
  if (Object.keys(patch).length) useStore.setState(patch)
})

// 프로젝트가 바뀌면 잠시 뒤 브라우저에 자동저장한다.
let timer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe((s, prev) => {
  if (s.project === prev.project) return
  clearTimeout(timer)
  timer = setTimeout(() => saveToLocal(useStore.getState().project), 400)
})

// 분석에 영향을 주는 입력이 바뀌면(이름만 바뀐 경우 제외) 잠시 뒤 Worker에서 다시 계산한다.
const analysisInputs = (p: Project) => [p.floors, p.units, p.corridors, p.unitDoors, p.entrances, p.verticals, p.settings.vertical, p.settings.analysis, p.settings.radii]
let aTimer: ReturnType<typeof setTimeout> | undefined
let aSeq = 0
function scheduleAnalysis(delay = 120) {
  clearTimeout(aTimer)
  useStore.setState({ analysisStatus: 'running' })
  aTimer = setTimeout(() => {
    const my = ++aSeq
    runAnalysis(useStore.getState().project).then(
      (analysis) => {
        if (my !== aSeq) return // 더 최근 요청이 있으면 버린다
        const { radiusKey } = useStore.getState()
        useStore.setState({
          analysis, analysisStatus: 'idle', analysisError: null,
          radiusKey: analysis.radiusKeys.includes(radiusKey) ? radiusKey : 'n',
        })
      },
      (e: Error) => { if (my === aSeq) useStore.setState({ analysisStatus: 'error', analysisError: e.message }) },
    )
  }, delay)
}
useStore.subscribe((s, prev) => {
  const a = analysisInputs(s.project), b = analysisInputs(prev.project)
  if (a.some((x, i) => x !== b[i])) scheduleAnalysis()
})
scheduleAnalysis(0)

export const floorsByLevel = sortedFloors
