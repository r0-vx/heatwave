import { useCallback, useEffect, useMemo, useState } from 'react'
import { Info, PanelRightClose, PanelRightOpen, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ErrorState, LoadingState } from '../components/LoadingState'
import { RiskBadge } from '../components/RiskBadge'
import { RiskMap, type MapMetric, type RiskGroup, type RiskVisibility } from '../components/RiskMap'
import { WardContextPanel, type WardPanelTab } from '../components/WardContextPanel'
import { clearApiCache, getActionPlan, getAlerts, getDashboardSummary, getWardBoundaries, getWardForecast, getWards, refreshSystemStatus } from '../services/api'
import type { ActionPlan, AlertLog, DashboardSummary, RiskCategory, WardBoundaryCollection, WardSummary } from '../types'

type WorkspaceMode = 'map' | 'forecast'

const metrics: Array<[MapMetric, string]> = [['risk', 'Risk'], ['htsi', 'HTSI'], ['wbgt', 'WBGT'], ['vulnerability', 'Vulnerability']]
const metricOrder: MapMetric[] = metrics.map(([id]) => id)
const allRiskVisible: RiskVisibility = { low: true, moderate: true, high: true, extreme: true }
const forecastSteps = [
  { hours: 0, label: 'NOW', day: 0 },
  { hours: 6, label: '+6H', day: 0 },
  { hours: 12, label: '+12H', day: 0 },
  { hours: 24, label: '+24H', day: 1 },
  { hours: 48, label: '+48H', day: 2 },
  { hours: 72, label: '+72H', day: 3 },
  { hours: 96, label: '+4D', day: 4 },
  { hours: 120, label: '+5D', day: 5 },
]

const validTabs: WardPanelTab[] = ['overview', 'thermal', 'vulnerability', 'forecast', 'actions', 'sources']
const validRiskFilters: Array<'ALL' | RiskCategory> = ['ALL', 'LOW', 'CAUTION', 'HIGH', 'DANGEROUS', 'EXTREME']
const riskRank = (risk: RiskCategory) => risk === 'EXTREME' ? 5 : risk === 'DANGEROUS' ? 4 : risk === 'HIGH' ? 3 : risk === 'CAUTION' ? 2 : 1
const riskGroup = (risk: RiskCategory): RiskGroup => risk === 'LOW' ? 'low' : risk === 'CAUTION' ? 'moderate' : risk === 'EXTREME' ? 'extreme' : 'high'

export function MapPage() {
  return <SpatialWorkspacePage mode="map" />
}

export function ForecastPage() {
  return <SpatialWorkspacePage mode="forecast" />
}

