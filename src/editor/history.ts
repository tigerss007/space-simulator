// 되돌리기/다시하기 기록. Project는 불변으로 다루므로 참조만 쌓아도 가볍다.
export interface History<T> { past: T[]; future: T[] }
export const MAX_HISTORY = 100

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [] })

export function pushHistory<T>(h: History<T>, current: T): History<T> {
  const past = [...h.past, current]
  if (past.length > MAX_HISTORY) past.shift()
  return { past, future: [] }
}

export function undo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (!h.past.length) return null
  const value = h.past[h.past.length - 1]
  return { value, history: { past: h.past.slice(0, -1), future: [current, ...h.future] } }
}

export function redo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (!h.future.length) return null
  const [value, ...rest] = h.future
  return { value, history: { past: [...h.past, current], future: rest } }
}
