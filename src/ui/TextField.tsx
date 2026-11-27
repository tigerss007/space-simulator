import { useEffect, useState } from 'react'

// 글자 입력칸. 입력이 끝났을 때(포커스를 잃거나 Enter) 한 번만 값을 반영한다. (되돌리기 기록이 글자마다 쌓이지 않게)
export function TextField({ value, onCommit, list, width, label, placeholder }: {
  value: string; onCommit: (v: string) => void; list?: string; width?: number | string; label?: string; placeholder?: string
}) {
  const [t, setT] = useState(value)
  useEffect(() => setT(value), [value])
  const done = () => { if (t !== value) onCommit(t) }
  return (
    <input
      aria-label={label} list={list} placeholder={placeholder} style={{ width: width ?? '100%' }} value={t}
      onChange={(e) => setT(e.target.value)} onBlur={done}
      onKeyDown={(e) => { if (e.key === 'Enter') { done(); (e.target as HTMLInputElement).blur() } }}
    />
  )
}