function SpatialWorkspacePage({ mode }: { mode: WorkspaceMode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const initialParams = useMemo(() => new URLSearchParams(location.search), [])
  const requestedStep = Number(initialParams.get('step'))
  const requestedDay = Number(initialParams.get('day'))
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [boundaries, setBoundaries] = useState<WardBoundaryCollection | null>(null)
  const [alerts, setAlerts] = useState<AlertLog[]>([])
  const [wards, setWards] = useState<WardSummary[]>([])
  const [selectedId, setSelectedId] = useState(initialParams.get('ward') ?? '')
  const [metric, setMetric] = useState<MapMetric>('risk')
  const [forecastHours, setForecastHours] = useState(forecastSteps.some((step) => step.hours === requestedStep) ? requestedStep : 0)
  const [mapDay, setMapDay] = useState(Number.isInteger(requestedDay) && requestedDay >= 0 && requestedDay <= 3 ? requestedDay : 0)
  const [riskFilter, setRiskFilter] = useState<'ALL' | RiskCategory>(() => {
    const risk = initialParams.get('risk') as 'ALL' | RiskCategory | null
    return risk && validRiskFilters.includes(risk) ? risk : 'ALL'
  })
  const [riskVisibility, setRiskVisibility] = useState<RiskVisibility>(allRiskVisible)
  const [focusExtreme, setFocusExtreme] = useState(false)
  const [panelOpen, setPanelOpen] = useState(true)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const activeForecastStep = forecastSteps.find((step) => step.hours === forecastHours) ?? forecastSteps[0]
  const forecastDay = mode === 'forecast' ? activeForecastStep.day : mapDay

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [summaryData, boundaryData, alertRows] = await Promise.all([getDashboardSummary(), getWardBoundaries(), getAlerts()])
      setSummary(summaryData)
      setBoundaries(boundaryData)
      setAlerts(alertRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load the Mumbai map workspace')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!summary) return
    setError('')
    void getWards(forecastDay, riskFilter === 'ALL' ? undefined : riskFilter)
      .then((rows) => setWards([...rows]))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to update ward forecast data'))
  }, [forecastDay, forecastHours, riskFilter, summary])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    setSelectedId(params.get('ward') ?? '')
    const step = Number(params.get('step'))
    if (mode === 'forecast' && forecastSteps.some((item) => item.hours === step)) setForecastHours(step)
    const day = Number(params.get('day'))
    if (mode === 'map' && Number.isInteger(day) && day >= 0 && day <= 3) setMapDay(day)
    const requestedRisk = params.get('risk') as 'ALL' | RiskCategory | null
    setRiskFilter(requestedRisk && validRiskFilters.includes(requestedRisk) ? requestedRisk : 'ALL')
    if (requestedRisk === 'EXTREME') {
      setRiskVisibility({ low: false, moderate: false, high: false, extreme: true })
      setFocusExtreme(true)
    }
    if (params.get('command') === 'reset-map') {
      window.setTimeout(() => window.dispatchEvent(new Event('heatshield:reset-map')), 80)
      params.delete('command')
      navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : '' }, { replace: true })
    }
  }, [location.pathname, location.search, mode, navigate])

  useEffect(() => {
    const timer = window.setTimeout(() => window.dispatchEvent(new Event('heatshield:layout-change')), 190)
    return () => window.clearTimeout(timer)
  }, [panelOpen])

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedId) closeWard()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  })

  const selectedWard = useMemo(() => wards.find((ward) => ward.id === selectedId) ?? summary?.wards.find((ward) => ward.id === selectedId), [selectedId, summary, wards])
  const selectedTab = useMemo<WardPanelTab>(() => {
    const requested = new URLSearchParams(location.search).get('tab') as WardPanelTab | null
    return requested && validTabs.includes(requested) ? requested : 'overview'
  }, [location.search])
  const topWards = useMemo(() => [...wards].sort((a, b) => riskRank(b.risk_category) - riskRank(a.risk_category) || b.htsi - a.htsi).slice(0, 5), [wards])

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

  const chooseWard = (id: string) => {
    const params = new URLSearchParams(location.search)
    params.set('ward', id)
    setSelectedId(id)
    setPanelOpen(true)
    navigate({ pathname: location.pathname, search: `?${params}` }, { replace: true })
  }

  const closeWard = () => {
    const params = new URLSearchParams(location.search)
    params.delete('ward')
    params.delete('tab')
    setSelectedId('')
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : '' }, { replace: true })
  }

  const selectForecastStep = (hours: number) => {
    const params = new URLSearchParams(location.search)
    params.set('step', String(hours))
    setForecastHours(hours)
    navigate({ pathname: location.pathname, search: `?${params}` }, { replace: true })
  }

  const selectMapDay = (day: number) => {
    const next = mapDay === day ? 0 : day
    const params = new URLSearchParams(location.search)
    if (next) params.set('day', String(next))
    else params.delete('day')
    setMapDay(next)
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : '' }, { replace: true })
  }

  const toggleRisk = (group: RiskGroup) => {
    const enabled = !riskVisibility[group]
    setRiskVisibility((current) => ({ ...current, [group]: enabled }))
    setFocusExtreme(false)
    if (!enabled && selectedWard && riskGroup(selectedWard.risk_category) === group) closeWard()
  }

  const resetRisk = () => {
    setRiskVisibility(allRiskVisible)
    setFocusExtreme(false)
    setRiskFilter('ALL')
    const params = new URLSearchParams(location.search)
    params.delete('risk')
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : '' }, { replace: true })
    window.dispatchEvent(new Event('heatshield:reset-map'))
  }

  if (loading) return <AppShell city="Mumbai"><LoadingState label={`Loading Mumbai ${mode} workspace…`} /></AppShell>
  if (error && (!summary || !boundaries)) return <AppShell city="Mumbai"><ErrorState message={error} /></AppShell>
  if (!summary || !boundaries) return null

  const selectedStepLabel = mode === 'forecast' ? activeForecastStep.label : mapDay === 0 ? 'Current' : `+${mapDay * 24}h`
  const validAt = new Date(summary.as_of)
  if (mode === 'forecast') validAt.setHours(validAt.getHours() + activeForecastStep.hours)
  else validAt.setDate(validAt.getDate() + mapDay)
  const validLabel = validAt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })

  return <AppShell city={summary.city} updatedAt={summary.as_of} onRefresh={() => void refresh()} refreshing={refreshing}>
    <div className={`spatial-workspace spatial-workspace-${mode} ${panelOpen ? 'context-panel-open' : 'context-panel-closed'}`}>
      <section className="spatial-map-stage" aria-label={mode === 'forecast' ? 'Mumbai ward forecast map' : 'Mumbai ward spatial analysis map'}>
        <RiskMap
          boundaries={boundaries}
          wards={wards}
          selectedId={selectedWard?.id}
          metric={metric}
          onSelect={(id) => chooseWard(id)}
          onClear={closeWard}
          onCycleMetric={() => setMetric((current) => metricOrder[(metricOrder.indexOf(current) + 1) % metricOrder.length])}
          fitSelection={mode === 'map'}
          riskVisibility={riskVisibility}
          onToggleRisk={toggleRisk}
          onFocusExtreme={() => { setRiskVisibility({ low: false, moderate: false, high: false, extreme: true }); setFocusExtreme(true); setMetric('risk') }}
          onResetRisk={resetRisk}
          focusExtreme={focusExtreme}
          showHoverPopup={false}
        />

        <div className="embedded-map-toolbar spatial-map-toolbar" aria-label="Map analytical layers">
          <div className="map-control-group">{metrics.map(([id, label]) => <button key={id} className={metric === id ? 'selected' : ''} onClick={() => setMetric(id)}>{label}</button>)}</div>
          {mode === 'map' && <div className="map-control-group forecast-controls">{[1, 2, 3].map((day) => <button key={day} className={mapDay === day ? 'selected' : ''} onClick={() => selectMapDay(day)}>+{day * 24}h</button>)}</div>}
          {riskFilter !== 'ALL' && <button className="active-map-filter" onClick={resetRisk}>{riskFilter.replaceAll('_', ' ')} only <X size={10} /></button>}
        </div>

        <div className="spatial-map-state" title={summary.disclaimer}><span>{mode === 'forecast' ? 'Forecast' : 'Map'} · {selectedStepLabel}</span>{summary.is_demo && <em>Fallback source <Info size={10} /></em>}</div>
        <button className="context-panel-toggle" onClick={() => setPanelOpen((current) => !current)} aria-label={panelOpen ? 'Collapse information panel' : 'Expand information panel'} title={panelOpen ? 'Collapse information panel' : 'Expand information panel'}>{panelOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}</button>
        {error && <div className="spatial-map-error">{error}</div>}

        {mode === 'forecast' && <div className="forecast-timebar">
          <div className="forecast-valid"><span>Forecast valid</span><strong>{validLabel} IST</strong><small>{summary.provider} · daily ward forecast cycle</small></div>
          <div className="forecast-timeline" role="group" aria-label="Forecast time"><i />{forecastSteps.map((step) => <button key={step.hours} className={forecastHours === step.hours ? 'active' : ''} onClick={() => selectForecastStep(step.hours)} aria-pressed={forecastHours === step.hours} title={`${step.label} forecast position`}><b /><span>{step.label}</span></button>)}</div>
        </div>}
      </section>

      {panelOpen && (mode === 'map' ? selectedWard
        ? <WardContextPanel ward={selectedWard} forecastDay={forecastDay} selectedStep={selectedStepLabel} initialTab={selectedTab} onClose={closeWard} />
        : <MapOverviewPanel summary={summary} wards={wards} alerts={alerts} topWards={topWards} onWard={chooseWard} />
        : selectedWard
          ? <ForecastWardPanel ward={selectedWard} forecastDay={forecastDay} selectedStep={selectedStepLabel} onClose={closeWard} />
          : <ForecastOverviewPanel summary={summary} wards={wards} topWards={topWards} selectedStep={selectedStepLabel} validLabel={validLabel} onWard={chooseWard} />)}
    </div>
  </AppShell>
}

