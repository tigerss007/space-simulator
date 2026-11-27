// 프로젝트 데이터 모델 (docs/SPEC.md 3장). 단위는 m.
// 평면 좌표 [x, y] → three.js 좌표 (x, 높이, -y)

export type Vec2 = [number, number]

export interface Floor {
  id: string
  name: string // "B1", "1F" ...
  level: number // 정수 순서값 (B1=-1, 1F=0, 2F=1 ...). 인접 층 판단에 사용
  elevation: number // 바닥 높이(m)
  height: number // 층고(m)
}

export interface Unit {
  id: string
  floorId: string
  name: string
  polygon: Vec2[]
  area: number // m2
  frontageWidth: number // 전면 폭(m)
  category: string // 업종 (빈 문자열 가능)
  isAnchor: boolean
  locked: boolean
}

export interface Corridor {
  id: string
  floorId: string
  points: Vec2[]
}

export interface UnitDoor {
  unitId: string
  corridorId: string
  point: Vec2
}

export type EntranceType = '주출입구' | '부출입구' | '지하철연결' | '주차장연결'

export interface Entrance {
  id: string
  floorId: string
  point: Vec2
  name: string
  type: EntranceType
}

export type VerticalType = 'escalator' | 'elevator' | 'stairs' | 'ramp' | 'bridge'

export interface VerticalConnect {
  floorId: string
  point: Vec2
}

export interface Vertical {
  id: string
  name?: string
  type: VerticalType
  connects: VerticalConnect[]
  escalator?: {
    direction: 'up' | 'down' | 'both'
    layout: 'continuous' | 'scissor' | 'skip' // 연속형 / 분절형 / 스킵형
    skippedFloors?: string[]
  }
  elevator?: { avgWaitSec: number }
  voidVisible?: boolean // 보이드·아트리움으로 위층이 보이는지
}

// ---- 외부 요인 (5장) ----
export type Barrier = 'none' | '대로' | '철도' | '하천' | '옹벽'
export type LargeRetailType = '대형마트' | '백화점' | '아울렛' | '복합몰'
export type DistanceBand = '근접' | '중거리' | '원거리'
export type AttractorType = '학원가' | '학교' | '병원' | '공공시설' | '공원' | '업무시설'

export interface ExternalFactors {
  residential: {
    bands: {
      walkMin: 5 | 10 | 15
      households: number
      avgPriceIndex: number // 소득 대리지표
      childHouseholdRatio: number
    }[]
  }
  nearbyCommercial: {
    name: string
    walkDistanceM: number
    storeCount: number
    linkStrength: number // 0~1
    barrier: Barrier
    complementarity: number // 0~1
    directionEntranceId: string
  }[]
  largeRetail: {
    name: string
    type: LargeRetailType
    gfa: number
    distanceBand: DistanceBand
    directionEntranceId: string
  }[]
  transit: {
    name: string
    dailyRidership: number
    walkDistanceM: number
    directionEntranceId: string
  }[]
  attractors: {
    name: string
    type: AttractorType
    size: number
    walkDistanceM: number
    directionEntranceId: string
  }[]
}

// ---- 설정 (모든 조절 변수) ----
export interface Settings {
  vertical: {
    escalatorUp: number // 한 층 상행 비용
    escalatorDown: number // 한 층 하행 비용
    scissorTransfer: number // 분절형 갈아타기 추가 비용
    voidVisibleFactor: number // 보이드 시 비용 배수
    elevatorBase: number
    elevatorWaitFactor: number // avgWaitSec × 이 값
    elevatorPerFloor: number // 층수 차이 추가 비용(작게)
    stairsPerFloor: number
    stairsExponent: number // 층수 지수 (층수^지수)
    rampPerFloor: number // 경사로 한 층 비용
    scissorOffsetM: number // 분절형: 도착 지점과 다음 출발 지점 사이 거리(m)
  }
  analysis: {
    maxSegmentM: number // 복도 세그먼트 최대 길이(m). 긴 복도를 이 길이로 쪼갠다
    metricWeight: number // 거리 1m당 각도비용 환산값(동률 깨기용 작은 값). 0이면 순수 각도 비용
    attachToleranceM: number // 수직동선·문·출입구가 복도에 붙을 수 있는 최대 거리(m)
    visibilityRays: number // 가시성 레이캐스팅 광선 수(전면 반원)
    visibilityRangeM: number // 가시성 최대 거리(m)
  }
  radii: {
    angular: 'n' // 각도 반경 n(전체)
    metric: number[] // m
    selectedMetric: number
  }
  weights: {
    nain: number
    nach: number
    entranceDepth: number
    visibility: number
    traffic: number
    floorBonus: number
    frontage: number
  }
  floorAdjust: Record<string, number> // 층 보정값(층 id → 값). 높을수록 유리한 층
  grade: { sMax: number; aMax: number; bMax: number } // 상위 백분율 경계 (10, 35, 70)
  rent: { baseRentPerM2: number; multipliers: { S: number; A: number; B: number; C: number } }
  external: { beta: number } // 보행분 감쇠 계수
  simulation: { seed: number; agentCount: number }
}

export interface ScenarioOverrides {
  units?: Record<string, { category?: string; isAnchor?: boolean }>
  verticals?: Record<string, Partial<Vertical>>
  settings?: Partial<Settings>
}

export interface Scenario {
  id: string
  name: string
  overrides: ScenarioOverrides
}

export interface Project {
  meta: { name: string; site: string; createdAt: string; unit: 'm' }
  floors: Floor[]
  units: Unit[]
  corridors: Corridor[]
  unitDoors: UnitDoor[]
  entrances: Entrance[]
  verticals: Vertical[]
  external: ExternalFactors
  settings: Settings
  scenarios: Scenario[]
}
