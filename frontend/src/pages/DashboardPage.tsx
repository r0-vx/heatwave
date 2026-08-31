import { useCallback, useEffect, useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ErrorState, LoadingState } from '../components/LoadingState'
import { RiskMap, type MapMetric } from '../components/RiskMap'
import {
  clearApiCache,
  getAlerts,
  getDashboardSummary,
  getEvents,
  getWardBoundaries,
  getWards,
  refreshSystemStatus,
} from '../services/api'
import type { AlertLog, DashboardSummary, RiskCategory, SystemEvent, WardBoundaryCollection, WardSummary } from '../types'

const riskLabels: Record<RiskCategory, string> = { LOW: 'Low', CAUTION: 'Caution', HIGH: 'High', DANGEROUS: 'Dangerous', EXTREME: 'Extreme' }
const metricOrder: MapMetric[] = ['risk', 'htsi', 'wbgt', 'vulnerability']

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
}

function riskLevel(category: RiskCategory) {
  return category === 'LOW' ? 1 : category === 'CAUTION' ? 2 : category === 'HIGH' ? 3 : category === 'DANGEROUS' ? 3.5 : 4
}

function alertStatus(alert: AlertLog) {
  if (alert.delivery_confirmed) return { label: 'Delivered', detail: 'Delivery was confirmed by the provider.' }
  if (alert.simulated) return { label: 'Simulated', detail: 'No external message was sent.' }
  const status = alert.status.toUpperCase()
  if (status.includes('FAILED')) return { label: 'Failed', detail: alert.status.replaceAll('_', ' ') }
  if (status.includes('ACCEPTED')) return { label: 'Accepted', detail: 'The provider accepted the request; delivery is not confirmed.' }
  if (status.includes('QUEUED')) return { label: 'Queued', detail: alert.status.replaceAll('_', ' ') }
  if (status.includes('SENT')) return { label: 'Sent', detail: 'The request was sent; delivery is not confirmed.' }
  return { label: 'Draft', detail: alert.status.replaceAll('_', ' ') }
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [boundaries, setBoundaries] = useState<WardBoundaryCollection | null>(null)
  const [wards, setWards] = useState<WardSummary[]>([])
  const [tomorrowWards, setTomorrowWards] = useState<WardSummary[]>([])
  const [events, setEvents] = useState<SystemEvent[]>([])
  const [alerts, setAlerts] = useState<AlertLog[]>([])
  const [forecastDay, setForecastDay] = useState(0)
  const [metric, setMetric] = useState<MapMetric>('risk')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [summaryData, boundaryData, eventData, alertData, tomorrowData] = await Promise.all([
        getDashboardSummary(), getWardBoundaries(), getEvents(16), getAlerts(), getWards(1),
      ])
      setSummary(summaryData)
      setBoundaries(boundaryData)
      setWards(summaryData.wards)
      setTomorrowWards(tomorrowData)
      setEvents(eventData)
      setAlerts(alertData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load the Mumbai dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refreshSystemStatus()
      clearApiCache()
      await load()
    } finally {
      setRefreshing(false)
    }
  }, [load])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!summary) return
    void getWards(forecastDay).then(setWards).catch((err) => setError(err instanceof Error ? err.message : 'Unable to update the ward overview'))
  }, [forecastDay, summary])

  const topWards = useMemo(() => [...(summary?.wards ?? [])].sort((a, b) => b.htsi - a.htsi).slice(0, 5), [summary])

  if (loading) return <AppShell city="Mumbai"><LoadingState label="Loading Mumbai ward operations…" /></AppShell>
  if (error || !summary || !boundaries) return <AppShell city="Mumbai"><ErrorState message={error || 'No dashboard data returned.'} /></AppShell>

  const extremeCount = summary.wards.filter((ward) => ward.risk_category === 'EXTREME').length
  const highCount = summary.wards.filter((ward) => ['HIGH', 'DANGEROUS'].includes(ward.risk_category)).length
  const populationAtRisk = summary.wards.filter((ward) => ['HIGH', 'DANGEROUS', 'EXTREME'].includes(ward.risk_category)).reduce((total, ward) => total + ward.population, 0)

  return <AppShell city={summary.city} updatedAt={summary.as_of} onRefresh={() => void refresh()} refreshing={refreshing}>
    <div className="final-dashboard">
      <section className="final-map-panel" aria-label="Mumbai ward risk overview">
        <RiskMap boundaries={boundaries} wards={wards} metric={metric} onSelect={(id) => navigate(`/map?ward=${encodeURIComponent(id)}`)} onCycleMetric={() => setMetric((current) => metricOrder[(metricOrder.indexOf(current) + 1) % metricOrder.length])} />
        <div className="embedded-map-toolbar" aria-label="Map controls">
          <div className="map-control-group">{([['risk', 'Risk'], ['htsi', 'HTSI'], ['wbgt', 'WBGT'], ['vulnerability', 'Vulnerability']] as Array<[MapMetric, string]>).map(([id, label]) => <button key={id} className={metric === id ? 'selected' : ''} onClick={() => setMetric(id)}>{label}</button>)}</div>
          <div className="map-control-group forecast-controls">{[1, 2, 3].map((day) => <button key={day} className={forecastDay === day ? 'selected' : ''} onClick={() => setForecastDay(forecastDay === day ? 0 : day)}>+{day * 24}h</button>)}</div>
        </div>
      </section>

      <div className="right-analytics">
        <section className="reference-panel current-overview-panel">
          <PanelHeader title="Current Overview (Mumbai)" info={summary.disclaimer} fallback={summary.is_demo} />
          <div className="overview-primary">
            <Metric label="Temperature" value={`${summary.metrics.temperature.toFixed(1)}°C`} />
            <Metric label="WBGT" value={`${summary.metrics.wbgt.toFixed(1)}°C`} />
            <Metric label="HTSI" value={summary.metrics.htsi.toFixed(0)} />
            <div className="overview-metric"><span>Health Risk</span><RiskText category={summary.metrics.risk_category} /></div>
          </div>
          <div className="overview-secondary">
            <Metric label="Wards at Extreme Risk" value={String(extremeCount)} />
            <Metric label="Wards at High Risk" value={String(highCount)} />
            <Metric label="Population at Risk" value={`${(populationAtRisk / 100_000).toFixed(1)} L`} />
          </div>
        </section>

        <section className="reference-panel forecast-reference-panel">
          <PanelHeader title="5 Day Forecast (Max Risk for Mumbai)" action={<Link to="/forecast">View full</Link>} />
          <div className="forecast-status-row">{summary.forecast.slice(0, 5).map((day) => <button key={day.day_offset} onClick={() => navigate(`/forecast?step=${day.day_offset * 24}`)}><span>{day.day_offset === 0 ? 'Today' : `+${day.day_offset} Day`}</span><RiskText category={day.risk_category} /></button>)}</div>
          <ForecastLineChart rows={summary.forecast.slice(0, 5)} />
        </section>

        <section className="reference-panel top-wards-panel">
          <PanelHeader title="Top Wards by Risk" action={<Link to="/map">View all</Link>} />
          <div className="compact-table top-wards-table">
            <div className="compact-table-head"><span>Ward</span><span>Risk Level</span><span>HTSI</span><span>PVI</span><span>Trend</span></div>
            {topWards.map((ward) => {
              const tomorrow = tomorrowWards.find((row) => row.id === ward.id)
              const delta = (tomorrow?.htsi ?? ward.htsi) - ward.htsi
              return <button className="compact-table-row" key={ward.id} onClick={() => navigate(`/map?ward=${encodeURIComponent(ward.id)}`)}><span>{ward.code}</span><RiskText category={ward.risk_category} /><strong>{ward.htsi.toFixed(0)}</strong><strong>{ward.vulnerability_index.toFixed(0)}</strong><span className={`trend ${delta > 1 ? 'trend-up' : delta < -1 ? 'trend-down' : ''}`}>{delta > 1 ? '↗' : delta < -1 ? '↘' : '→'}</span></button>
            })}
          </div>
        </section>
      </div>

      <div className="bottom-operations">
        <section className="reference-panel recent-alerts-panel">
          <PanelHeader title="Recent Alerts" action={<Link to="/alerts">View all</Link>} />
          <div className="compact-table recent-alerts-table">
            <div className="compact-table-head"><span>Time</span><span>Ward</span><span>Severity</span><span>Message</span><span>Status</span></div>
            {alerts.slice(0, 4).map((alert) => {
              const ward = summary.wards.find((row) => row.id === alert.ward_id)
              const status = alertStatus(alert)
              return <div className="compact-table-row" key={alert.id}><time>{formatTime(alert.generated_at)}</time><span>{ward?.code ?? '—'}</span>{ward ? <RiskText category={ward.risk_category} /> : <span>—</span>}<span className="ellipsis-cell" title={alert.message}>{alert.message}</span><span className="compact-alert-status" title={status.detail}>{status.label}</span></div>
            })}
            {!alerts.length && <div className="compact-empty">No alert activity recorded</div>}
          </div>
        </section>

        <section className="reference-panel system-events-panel">
          <PanelHeader title="System Events" action={<Link to="/sources">View all</Link>} />
          <div className="compact-table system-events-table">
            <div className="compact-table-head"><span>Time</span><span>Event</span></div>
            {events.slice(0, 5).map((event) => <div className="compact-table-row" key={event.id}><time>{formatTime(event.timestamp)}</time><span className="ellipsis-cell" title={event.message}>{event.message}</span></div>)}
          </div>
        </section>
      </div>
    </div>
  </AppShell>
}