function MapOverviewPanel({ summary, wards, alerts, topWards, onWard }: { summary: DashboardSummary; wards: WardSummary[]; alerts: AlertLog[]; topWards: WardSummary[]; onWard: (id: string) => void }) {
  const extreme = wards.filter((ward) => ward.risk_category === 'EXTREME').length
  const high = wards.filter((ward) => ward.risk_category === 'HIGH' || ward.risk_category === 'DANGEROUS').length
  const population = wards.filter((ward) => riskRank(ward.risk_category) >= 3).reduce((total, ward) => total + ward.population, 0)
  const alertGroups = alerts.reduce((counts, alert) => {
    const ward = wards.find((item) => item.id === alert.ward_id)
    if (ward?.risk_category === 'EXTREME') counts.extreme += 1
    else if (ward && riskRank(ward.risk_category) >= 3) counts.high += 1
    else counts.other += 1
    return counts
  }, { extreme: 0, high: 0, other: 0 })
  return <aside className="spatial-overview-panel">
    <header><div><span>City overview</span><h2>Mumbai Overview</h2></div>{summary.is_demo && <em title={summary.disclaimer}>Fallback source <Info size={10} /></em>}</header>
    <section><h3>Current conditions</h3><div className="spatial-summary-rows"><div><span>Current overall risk</span><RiskBadge category={topWards[0]?.risk_category ?? summary.metrics.risk_category} /></div><div><span>Wards at Extreme Risk</span><strong>{extreme}</strong></div><div><span>Wards at High Risk</span><strong>{high}</strong></div><div><span>Population at Risk</span><strong>{(population / 100_000).toFixed(1)} L</strong></div></div></section>
    <section className="spatial-top-wards"><h3>Top Wards by Risk</h3><div className="spatial-list-head"><span>Ward</span><span>Risk</span><span>HTSI</span></div>{topWards.map((ward) => <button key={ward.id} onClick={() => onWard(ward.id)}><span>{ward.code}</span><RiskBadge category={ward.risk_category} /><strong>{ward.htsi.toFixed(0)}</strong></button>)}</section>
    <section><h3>Alert Summary</h3><div className="spatial-summary-rows"><div><span>Extreme alerts</span><strong>{alertGroups.extreme}</strong></div><div><span>High alerts</span><strong>{alertGroups.high}</strong></div><div><span>Other active alerts</span><strong>{alertGroups.other}</strong></div></div></section>
  </aside>
}

