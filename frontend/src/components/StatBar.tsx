export function StatBar({ label, value, display, tone = 'blue' }: { label: string; value: number; display?: string; tone?: string }) {
  return <div className="stat-bar-row"><div className="stat-bar-label"><span>{label}</span><strong>{display ?? `${value.toFixed(0)}%`}</strong></div><div className="stat-bar-track"><span className={`stat-bar-fill fill-${tone}`} style={{ width: `${Math.min(100, Math.max(3, value))}%` }} /></div></div>
}
