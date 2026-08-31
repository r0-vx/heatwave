import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Database,
  ExternalLink,
  Gauge,
  Info,
  Layers3,
  MapPinned,
  RefreshCw,
  ShieldAlert,
  ThermometerSun,
  UsersRound,
  Wind,
  X,
  Zap,
} from 'lucide-react'
import { AppShell } from '../components/AppShell'
import { ErrorState, LoadingState } from '../components/LoadingState'
import { RiskBadge } from '../components/RiskBadge'
import { RiskMap, type MapMetric } from '../components/RiskMap'
import {
  clearApiCache,
  getActionPlan,
  getDashboardSummary,
  getEvents,
  getSystemStatus,
  getWardBoundaries,
  getWards,
  refreshSystemStatus,
  updateActionTask,
} from '../services/api'
import type { ActionPlan, DashboardSummary, RiskCategory, SystemEvent, SystemStatus, WardBoundaryCollection, WardSummary } from '../types'

const riskOptions: Array<'ALL' | RiskCategory> = ['ALL', 'LOW', 'CAUTION', 'HIGH', 'DANGEROUS', 'EXTREME']
const layerOptions: Array<{ id: MapMetric; label: string }> = [
  { id: 'risk', label: 'Risk' },
  { id: 'htsi', label: 'HTSI' },
  { id: 'wbgt', label: 'WBGT' },
  { id: 'vulnerability', label: 'PVI' },
  { id: 'health', label: 'Health' },
]

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [boundaries, setBoundaries] = useState<WardBoundaryCollection | null>(null)
  const [wards, setWards] = useState<WardSummary[]>([])
  const [events, setEvents] = useState<SystemEvent[]>([])
  const [system, setSystem] = useState<SystemStatus | null>(null)
  const [plan, setPlan] = useState<ActionPlan | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [forecastDay, setForecastDay] = useState(0)
  const [riskFilter, setRiskFilter] = useState<'ALL' | RiskCategory>('ALL')
  const [vulnerability, setVulnerability] = useState('0')
  const [metric, setMetric] = useState<MapMetric>('risk')
  const [loading, setLoading] = useState(true)
  const [mapLoading, setMapLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [summaryData, boundaryData, eventData, systemData] = await Promise.all([
        getDashboardSummary(), getWardBoundaries(), getEvents(12), getSystemStatus(),
      ])
      setSummary(summaryData)
      setBoundaries(boundaryData)
      setWards(summaryData.wards)
      setEvents(eventData)
      setSystem(systemData)
      setSelectedId((current) => current || summaryData.metrics.highest_risk_ward_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load the municipal control room')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!summary) return
    setMapLoading(true)
    void getWards(forecastDay, riskFilter === 'ALL' ? undefined : riskFilter, Number(vulnerability) || undefined)
      .then(setWards)
      .catch((err) => setError(err instanceof Error ? err.message : 'The selected forecast layer could not be loaded'))
      .finally(() => setMapLoading(false))
  }, [forecastDay, riskFilter, vulnerability, summary])
  useEffect(() => {
    if (!selectedId || !drawerOpen) return
    void getActionPlan(selectedId, forecastDay).then(setPlan).catch(() => setPlan(null))
  }, [selectedId, forecastDay, drawerOpen])

  const allRows = summary?.wards ?? []
  const selectedWard = useMemo(() => {
    const rows = wards.length ? wards : allRows
    return rows.find((ward) => ward.id === selectedId) ?? allRows.find((ward) => ward.id === selectedId) ?? rows[0]
  }, [wards, allRows, selectedId])
  const filteredHighCount = wards.filter((ward) => ['HIGH', 'DANGEROUS', 'EXTREME'].includes(ward.risk_category)).length
  const demoActive = Boolean(summary?.is_demo)

  const chooseWard = (id: string) => {
    setSelectedId(id)
    setDrawerOpen(true)
  }
  const refresh = async () => {
    setRefreshing(true)
    try {
      await refreshSystemStatus()
      clearApiCache()
      await load()
    } finally {
      setRefreshing(false)
    }
  }
  const advanceTask = async (taskKey: string, current: ActionPlan['actions'][number]['status']) => {
    if (!selectedWard) return
    const next = current === 'PENDING' ? 'ACKNOWLEDGED' : current === 'ACKNOWLEDGED' ? 'IN_PROGRESS' : 'COMPLETE'
    const updated = await updateActionTask(selectedWard.id, taskKey, next, forecastDay)
    setPlan(updated)
    clearApiCache()
    setEvents(await getEvents(12))
  }

  if (loading) return <AppShell city="Mumbai"><LoadingState label="Loading BMC ward operations…" /></AppShell>
  if (error || !summary || !boundaries) return <AppShell city="Mumbai"><ErrorState message={error || 'No operational data returned.'} /></AppShell>

  return <AppShell source={demoActive ? 'DEMO FALLBACK' : 'IMD CONNECTED'} city={summary.city}>
    <div className="ops-page-head">
      <div>
        <div className="ops-eyebrow"><span />MUMBAI HEAT-HEALTH OPERATIONS</div>
        <h1>Municipal control room</h1>
        <p>Ward-scale thermal stress, vulnerability and response posture for BMC operators.</p>
      </div>
      <div className="ops-head-actions">
        <span className="snapshot-time"><Clock3 size={13} />Snapshot {new Date(summary.as_of).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST</span>
        <button className="ops-button" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={14} className={refreshing ? 'spin' : ''} />{refreshing ? 'Checking sources' : 'Refresh status'}</button>
        <Link to="/alerts" className="ops-button ops-button-primary"><ShieldAlert size={14} />Alert console</Link>
      </div>
    </div>

    {demoActive && <div className="fallback-banner"><AlertTriangle size={16} /><div><strong>OFFICIAL WEATHER FEED UNAVAILABLE — DEMO FALLBACK ACTIVE</strong><span>{summary.source}. Actual BMC polygons remain in use; demographic and health-outcome limitations are preserved in every ward record.</span></div><Link to="/sources">Inspect provenance <ArrowRight size={13} /></Link></div>}

    <section className="ops-kpi-strip" aria-label="Current city heat-health posture">
      <FlatKpi icon={<Gauge />} label="Peak HTSI" value={summary.metrics.htsi.toFixed(0)} unit="/100" detail={summary.metrics.risk_category} tone="red" />
      <FlatKpi icon={<ThermometerSun />} label="Peak heat index" value={summary.metrics.heat_index.toFixed(1)} unit="°C" detail="apparent temperature" tone="amber" />
      <FlatKpi icon={<Wind />} label="Peak WBGT" value={summary.metrics.wbgt.toFixed(1)} unit="°C" detail="estimated" tone="orange" />
      <FlatKpi icon={<UsersRound />} label="Priority wards" value={String(summary.metrics.high_risk_ward_count)} unit="/24" detail="high or above" tone="red" />
      <FlatKpi icon={<MapPinned />} label="Highest risk" value={summary.metrics.highest_risk_ward.split('·')[0].trim()} detail={summary.metrics.highest_risk_ward.split('·')[1]?.trim() ?? ''} tone="teal" />
    </section>

    <section className="ops-map-section">
      <div className="ops-map-toolbar">
        <div className="toolbar-title"><Layers3 size={15} /><span><strong>Ward risk surface</strong><small>Click a polygon to open the operational drawer</small></span></div>
        <div className="layer-tabs">{layerOptions.map((option) => <button key={option.id} className={metric === option.id ? 'active' : ''} onClick={() => setMetric(option.id)}>{option.label}</button>)}</div>
        <label className="ops-select">FORECAST<select value={forecastDay} onChange={(event) => setForecastDay(Number(event.target.value))}>{summary.forecast.map((day) => <option value={day.day_offset} key={day.day_offset}>{day.label} · {new Date(day.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</option>)}</select></label>
        <label className="ops-select">RISK<select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as typeof riskFilter)}>{riskOptions.map((option) => <option value={option} key={option}>{option === 'ALL' ? 'ALL WARDS' : option}</option>)}</select></label>
        <label className="ops-select">MIN PVI<select value={vulnerability} onChange={(event) => setVulnerability(event.target.value)}><option value="0">ANY</option><option value="50">50+</option><option value="65">65+</option><option value="75">75+</option></select></label>
      </div>
      <div className="ops-map-stage">
        {mapLoading && <div className="map-update-chip"><RefreshCw size={12} className="spin" />Updating risk attributes</div>}
        <RiskMap boundaries={boundaries} wards={wards} selectedId={selectedWard?.id} metric={metric} onSelect={chooseWard} />
        <div className="map-filter-count"><CircleDot size={11} />{wards.length} visible wards · {filteredHighCount} priority</div>
        <aside className={`ward-drawer ${drawerOpen && selectedWard ? 'ward-drawer-open' : ''}`} aria-hidden={!drawerOpen}>
          {selectedWard && <>
            <div className="drawer-head"><div><span>{selectedWard.code} WARD · {forecastDay === 0 ? 'TODAY' : `DAY +${forecastDay}`}</span><h2>{selectedWard.locality}</h2></div><button onClick={() => setDrawerOpen(false)} aria-label="Close ward drawer"><X size={17} /></button></div>
            <div className="drawer-risk"><RiskBadge category={selectedWard.risk_category} /><span>HTSI <strong>{selectedWard.htsi.toFixed(0)}</strong>/100</span><span>HEALTH <strong>{selectedWard.health_risk.toFixed(0)}</strong>/100</span></div>
            <div className="drawer-metrics"><div><span>TEMP</span><strong>{selectedWard.temperature.toFixed(1)}°C</strong></div><div><span>WBGT</span><strong>{selectedWard.wbgt.toFixed(1)}°C</strong></div><div><span>UTCI</span><strong>{selectedWard.utci.toFixed(1)}°C</strong></div><div><span>PVI</span><strong>{selectedWard.vulnerability_index.toFixed(0)}</strong></div></div>
            <div className="drawer-section"><div className="drawer-section-title">WHY THIS RATING <Info size={12} /></div>{selectedWard.explanation.slice(0, 4).map((reason) => <p className="drawer-driver" key={reason}><ChevronRight size={12} />{reason}</p>)}</div>
            <div className="drawer-section"><div className="drawer-section-title">RESPONSE TASKS <Zap size={12} /></div>{plan ? plan.actions.slice(0, 3).map((task) => <div className="drawer-task" key={task.task_key}><div><span className={`severity-tag severity-${task.severity.toLowerCase()}`}>{task.severity}</span><strong>{task.title}</strong><small>{task.owner}</small></div><button disabled={task.status === 'COMPLETE'} onClick={() => void advanceTask(task.task_key, task.status)}>{task.status === 'PENDING' ? 'Acknowledge' : task.status === 'ACKNOWLEDGED' ? 'Start' : task.status === 'IN_PROGRESS' ? 'Complete' : <><CheckCircle2 size={12} />Complete</>}</button></div>) : <span className="drawer-loading">Loading response tasks…</span>}</div>
            <div className="drawer-source"><Database size={13} /><span><strong>Weather</strong>{selectedWard.source}</span></div>
            <div className="drawer-actions"><Link to={`/ward/${selectedWard.id}`}>Full ward brief <ExternalLink size={12} /></Link><Link to={`/alerts?ward=${selectedWard.id}`}>Prepare alert <ShieldAlert size={12} /></Link></div>
          </>}
        </aside>
      </div>
    </section>

    <section className="forecast-rail">
      <div className="rail-label"><span>6-DAY POSTURE</span><small>Select forecast layer</small></div>
      {summary.forecast.map((day) => <button key={day.day_offset} className={forecastDay === day.day_offset ? 'active' : ''} onClick={() => setForecastDay(day.day_offset)}><span>{day.label}</span><strong>{day.max_htsi.toFixed(0)}</strong><small>{day.high_risk_ward_count} priority · {day.risk_category}</small></button>)}
    </section>

    <section className="ops-lower-grid">
      <div className="ops-panel priority-panel">
        <div className="ops-panel-head"><div><span>PRIORITY QUEUE</span><h2>Highest-risk wards</h2></div><Link to="/explorer">Open table <ArrowRight size={13} /></Link></div>
        <div className="ops-ward-table"><div className="ops-table-head"><span>WARD</span><span>HTSI</span><span>PVI</span><span>POSTURE</span></div>{[...wards].sort((a, b) => b.htsi - a.htsi).slice(0, 6).map((ward) => <button key={ward.id} onClick={() => chooseWard(ward.id)}><span><b>{ward.code}</b><em>{ward.locality}</em></span><strong>{ward.htsi.toFixed(0)}</strong><strong>{ward.vulnerability_index.toFixed(0)}</strong><RiskBadge category={ward.risk_category} compact /></button>)}</div>
      </div>
      <div className="ops-panel event-panel">
        <div className="ops-panel-head"><div><span>AUDIT STREAM</span><h2>System events</h2></div><Link to="/sources">Sources <ArrowRight size={13} /></Link></div>
        <div className="event-stream">{events.slice(0, 6).map((event) => <div className="event-row" key={event.id}><span className={`event-dot event-${event.severity.toLowerCase()}`} /><time>{new Date(event.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</time><div><strong>{event.category.replaceAll('_', ' ')}</strong><p>{event.message}</p><small>{event.source}</small></div></div>)}</div>
      </div>
      <div className="ops-panel posture-panel">
        <div className="ops-panel-head"><div><span>INFRASTRUCTURE</span><h2>System posture</h2></div><CircleDot size={15} /></div>
        <div className="component-list">{system?.components.map((component) => <div key={component.name}><span className={`component-status status-${component.status.toLowerCase().replaceAll('_', '-')}`} /><p><strong>{component.name}</strong><small>{component.detail}</small></p><em>{component.status.replaceAll('_', ' ')}</em></div>)}</div>
      </div>
    </section>
  </AppShell>
}

function FlatKpi({ icon, label, value, unit, detail, tone }: { icon: React.ReactNode; label: string; value: string; unit?: string; detail: string; tone: string }) {
  return <div className={`flat-kpi kpi-${tone}`}><span className="flat-kpi-icon">{icon}</span><div><span>{label}</span><strong>{value}<small>{unit}</small></strong><em>{detail}</em></div></div>
}