function ForecastOverviewPanel({ summary, wards, topWards, selectedStep, validLabel, onWard }: { summary: DashboardSummary; wards: WardSummary[]; topWards: WardSummary[]; selectedStep: string; validLabel: string; onWard: (id: string) => void }) {
  const peak = [...summary.forecast].sort((a, b) => b.max_htsi - a.max_htsi)[0]
  const highest = topWards[0]
  const extreme = wards.filter((ward) => ward.risk_category === 'EXTREME').length
  const high = wards.filter((ward) => ward.risk_category === 'HIGH' || ward.risk_category === 'DANGEROUS').length
  return <aside className="spatial-overview-panel forecast-overview-panel">
    <header><div><span>Selected time · {selectedStep}</span><h2>Forecast Overview</h2></div></header>
    <section><h3>Mumbai forecast</h3><div className="spatial-summary-rows"><div><span>Forecast valid</span><strong>{validLabel} IST</strong></div><div><span>Maximum Mumbai risk</span><RiskBadge category={highest?.risk_category ?? summary.metrics.risk_category} /></div><div><span>Wards Extreme</span><strong>{extreme}</strong></div><div><span>Wards High</span><strong>{high}</strong></div></div></section>
    <section className="spatial-top-wards"><h3>Highest Risk Wards at Selected Time</h3><div className="spatial-list-head"><span>Ward</span><span>Risk</span><span>HTSI</span></div>{topWards.map((ward) => <button key={ward.id} onClick={() => onWard(ward.id)}><span>{ward.code}</span><RiskBadge category={ward.risk_category} /><strong>{ward.htsi.toFixed(0)}</strong></button>)}</section>
    <section><h3>Forecast Summary</h3><CityTrendChart forecast={summary.forecast} /><div className="forecast-summary-copy"><p>Peak city-wide HTSI is expected {peak ? peak.day_offset === 0 ? 'today' : `at +${peak.day_offset} day${peak.day_offset === 1 ? '' : 's'}` : 'during the available forecast period'}.</p><p>{highest ? `${highest.code} Ward has the highest selected-time HTSI (${highest.htsi.toFixed(0)}).` : 'No ward forecast is available.'}</p></div></section>
  </aside>
}

