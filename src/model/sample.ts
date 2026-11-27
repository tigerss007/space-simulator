import type { Project, Unit, Corridor, UnitDoor, Floor, Vec2 } from './types'
import { defaultSettings } from './defaults'

// 샘플 프로젝트: 지하 1층(지하철 연결) + 지상 1~3층, 중앙 아트리움.
// 건물 80m × 40m, 중앙 복도(y=20)를 사이에 두고 북·남 호실 열이 있고,
// x=32~48 구간은 아트리움(보이드)이라 호실이 없다. 층당 호실 16개.

const FLOORS: Floor[] = [
  { id: 'B1', name: 'B1', level: -1, elevation: -4.5, height: 4.5 },
  { id: '1F', name: '1F', level: 0, elevation: 0, height: 5 },
  { id: '2F', name: '2F', level: 1, elevation: 5, height: 4.5 },
  { id: '3F', name: '3F', level: 2, elevation: 9.5, height: 4.5 },
]

// 아트리움 왼쪽(0~32m)과 오른쪽(48~80m) 호실 폭
const LEFT_WIDTHS = [10, 6, 8, 8]
const RIGHT_WIDTHS = [8, 10, 6, 8]
const DEPTH = 14

// 층별 업종 순서 (북열 8개 → 남열 8개). 앵커는 배치안(시나리오)에서 지정한다.
const CATEGORIES: Record<string, string[]> = {
  B1: ['편의', '디저트', '카페', '식음', '식음', '카페', '디저트', '편의', '편의', '식음', '카페', '디저트', '식음', '카페', '편의', '디저트'],
  '1F': ['카페', '디저트', '패션', '잡화', '패션', '잡화', '디저트', '카페', '편의', '패션', '잡화', '패션', '패션', '잡화', '카페', '편의'],
  '2F': ['패션', '잡화', '서비스', '카페', '패션', '서비스', '잡화', '패션', '잡화', '패션', '카페', '서비스', '패션', '잡화', '서비스', '패션'],
  '3F': ['병원', '학원', '서비스', '식음', '식음', '학원', '병원', '서비스', '학원', '병원', '식음', '서비스', '서비스', '식음', '학원', '병원'],
}

function buildFloor(floor: Floor) {
  const units: Unit[] = []
  const doors: UnitDoor[] = []
  const cats = CATEGORIES[floor.id]
  let idx = 0
  for (const row of ['N', 'S'] as const) {
    const y0 = row === 'N' ? 24 : 2 // 북열은 y 24~38, 남열은 y 2~16
    let x = 0
    const widths = [...LEFT_WIDTHS, ...RIGHT_WIDTHS]
    widths.forEach((w, i) => {
      if (i === LEFT_WIDTHS.length) x = 48 // 아트리움 건너뛰기
      const id = `${floor.id}-${row}${i + 1}`
      const polygon: Vec2[] = [
        [x, y0],
        [x + w, y0],
        [x + w, y0 + DEPTH],
        [x, y0 + DEPTH],
      ]
      units.push({
        id,
        floorId: floor.id,
        name: `${floor.name}-${row}${i + 1}`,
        polygon,
        area: w * DEPTH,
        frontageWidth: w,
        category: cats[idx],
        isAnchor: false,
        locked: false,
      })
      doors.push({ unitId: id, corridorId: `cor-${floor.id}`, point: [x + w / 2, row === 'N' ? 24 : 16] })
      x += w
      idx++
    })
  }
  const corridors: Corridor[] = [{ id: `cor-${floor.id}`, floorId: floor.id, points: [[0, 20], [80, 20]] }]
  // 1F: 대로변 출입구(남측)에서 아트리움을 지나 중앙 복도로 이어지는 진입 동선
  if (floor.id === '1F') corridors.push({ id: 'cor-1F-atrium', floorId: '1F', points: [[40, 0], [40, 20]] })
  return { units, doors, corridors }
}

