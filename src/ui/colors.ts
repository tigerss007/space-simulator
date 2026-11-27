// 업종·층 색상. 앵커 업종은 진한 색을 쓴다.
export const CATEGORY_COLORS: Record<string, string> = {
  '대형F&B': '#e4572e',
  키즈: '#f2a900',
  엔터: '#9b5de5',
  카페: '#a47148',
  디저트: '#ef8fb4',
  편의: '#6c9a8b',
  식음: '#e07a5f',
  패션: '#3d85c6',
  잡화: '#7fb7be',
  병원: '#2a9d8f',
  학원: '#5c6bc0',
  서비스: '#8d99ae',
}
export const UNKNOWN_COLOR = '#b8bcc4'

export const FLOOR_COLORS = ['#5b8def', '#4cb782', '#f0a04b', '#d9624f', '#9b72cf', '#4bb3c4']
export const categoryColor = (c: string) => CATEGORY_COLORS[c] ?? UNKNOWN_COLOR

export const ENTRANCE_COLORS: Record<string, string> = {
  주출입구: '#d62839',
  부출입구: '#f2a900',
  지하철연결: '#1b6ca8',
  주차장연결: '#6c757d',
}

export const VERTICAL_COLORS: Record<string, string> = {
  escalator: '#e4572e',
  elevator: '#1b6ca8',
  stairs: '#6c757d',
  ramp: '#2a9d8f',
  bridge: '#9b5de5',
}
export const VERTICAL_LABELS: Record<string, string> = {
  escalator: '에스컬레이터',
  elevator: '엘리베이터',
  stairs: '계단',
  ramp: '경사로',
  bridge: '브릿지',
}

// 등급은 순서가 있는 값이라 한 가지 색의 진하기로 구분한다 (S가 가장 진함).
export const GRADE_COLORS: Record<string, string> = { S: '#08306b', A: '#2171b5', B: '#6baed6', C: '#c6dbef' }
export const GRADE_TEXT: Record<string, string> = { S: '#ffffff', A: '#ffffff', B: '#1d2433', C: '#1d2433' }
