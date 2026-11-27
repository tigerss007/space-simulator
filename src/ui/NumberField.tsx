import { useEffect, useState } from 'react'

// 숫자 입력칸. 타이핑 중에는 자유롭게 두고, 유효한 숫자일 때만 값을 반영한다.
export function NumberField({
  value, onChange, step = 1, min, max, width = 64, label,
}: {
  value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; width?: number; label?: string
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  return (
    <input
      type="number"
      aria-label={label}
      style={{ width }}
      value={text}
      step={step}
      min={min}
      max={max}
      onChange={(e) => {
        setText(e.target.value)
        const v = parseFloat(e.target.value)
        if (Number.isFinite(v) && (min === undefined || v >= min) && (max === undefined || v <= max)) onChange(v)
      }}
    />
  )
}
