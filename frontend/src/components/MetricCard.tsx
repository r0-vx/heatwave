import type { ReactNode } from 'react'

export function MetricCard({ label, value, unit, detail, icon, accent = 'blue' }: {
  label: string
  value: string | number
  unit?: string
  detail?: ReactNode
  icon: ReactNode
  accent?: 'blue' | 'amber' | 'red' | 'teal' | 'violet'
}) {
  return <article className={`metric-card metric-${accent}`}>
    <div className="metric-topline"><span>{label}</span><span className="metric-icon">{icon}</span></div>
    <div className="metric-value">{value}<small>{unit}</small></div>
    {detail && <div className="metric-detail">{detail}</div>}
  </article>
}