function ForecastWardPanel({ ward, forecastDay, selectedStep, onClose }: { ward: WardSummary; forecastDay: number; selectedStep: string; onClose: () => void }) {
  const [forecast, setForecast] = useState<WardSummary[]>([])
  const [plan, setPlan] = useState<ActionPlan | null>(null)

  useEffect(() => {
    let active = true
    void Promise.allSettled([getWardForecast(ward.id), getActionPlan(ward.id, forecastDay)]).then(([forecastResult, planResult]) => {
      if (!active) return
      setForecast(forecastResult.status === 'fulfilled' ? forecastResult.value as WardSummary[] : [])
      setPlan(planResult.status === 'fulfilled' ? planResult.value as ActionPlan : null)
    })
    return () => { active = false }
  }, [forecastDay, ward.id])

  return <aside className="spatial-overview-panel forecast-ward-panel">
    <header><div><span>Ward forecast · {selectedStep}</span><h2>{ward.code} Ward</h2></div><button className="forecast-clear-ward" onClick={onClose} aria-label="Clear selected ward"><X size={14} /></button></header>
    <section><h3>Selected forecast time</h3><div className="spatial-summary-rows"><div><span>Risk</span><RiskBadge category={ward.risk_category} /></div><div><span>HTSI</span><strong>{ward.htsi.toFixed(0)}</strong></div><div><span>WBGT</span><strong>{ward.wbgt.toFixed(1)}°C</strong></div><div><span>UTCI</span><strong>{ward.utci.toFixed(1)}°C</strong></div><div><span>PVI</span><strong>{ward.vulnerability_index.toFixed(0)}</strong></div></div></section>
    <section><h3>Risk Trend</h3><WardForecastTrend rows={forecast} /></section>
    <section><h3>Recommended actions</h3><div className="forecast-action-list">{plan?.actions.slice(0, 4).map((action) => <div key={action.task_key}><strong>{action.title}</strong><span>{action.owner}</span></div>) ?? <p>Loading recommended actions…</p>}</div></section>
  </aside>
}

function WardForecastTrend({ rows }: { rows: WardSummary[] }) {
  const values = rows.slice(0, 6)
  const points = values.map((row, index) => `${18 + index * 48},${72 - Math.min(68, Math.max(4, row.htsi * .68))}`).join(' ')
  return <svg className="city-trend-chart ward-forecast-trend" viewBox="0 0 270 92" role="img" aria-label="Selected ward HTSI forecast trend">
    {[18, 42, 66].map((y) => <line key={y} x1="14" y1={y} x2="258" y2={y} />)}
    <polyline points={points} />
    {values.map((row, index) => <g key={row.day_offset}><circle cx={18 + index * 48} cy={72 - Math.min(68, Math.max(4, row.htsi * .68))} r="3" /><text x={18 + index * 48} y="88" textAnchor="middle">{row.day_offset === 0 ? 'Now' : row.day_offset <= 3 ? `+${row.day_offset * 24}` : `+${row.day_offset}d`}</text></g>)}
  </svg>
}

function CityTrendChart({ forecast }: { forecast: DashboardSummary['forecast'] }) {
  const rows = forecast.slice(0, 6)
  const points = rows.map((row, index) => `${18 + index * 48},${72 - Math.min(68, Math.max(4, row.max_htsi * .68))}`).join(' ')
  return <svg className="city-trend-chart" viewBox="0 0 270 92" role="img" aria-label="City maximum HTSI forecast trend">
    {[18, 42, 66].map((y) => <line key={y} x1="14" y1={y} x2="258" y2={y} />)}
    <polyline points={points} />
    {rows.map((row, index) => <g key={row.day_offset}><circle cx={18 + index * 48} cy={72 - Math.min(68, Math.max(4, row.max_htsi * .68))} r="3" /><text x={18 + index * 48} y="88" textAnchor="middle">{row.day_offset === 0 ? 'Now' : `+${row.day_offset}d`}</text></g>)}
  </svg>
}
