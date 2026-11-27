import type { Project, Vec2 } from '../model/types'
import { clearFloorContent, normalizeProject, polygonArea, rectPolygon, uid } from './ops'

// ===== 기본 도형 템플릿 =====
// 선택한 층에 복도·호실·주출입구를 만들어 준다. 호실 업종은 비워 두고, 문은 자동으로 배치한다.

export type TemplateId = 'rect' | 'ell' | 'atrium'

export const TEMPLATES: { id: TemplateId; name: string; desc: string }[] = [
  { id: 'rect', name: '직사각형 몰', desc: '80m × 40m, 중앙 복도 양쪽에 호실 20개' },
  { id: 'ell', name: 'ㄱ자 몰', desc: '꺾인 복도 양쪽에 호실 약 20개' },
  { id: 'atrium', name: 'ㅁ자 아트리움', desc: '가운데가 비어 있는 순환 복도, 호실 20개' },
]

interface Shape {
  corridors: Vec2[][]
  units: [Vec2, Vec2][] // 사각형 두 모서리
  entrance: Vec2
}

const row = (x0: number, x1: number, y0: number, y1: number, w: number): [Vec2, Vec2][] => {
  const out: [Vec2, Vec2][] = []
  for (let x = x0; x + w <= x1 + 1e-9; x += w) out.push([[x, y0], [x + w, y1]])
  return out
}
const col = (x0: number, x1: number, y0: number, y1: number, h: number): [Vec2, Vec2][] => {
  const out: [Vec2, Vec2][] = []
  for (let y = y0; y + h <= y1 + 1e-9; y += h) out.push([[x0, y], [x1, y + h]])
  return out
}

function shapeOf(id: TemplateId): Shape {
  if (id === 'rect') {
    return {
      corridors: [[[0, 20], [80, 20]]],
      units: [...row(0, 80, 24, 38, 8), ...row(0, 80, 2, 16, 8)],
      entrance: [0, 20],
    }
  }
  if (id === 'ell') {
    // 가로 복도(y=40) + 세로 복도(x=60)가 ㄱ자로 꺾인다
    return {
      corridors: [[[0, 40], [60, 40], [60, 2]]],
      units: [
        ...row(0, 56, 44, 58, 8), // 가로 복도 북쪽
        ...row(0, 56, 22, 36, 8), // 가로 복도 남쪽
        ...col(64, 78, 4, 36, 8), // 세로 복도 동쪽
        ...col(42, 56, 2, 18, 8), // 세로 복도 서쪽
      ],
      entrance: [0, 40],
    }
  }
  // 아트리움: 순환 복도 중심선 (18,18)-(70,42), 가운데(22~66, 22~38)는 비워 둔다.
  // 네 모서리는 복도에 닿지 않으므로 호실을 두지 않는다.
  return {
    corridors: [[[18, 18], [70, 18], [70, 42], [18, 42], [18, 18]]],
    units: [
      ...row(14, 74, 0, 14, 10), // 남
      ...row(14, 74, 46, 60, 10), // 북
      ...col(0, 14, 14, 46, 8), // 서
      ...col(74, 88, 14, 46, 8), // 동
    ],
    entrance: [18, 30],
  }
}

// 템플릿을 지정한 층에 적용한다. 그 층의 기존 호실·복도·출입구는 지워진다.
export function applyTemplate(p: Project, floorId: string, id: TemplateId): Project {
  const base = clearFloorContent(p, floorId)
  const shape = shapeOf(id)
  const floor = p.floors.find((f) => f.id === floorId)
  const corridors = shape.corridors.map((points) => ({ id: uid('cor'), floorId, points }))
  const units = shape.units.map(([a, b], i) => {
    const polygon = rectPolygon(a, b)
    return {
      id: uid('u'), floorId, name: `${floor?.name ?? ''}-${i + 1}`, polygon,
      area: polygonArea(polygon), frontageWidth: 0, category: '', isAnchor: false, locked: false,
    }
  })
  return normalizeProject({
    ...base,
    corridors: [...base.corridors, ...corridors],
    units: [...base.units, ...units],
    entrances: [...base.entrances, { id: uid('ent'), floorId, point: shape.entrance, name: '주출입구', type: '주출입구' }],
  })
}
