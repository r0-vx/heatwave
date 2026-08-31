import type { RiskCategory } from '../types'

const labels: Record<RiskCategory, string> = {
  LOW: 'Low',
  CAUTION: 'Caution',
  HIGH: 'High',
  DANGEROUS: 'Dangerous',
  EXTREME: 'Extreme',
}

export function RiskBadge({ category, compact = false }: { category: RiskCategory; compact?: boolean }) {
  return <span className={`risk-badge risk-${category.toLowerCase()} ${compact ? 'risk-badge-compact' : ''}`}><span className="risk-dot" />{labels[category]}</span>
}
