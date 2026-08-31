import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, MessageSquare, Send, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  clearApiCache,
  getActionPlan,
  getAlertAudiences,
  getAlertProvider,
  getAlerts,
  getSources,
  getWard,
  getWardForecast,
  sendTestAlert,
  simulateAlert,
  updateActionTask,
} from '../services/api'
import type { ActionPlan, AlertAudience, AlertLog, AlertProviderStatus, AlertSimulation, SourcesResponse, WardDetail, WardSummary } from '../types'
import { RiskBadge } from './RiskBadge'

export type WardPanelTab = 'overview' | 'thermal' | 'vulnerability' | 'forecast' | 'actions' | 'sources'

interface WardContextPanelProps {
  ward: WardSummary
  forecastDay: number
  selectedStep: string
  initialTab?: WardPanelTab
  onClose: () => void
}

const tabs: Array<[WardPanelTab, string]> = [
  ['overview', 'Overview'],
  ['thermal', 'Thermal Stress'],
  ['vulnerability', 'Vulnerability'],
  ['forecast', 'Forecast'],
  ['actions', 'Actions'],
  ['sources', 'Sources'],
]

const nextTaskStatus = (status: ActionPlan['actions'][number]['status']) =>
  status === 'PENDING' ? 'ACKNOWLEDGED' : status === 'ACKNOWLEDGED' ? 'IN_PROGRESS' : 'COMPLETE'

function formatDate(value?: string | null) {
  if (!value) return 'Unavailable'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }) + ' IST'
}

function valueOrDash(value: number | null | undefined, suffix = '', digits = 0) {
  return value === null || value === undefined ? '—' : `${value.toFixed(digits)}${suffix}`
}

