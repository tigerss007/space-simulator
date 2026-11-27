import { useMemo } from 'react'
import { useStore } from '../store'
import { computeScoring, type ScoringResult } from '../scoring/score'
import { effectiveUnits } from '../model/scenario'

// 분석 결과와 점수 설정으로 호실 점수·등급·임대료를 즉시 계산한다. (가벼운 계산이라 화면 스레드에서 실행)
export function useScoring(): ScoringResult | null {
  const project = useStore((s) => s.project)
  const analysis = useStore((s) => s.analysis)
  const scenarioId = useStore((s) => s.scenarioId)
  return useMemo(
    () => (analysis ? computeScoring(project, analysis, effectiveUnits(project, scenarioId)) : null),
    [project, analysis, scenarioId],
  )
}
