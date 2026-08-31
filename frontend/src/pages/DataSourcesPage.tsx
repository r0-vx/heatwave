import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Database,
  FileKey2,
  Info,
  Link2,
  RefreshCw,
  Satellite,
  ShieldCheck,
} from 'lucide-react'
import { AppShell } from '../components/AppShell'
import { ErrorState, LoadingState } from '../components/LoadingState'
import { clearApiCache, getEvents, getSources, getSystemStatus, refreshSystemStatus } from '../services/api'
import type { SourcesResponse, SystemEvent, SystemStatus } from '../types'

export function DataSourcesPage() {
  const [data, setData] = useState<SourcesResponse | null>(null)
  const [system, setSystem] = useState<SystemStatus | null>(null)
  const [events, setEvents] = useState<SystemEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      const [sources, status, stream] = await Promise.all([getSources(), getSystemStatus(), getEvents(20)])
      setData(sources); setSystem(status); setEvents(stream)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load source registry')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])
  const refresh = async () => {
    setRefreshing(true)
    try { await refreshSystemStatus(); clearApiCache(); await load() } finally { setRefreshing(false) }
  }
  if (loading) return <AppShell city="Mumbai"><LoadingState label="Reading provider registry…" /></AppShell>
  if (error || !data || !system) return <AppShell city="Mumbai"><ErrorState message={error || 'No source registry returned.'} /></AppShell>
  const officialWeather = data.sources.find((source) => source.id === 'imd-weather')
  return <AppShell source={officialWeather?.in_use ? 'IMD CONNECTED' : 'DEMO FALLBACK'} city="Mumbai">
    <div className="ops-page-head">
      <div><div className="ops-eyebrow"><span />PROVENANCE / PROVIDER REGISTRY</div><h1>Data sources</h1><p>Authority, access state, freshness, fallback and quality boundaries for every operational input.</p></div>
      <div className="ops-head-actions"><span className="snapshot-time"><Clock3 size={13} />Checked {new Date(data.as_of).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST</span><button className="ops-button" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={14} className={refreshing ? 'spin' : ''} />Refresh status</button></div>
    </div>

    <div className="source-summary-strip">
      <div><CheckCircle2 size={16} /><span><strong>{data.connected}</strong>connected / reference-ready</span></div>
      <div><AlertTriangle size={16} /><span><strong>{data.attention}</strong>need credentials or ingest work</span></div>
      <div><Database size={16} /><span><strong>{system.ward_count}</strong>actual BMC polygons loaded</span></div>
      <div><ShieldCheck size={16} /><span><strong>0</strong>fabricated official feeds</span></div>
    </div>

    <div className="source-truth-note"><Info size={16} /><div><strong>Truthful fallback policy</strong><span>A missing key, restricted portal or absent crosswalk is shown as unavailable. The system never relabels the local exercise scenario as IMD, Census, IHIP or BMC live data.</span></div></div>

    <section className="source-registry">
      <div className="source-registry-head"><span>SOURCE / AUTHORITY</span><span>STATUS / FRESHNESS</span><span>ACCESS / FALLBACK</span><span>PROVENANCE</span></div>
      {data.sources.map((source) => <article className="source-row" key={source.id}>
        <div className="source-identity"><span className="source-kind-icon">{source.kind.includes('SATELLITE') ? <Satellite size={16} /> : source.credentials_required ? <FileKey2 size={16} /> : <Database size={16} />}</span><div><span>{source.kind}</span><h2>{source.name}</h2><p>{source.authority}</p></div></div>
        <div className="source-state"><span className={`registry-status registry-${source.status.toLowerCase().replaceAll('_', '-')}`}><i />{source.status.replaceAll('_', ' ')}</span><strong>{source.freshness}</strong><small>{source.last_success ? `Last local success ${new Date(source.last_success).toLocaleString('en-IN')}` : 'No successful live ingest recorded'}</small><p>{source.status_detail}</p></div>
        <div className="source-access"><strong>{source.credentials_required ? 'Credentialed access' : 'No credential required'}</strong>{source.configuration.length > 0 && <div className="config-tags">{source.configuration.map((item) => <code key={item}>{item}</code>)}</div>}<p><span>Fallback</span>{source.fallback ?? 'None'}</p></div>
        <div className="source-provenance"><p>{source.quality_note}</p><small>License: {source.license}</small><div><a href={source.source_url} target="_blank" rel="noreferrer"><Link2 size={12} />Primary source <ArrowUpRight size={11} /></a><a href={source.reference_url} target="_blank" rel="noreferrer">Reference <ArrowUpRight size={11} /></a></div></div>
      </article>)}
    </section>

    <section className="ops-panel source-events">
      <div className="ops-panel-head"><div><span>INGEST / OPERATOR AUDIT</span><h2>Recent source events</h2></div><span>{events.length} records</span></div>
      <div className="event-stream event-stream-wide">{events.map((event) => <div className="event-row" key={event.id}><span className={`event-dot event-${event.severity.toLowerCase()}`} /><time>{new Date(event.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</time><div><strong>{event.category.replaceAll('_', ' ')}</strong><p>{event.message}</p><small>{event.source}</small></div></div>)}</div>
    </section>
  </AppShell>
}
