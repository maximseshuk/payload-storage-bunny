import type { ReactNode } from 'react'

interface ColumnsProps {
  cols?: 2 | 3
  children?: ReactNode
}

export default function Columns({ cols = 2, children }: ColumnsProps) {
  return (
    <div className="rp-columns" data-cols={cols}>
      {children}
    </div>
  )
}
