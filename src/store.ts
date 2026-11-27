import { create } from 'zustand'
import type { Project, Settings, Vertical } from './model/types'
import type { AnalysisResult } from './engine/analyze'
import { runAnalysis } from './engine/client'
import { createSampleProject } from './model/sample'
import { loadFromLocal, saveToLocal } from './model/storage'

export type LayoutMode = 'all' | 'explode' | 'single' // 전체 / 층 분리 / 한 층만
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
  analysis: AnalysisResult | null
  analysisStatus: 'idle' | 'running' | 'error'
  analysisError: string | null
  viewMetric: ViewMetric | null // null이면 업종/층 색상 보기
  radiusKey: string // 'n' 또는 metric 반경(m)
  showGuide: boolean
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
  setViewMetric: (m: ViewMetric | null) => void
  setRadiusKey: (k: string) => void
  updateVertical: (id: string, fn: (v: Vertical) => Vertical) => void
  updateSettings: (fn: (s: Settings) => Settings) => void
  setShowGuide: (v: boolean) => void
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
  analysis: null,
  analysisStatus: 'idle',
  analysisError: null,
  viewMetric: null,
  radiusKey: 'n',
  showGuide: !guideSeen(),
  notice: null,

  setProject: (p, notice) =>
    set({
      project: p,
      scenarioId: p.scenarios[0]?.id ?? null,
      visible: allVisible(p),
      singleFloorId: defaultSingle(p),
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
  setViewMetric: (viewMetric) => set({ viewMetric }),
  setRadiusKey: (radiusKey) => set({ radiusKey }),
  updateVertical: (id, fn) =>
    set((s) => ({ project: { ...s.project, verticals: s.project.verticals.map((v) => (v.id === id ? fn(v) : v)) } })),
  updateSettings: (fn) => set((s) => ({ project: { ...s.project, settings: fn(s.project.settings) } })),
  setShowGuide: (showGuide) => set({ showGuide }),
  setNotice: (notice) => set({ notice }),
}))

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