function PanelHeader({ title, action, info, fallback }: { title: string; action?: React.ReactNode; info?: string; fallback?: boolean }) {
  return <div className="reference-panel-head"><h2>{title}</h2><div>{fallback && <span className="data-mode-label">Fallback source</span>}{action}{info && <span className="panel-info" title={info}><Info size={11} /></span>}</div></div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="overview-metric"><span>{label}</span><strong>{value}</strong></div>
}

function RiskText({ category }: { category: RiskCategory }) {
  return <span className={`risk-inline risk-inline-${category.toLowerCase()}`}><i />{riskLabels[category]}</span>
}

function ForecastLineChart({ rows }: { rows: DashboardSummary['forecast'] }) {
  const values = rows.map((row) => riskLevel(row.risk_category))
  const points = values.map((value, index) => `${48 + index * 55},${82 - ((value - 1) / 3) * 58}`).join(' ')
  return <svg className="forecast-line-chart" viewBox="0 0 300 112" role="img" aria-label="Five day maximum risk trend">
    {[24, 43, 63, 82].map((y) => <line key={y} x1="42" x2="280" y1={y} y2={y} />)}
    {['Extreme', 'High', 'Moderate', 'Low'].map((label, index) => <text key={label} x="0" y={27 + index * 19}>{label}</text>)}
    <polyline points={points} />
    {rows.map((row, index) => {
      const x = 48 + index * 55
      const y = 82 - ((riskLevel(row.risk_category) - 1) / 3) * 58
      return <g key={row.day_offset}><circle className={`chart-dot chart-dot-${row.risk_category.toLowerCase()}`} cx={x} cy={y} r="3.2" /><text className="chart-day-label" x={x} y="105" textAnchor="middle">{row.day_offset === 0 ? 'Today' : `+${row.day_offset} Day`}</text></g>
    })}
  </svg>
}