export function WardContextPanel({ ward, forecastDay, selectedStep, initialTab = 'overview', onClose }: WardContextPanelProps) {
  const [tab, setTab] = useState<WardPanelTab>(initialTab)
  const [detail, setDetail] = useState<WardDetail | null>(null)
  const [plan, setPlan] = useState<ActionPlan | null>(null)
  const [provider, setProvider] = useState<AlertProviderStatus | null>(null)
  const [audiences, setAudiences] = useState<AlertAudience[]>([])
  const [alerts, setAlerts] = useState<AlertLog[]>([])
  const [sources, setSources] = useState<SourcesResponse | null>(null)
  const [preview, setPreview] = useState<AlertSimulation | null>(null)
  const [audience, setAudience] = useState('citizens')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [confirmation, setConfirmation] = useState('')

  useEffect(() => { setTab(initialTab) }, [initialTab, ward.id])

  useEffect(() => {
    let active = true
    setDetail(null)
    setPlan(null)
    setPreview(null)
    setError('')
    void Promise.allSettled([
      getWard(ward.id, forecastDay),
      getWardForecast(ward.id),
      getActionPlan(ward.id, forecastDay),
      getAlertAudiences(),
      getAlertProvider(),
      getAlerts(),
      getSources(),
    ]).then(([detailResult, forecastResult, planResult, audiencesResult, providerResult, alertsResult, sourcesResult]) => {
      if (!active) return
      if (detailResult.status === 'fulfilled') setDetail({ ...detailResult.value, forecast: forecastResult.status === 'fulfilled' ? forecastResult.value : [] })
      if (planResult.status === 'fulfilled') setPlan(planResult.value)
      if (audiencesResult.status === 'fulfilled') setAudiences(audiencesResult.value)
      if (providerResult.status === 'fulfilled') setProvider(providerResult.value)
      if (alertsResult.status === 'fulfilled') setAlerts(alertsResult.value.filter((row) => row.ward_id === ward.id))
      if (sourcesResult.status === 'fulfilled') setSources(sourcesResult.value)
    })
    return () => { active = false }
  }, [forecastDay, ward.id])

  const row = detail ?? ward
  const forecast = detail?.forecast?.filter((item) => item.day_offset >= 1).slice(0, 5) ?? []
  const peak = useMemo(() => forecast.reduce<WardSummary | null>((best, item) => !best || item.htsi > best.htsi ? item : best, null), [forecast])
  const nextForecast = forecast[0]
  const forecastDirection = !nextForecast ? 'Unavailable' : nextForecast.htsi > row.htsi + 1 ? 'Increasing' : nextForecast.htsi < row.htsi - 1 ? 'Decreasing' : 'Stable'
  const selectedPreview = preview?.previews['Selected Preview'] ?? preview?.previews['SMS Preview']

  const advanceTask = async (taskKey: string, status: ActionPlan['actions'][number]['status']) => {
    setBusy(true)
    setError('')
    try {
      setPlan(await updateActionTask(ward.id, taskKey, nextTaskStatus(status), forecastDay))
      clearApiCache()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update action status')
    } finally {
      setBusy(false)
    }
  }

  const generatePreview = async () => {
    setBusy(true)
    setError('')
    try {
      setPreview(await simulateAlert({ ward_id: ward.id, audience, channel: 'SMS', forecast_day: forecastDay }))
      clearApiCache()
      setAlerts((await getAlerts()).filter((item) => item.ward_id === ward.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate alert preview')
    } finally {
      setBusy(false)
    }
  }

  const sendTest = async () => {
    setBusy(true)
    setError('')
    try {
      setPreview(await sendTestAlert({
        ward_id: ward.id,
        audience,
        channel: 'SMS',
        forecast_day: forecastDay,
        recipient,
        confirm: true,
        confirmation_text: confirmation,
      }))
      setConfirmOpen(false)
      setRecipient('')
      setConfirmation('')
      clearApiCache()
      setAlerts((await getAlerts()).filter((item) => item.ward_id === ward.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The provider rejected the test SMS request')
    } finally {
      setBusy(false)
    }
  }

  return <aside className="ward-context-panel" aria-label={`${ward.code} Ward analysis`}>
    <header className="ward-context-head">
      <div><span>BMC ward</span><h2>{ward.code} Ward</h2></div>
      <div><RiskBadge category={row.risk_category} /><button onClick={onClose} aria-label="Close ward panel"><X size={15} /></button></div>
    </header>

    <nav className="ward-context-tabs" aria-label="Ward analysis sections">
      {tabs.map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}
    </nav>

    <div className="ward-context-body">
      {tab === 'overview' && <div className="ward-panel-section">
        <SectionTitle title="Current conditions" detail={selectedStep} />
        <MetricRows rows={[
          ['Temperature', valueOrDash(row.temperature, '°C', 1)],
          ['Humidity', valueOrDash(row.humidity, '%', 0)],
          ['Current risk', <RiskBadge category={row.risk_category} />],
          ['HTSI', valueOrDash(row.htsi, '', 0)],
          ['Population at risk', detail?.health_history ? detail.health_history.population_at_risk.toLocaleString('en-IN') : 'Unavailable'],
          ['Forecast direction', forecastDirection],
        ]} />
        <RiskTrendChart current={row} forecast={forecast} />
        <Divider />
        <SectionTitle title="Ward context" />
        <MetricRows rows={[
          ['Locality', row.locality],
          ['Population', row.population.toLocaleString('en-IN')],
          ['Major vulnerable group', row.major_vulnerable_group],
          ['Confidence', `${Math.round(row.confidence)}%`],
        ]} />
      </div>}

      {tab === 'thermal' && <div className="ward-panel-section">
        <SectionTitle title="Thermal stress" detail={selectedStep} />
        <MetricRows rows={[
          ['Heat Index', valueOrDash(row.heat_index, '°C', 1)],
          ['WBGT', valueOrDash(row.wbgt, '°C', 1)],
          ['UTCI', valueOrDash(row.utci, '°C', 1)],
          ['HTSI', valueOrDash(row.htsi, '', 0)],
          ['Wind speed', valueOrDash(row.wind_speed, ' m/s', 1)],
          ['Solar radiation', valueOrDash(row.solar_radiation, ' W/m²', 0)],
        ]} />
        <SeverityComparison ward={row} />
        <Divider />
        <SectionTitle title="Indicator contributions" />
        <div className="ward-note-list">{row.explanation.length ? row.explanation.map((item) => <p key={item}>{item}</p>) : <p>No component explanation is available for this forecast cycle.</p>}</div>
      </div>}

      {tab === 'vulnerability' && <div className="ward-panel-section">
        <SectionTitle title="Population vulnerability" />
        <MetricRows rows={[
          ['PVI', valueOrDash(row.vulnerability_index, '', 0)],
          ['Elderly population', valueOrDash(detail?.demographics.elderly_pct, '%', 1)],
          ['Outdoor workers', valueOrDash(detail?.demographics.outdoor_worker_pct, '%', 1)],
          ['Population density', detail ? `${detail.demographics.population_density.toLocaleString('en-IN')} /km²` : '—'],
          ['Children', valueOrDash(detail?.demographics.children_pct, '%', 1)],
          ['Green cover', valueOrDash(detail?.demographics.green_cover_pct, '%', 1)],
          ['Slum indicator', valueOrDash(detail?.demographics.slum_indicator, '', 2)],
          ['Historical hospitalization', valueOrDash(detail?.demographics.historical_hospitalization_rate, '', 1)],
          ['Historical mortality', valueOrDash(detail?.demographics.historical_mortality_rate, '', 1)],
        ]} />
        {detail && <><Divider /><SectionTitle title="PVI factors" /><div className="ward-factor-list">{Object.entries(detail.pvi_components).map(([name, value]) => <div key={name}><span>{name.replaceAll('_', ' ')}</span><i><b style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></i><strong>{value.toFixed(0)}</strong></div>)}</div></>}
      </div>}

      {tab === 'forecast' && <div className="ward-panel-section">
        <SectionTitle title="Ward forecast" detail={`Selected ${selectedStep}`} />
        <div className="ward-forecast-list">
          {forecast.map((item) => <div key={item.day_offset}><span>{item.day_offset <= 3 ? `+${item.day_offset * 24}h` : `+${item.day_offset}d`}</span><RiskBadge category={item.risk_category} /><strong>{item.htsi.toFixed(0)}</strong><em>{item.wbgt.toFixed(1)}°C</em></div>)}
          {!forecast.length && <p>Loading ward forecast…</p>}
        </div>
        <RiskTrendChart current={row} forecast={forecast} />
        <Divider />
        <MetricRows rows={[
          ['Peak danger window', peak ? `${peak.day_offset <= 3 ? `+${peak.day_offset * 24}h` : `+${peak.day_offset}d`} · HTSI ${peak.htsi.toFixed(0)}` : 'Unavailable'],
          ['Forecast timestamp', formatDate(row.forecast_time)],
        ]} />
      </div>}

      {tab === 'actions' && <div className="ward-panel-section">
        <SectionTitle title="Recommended actions" detail={plan?.risk_category.replaceAll('_', ' ')} />
        <div className="ward-action-list">{plan?.actions.map((action) => <div key={action.task_key}><span><strong>{action.title}</strong><small>{action.owner} · {action.status.replaceAll('_', ' ')}</small></span><button disabled={busy || action.status === 'COMPLETE'} onClick={() => void advanceTask(action.task_key, action.status)}>{action.status === 'COMPLETE' ? <Check size={12} /> : 'Advance'}</button></div>) ?? <p>Loading Heat Action Plan…</p>}</div>
        <Link className="create-alert-link" to={`/alerts?ward=${encodeURIComponent(ward.id)}&day=${forecastDay}&open=1`}>Create Alert <span>→</span></Link>
        <Divider />
        <SectionTitle title="Ward alert" detail={provider?.mode.replaceAll('_', ' ')} />
        <label className="ward-alert-context"><span>Audience</span><select value={audience} onChange={(event) => { setAudience(event.target.value); setPreview(null) }}>{audiences.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <div className="ward-alert-actions"><button onClick={() => void generatePreview()} disabled={busy}><MessageSquare size={13} />{busy ? 'Working…' : 'Generate alert preview'}</button><button onClick={() => setConfirmOpen(true)} disabled={!provider?.configured || !preview || busy}><Send size={13} />Send restricted test SMS</button></div>
        {selectedPreview && <div className="ward-alert-preview"><span>{selectedPreview.audience}</span><p>{selectedPreview.message}</p><small>{preview?.status}</small></div>}
        {!provider?.configured && <p className="ward-panel-note">SMS delivery is unavailable until the configured MSG91/DLT test provider and allow-listed recipient are ready.</p>}
        {alerts.length > 0 && <><Divider /><SectionTitle title="Recent ward alerts" /><div className="ward-alert-log">{alerts.slice(0, 4).map((alert) => <div key={alert.id}><time>{formatDate(alert.generated_at)}</time><span>{alert.status.replaceAll('_', ' ')}</span></div>)}</div></>}
        {error && <div className="ward-panel-error"><AlertTriangle size={13} />{error}</div>}
      </div>}

      {tab === 'sources' && <div className="ward-panel-section">
        <SectionTitle title="Data provenance" detail={row.is_demo ? 'Fallback source' : 'Configured source'} />
        <MetricRows rows={[
          ['Weather dataset', row.source],
          ['Ward geometry', row.geometry_source],
          ['Population', row.population_source],
          ['Demographics', detail?.demographics.source ?? 'Loading…'],
          ['Observation / forecast', formatDate(row.forecast_time)],
          ['Registry retrieved', formatDate(sources?.as_of)],
          ['Fallback status', row.is_demo ? 'Active — see source registry detail below' : 'Not active for this ward layer'],
        ]} />
        {sources && <><Divider /><SectionTitle title="Active source registry" /><div className="ward-source-list">{sources.sources.filter((source) => source.in_use || source.fallback).slice(0, 8).map((source) => <div key={source.id}><span><strong>{source.name}</strong><small>{source.authority} · {source.status.replaceAll('_', ' ')}</small></span><em>{source.last_success ? formatDate(source.last_success) : source.fallback ?? 'No retrieval recorded'}</em></div>)}</div></>}
      </div>}
    </div>

    {confirmOpen && provider && <div className="ward-confirm-overlay" onMouseDown={() => setConfirmOpen(false)}>
      <div className="ward-confirm-dialog" role="dialog" aria-modal="true" aria-label="Confirm one test SMS" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span>External side effect</span><h3>Confirm one test SMS</h3></div><button onClick={() => setConfirmOpen(false)} aria-label="Close confirmation"><X size={15} /></button></header>
        <p>This calls MSG91 for one allow-listed test number. Provider acceptance does not confirm handset delivery.</p>
        <label><span>Allow-listed recipient · {provider.test_recipient}</span><input value={recipient} onChange={(event) => setRecipient(event.target.value)} /></label>
        <label><span>Type SEND TEST SMS to confirm</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
        <footer><button onClick={() => setConfirmOpen(false)}>Cancel</button><button disabled={confirmation.trim().toUpperCase() !== 'SEND TEST SMS' || !recipient || busy} onClick={() => void sendTest()}>Send one test SMS</button></footer>
      </div>
    </div>}
  </aside>
}

function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return <div className="ward-section-title"><h3>{title}</h3>{detail && <span>{detail}</span>}</div>
}

function Divider() {
  return <div className="ward-section-divider" />
}

function MetricRows({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return <div className="ward-metric-rows">{rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
}

function RiskTrendChart({ current, forecast }: { current: WardSummary; forecast: WardSummary[] }) {
  const rows = [current, ...forecast.filter((item) => item.day_offset >= 1).slice(0, 5)]
  const points = rows.map((item, index) => `${18 + index * 48},${78 - Math.min(72, Math.max(4, item.htsi * .72))}`).join(' ')
  const colour = current.risk_category === 'EXTREME' ? '#b23b30' : current.risk_category === 'DANGEROUS' ? '#a84c39' : current.risk_category === 'HIGH' ? '#b26835' : current.risk_category === 'CAUTION' ? '#9b8b45' : '#607b61'
  return <div className="ward-risk-trend"><div><strong>Risk Trend — Next 5 Days</strong><span>HTSI · 0–100</span></div><svg viewBox="0 0 278 104" role="img" aria-label="Ward HTSI trend for the next five days">
    {[18, 42, 66].map((y) => <line key={y} x1="14" x2="264" y1={y} y2={y} />)}
    <polyline points={points} style={{ stroke: colour }} />
    {rows.map((item, index) => <g key={`${item.day_offset}-${index}`}><circle cx={18 + index * 48} cy={78 - Math.min(72, Math.max(4, item.htsi * .72))} r="3" style={{ fill: colour }} /><text x={18 + index * 48} y="99" textAnchor="middle">{index === 0 ? 'Now' : item.day_offset <= 3 ? `+${item.day_offset * 24}h` : `+${item.day_offset}d`}</text></g>)}
  </svg></div>
}

function SeverityComparison({ ward }: { ward: WardSummary }) {
  const rows = [
    ['Heat Index severity', Math.max(0, Math.min(100, ((ward.heat_index - 26) / 28) * 100))],
    ['WBGT severity', Math.max(0, Math.min(100, ((ward.wbgt - 20) / 16) * 100))],
    ['UTCI severity', Math.max(0, Math.min(100, ((ward.utci - 22) / 28) * 100))],
    ['HTSI', Math.max(0, Math.min(100, ward.htsi))],
  ] as Array<[string, number]>
  return <div className="thermal-severity"><div><strong>Normalized Severity</strong><span>Comparable 0–100 scale</span></div>{rows.map(([label, value]) => <p key={label}><span>{label}</span><i><b style={{ width: `${value}%` }} /></i><strong>{value.toFixed(0)}</strong></p>)}</div>
}