export function createSampleProject(): Project {
  const built = FLOORS.map(buildFloor)
  const allFloorIds = FLOORS.map((f) => ({ id: f.id }))
  const upper = ['1F', '2F', '3F']
  const pts = (ids: string[], p: Vec2) => ids.map((floorId) => ({ floorId, point: p }))
  const all = allFloorIds.map((f) => f.id)

  return {
    meta: { name: '샘플: 중규모 복합 상업시설', site: '가상 부지 (예시)', createdAt: '2026-01-01T00:00:00.000Z', unit: 'm' },
    floors: FLOORS,
    units: built.flatMap((b) => b.units),
    corridors: built.flatMap((b) => b.corridors),
    unitDoors: built.flatMap((b) => b.doors),
    entrances: [
      { id: 'ent-blvd', floorId: '1F', point: [40, 0], name: '대로변 주출입구', type: '주출입구' },
      { id: 'ent-apt', floorId: '1F', point: [80, 20], name: '아파트 단지 쪽 주출입구', type: '주출입구' },
      { id: 'ent-subway', floorId: 'B1', point: [0, 20], name: '지하철 연결', type: '지하철연결' },
    ],
    verticals: [
      {
        id: 'esc-atrium', name: '중앙 아트리움 에스컬레이터', type: 'escalator',
        connects: pts(all, [44, 20]),
        escalator: { direction: 'both', layout: 'continuous' },
        voidVisible: true,
      },
      {
        id: 'esc-west', name: '서측 분절형 에스컬레이터', type: 'escalator',
        connects: pts(upper, [8, 20]),
        escalator: { direction: 'both', layout: 'scissor' },
      },
      { id: 'elev-1', name: '엘리베이터 1', type: 'elevator', connects: pts(all, [20, 20]), elevator: { avgWaitSec: 25 } },
      { id: 'elev-2', name: '엘리베이터 2', type: 'elevator', connects: pts(all, [66, 20]), elevator: { avgWaitSec: 30 } },
      { id: 'stair-w', name: '서측 계단', type: 'stairs', connects: pts(all, [2, 20]) },
      { id: 'stair-e', name: '동측 계단', type: 'stairs', connects: pts(all, [78, 20]) },
    ],
    external: {
      residential: {
        bands: [
          { walkMin: 5, households: 1200, avgPriceIndex: 1.1, childHouseholdRatio: 0.32 },
          { walkMin: 10, households: 3500, avgPriceIndex: 1.0, childHouseholdRatio: 0.28 },
          { walkMin: 15, households: 6000, avgPriceIndex: 0.95, childHouseholdRatio: 0.24 },
        ],
      },
      nearbyCommercial: [
        { name: '역세권 먹자골목', walkDistanceM: 300, storeCount: 80, linkStrength: 0.6, barrier: '대로', complementarity: 0.7, directionEntranceId: 'ent-blvd' },
      ],
      largeRetail: [{ name: '대형마트', type: '대형마트', gfa: 18000, distanceBand: '중거리', directionEntranceId: 'ent-blvd' }],
      transit: [{ name: '지하철역', dailyRidership: 40000, walkDistanceM: 60, directionEntranceId: 'ent-subway' }],
      attractors: [{ name: '학원가', type: '학원가', size: 40, walkDistanceM: 250, directionEntranceId: 'ent-apt' }],
    },
    settings: { ...defaultSettings(), floorAdjust: { B1: 0.3, '1F': 1, '2F': 0.5, '3F': 0 } },
    scenarios: [
      { id: 'scn-a', name: '배치안 A: 앵커 3층', overrides: { units: anchorOverrides('3F') } },
      { id: 'scn-b', name: '배치안 B: 앵커 1층', overrides: { units: anchorOverrides('1F') } },
    ],
  }
}

// 앵커 3곳(대형 F&B / 키즈 / 엔터)을 지정 층의 깊은 자리(복도 양 끝 쪽)에 둔다.
function anchorOverrides(floorId: string) {
  return {
    [`${floorId}-N1`]: { category: '대형F&B', isAnchor: true },
    [`${floorId}-S8`]: { category: '키즈', isAnchor: true },
    [`${floorId}-N8`]: { category: '엔터', isAnchor: true },
  }
}
