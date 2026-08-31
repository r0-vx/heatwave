import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clipboard,
  FileKey2,
  Info,
  LockKeyhole,
  MessageSquare,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ErrorState, LoadingState } from '../components/LoadingState'
import { RiskBadge } from '../components/RiskBadge'
import { clearApiCache, getAlertProvider, getAlerts, getWards, sendTestAlert, simulateAlert } from '../services/api'
import type { AlertLog, AlertProviderStatus, AlertSimulation, WardSummary } from '../types'

const audiences = ['Citizens', 'Ward response team', 'Hospitals', 'Outdoor-work supervisors', 'Disaster management']

const maskPhone = (value: string | null) => {
  if (!value) return '—'
  const digits = value.replace(/\D/g, '')
  return `${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`
}

export function AlertSimulatorPage() {
  const [params] = useSearchParams()
  const [wards, setWards] = useState<WardSummary[]>([])
  const [provider, setProvider] = useState<AlertProviderStatus | null>(null)
  const [logs, setLogs] = useState<AlertLog[]>([])
  const [wardId, setWardId] = useState(params.get('ward') ?? '')
  const [audience, setAudience] = useState('Citizens')
  const [day, setDay] = useState(1)
  const [result, setResult] = useState<AlertSimulation | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    const [wardRows, providerState, logRows] = await Promise.all([getWards(), getAlertProvider(), getAlerts()])
    setWards(wardRows)
    setProvider(providerState)
    setLogs(logRows)
    setWardId((current) => current || wardRows[0]?.id || '')
  }
  useEffect(() => { void load().catch((err) => setError(err instanceof Error ? err.message : 'Unable to load alert console')) }, [])
  const ward = wards.find((item) => item.id === wardId)
  const selectedPreview = useMemo(() => result?.previews['SMS Preview'], [result])

  const simulate = async () => {
    if (!wardId) return
    setBusy(true); setError('')
    try {
      setResult(await simulateAlert({ ward_id: wardId, audience, channel: 'SMS', forecast_day: day }))
      clearApiCache()
      setLogs(await getAlerts())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate alert preview')
    } finally { setBusy(false) }
  }
  const send = async () => {
    if (!wardId) return
    setBusy(true); setError('')
    try {
      const sent = await sendTestAlert({ ward_id: wardId, audience, channel: 'SMS', forecast_day: day, recipient, confirm: true, confirmation_text: confirmation })
      setResult(sent)
      setConfirmOpen(false); setConfirmation(''); setRecipient('')
      clearApiCache()
      setLogs(await getAlerts())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The provider rejected the test SMS request')
    } finally { setBusy(false) }
  }

  if (error && !wards.length) return <AppShell city="Mumbai"><ErrorState message={error} /></AppShell>
  if (!wards.length || !provider) return <AppShell city="Mumbai"><LoadingState label="Loading alert provider and ward targets…" /></AppShell>
  return <AppShell source={provider.configured ? 'SMS TEST READY' : 'SIMULATION ONLY'} city="Mumbai">
    <div className="ops-page-head">
      <div><div className="ops-eyebrow"><span />ALERT OPERATIONS / REVIEW GATE</div><h1>Alert console</h1><p>Generate ward-specific messages, review source context, and keep an immutable local delivery record.</p></div>
      <div className={`provider-chip ${provider.configured ? 'provider-ready' : 'provider-safe'}`}>{provider.configured ? <Smartphone size={15} /> : <LockKeyhole size={15} />}<span><strong>{provider.mode.replaceAll('_', ' ')}</strong>{provider.status_detail}</span></div>
    </div>

    <div className="alert-safety-banner"><ShieldCheck size={16} /><div><strong>External delivery is gated</strong><span>Simulation is always local. Test SMS requires configured MSG91/DLT credentials, the allow-listed number, and explicit typed confirmation. Provider acceptance is never shown as delivery.</span></div></div>

    <section className="alert-console-grid">
      <div className="ops-panel alert-composer">
        <div className="ops-panel-head"><div><span>01 / TARGET</span><h2>Message context</h2></div><BellRing size={16} /></div>
        <label className="ops-field"><span>WARD</span><select value={wardId} onChange={(event) => { setWardId(event.target.value); setResult(null) }}>{wards.map((item) => <option value={item.id} key={item.id}>{item.code} · {item.locality} · {item.risk_category}</option>)}</select></label>
        <label className="ops-field"><span>FORECAST WINDOW</span><select value={day} onChange={(event) => { setDay(Number(event.target.value)); setResult(null) }}><option value="0">TODAY</option><option value="1">TOMORROW</option><option value="2">DAY +2</option><option value="3">DAY +3</option><option value="4">DAY +4</option><option value="5">DAY +5</option></select></label>
        <div className="ops-field"><span>AUDIENCE</span><div className="audience-list">{audiences.map((item) => <button key={item} className={audience === item ? 'active' : ''} onClick={() => setAudience(item)}>{item}</button>)}</div></div>
        {ward && <div className="alert-target-summary"><div><span>{ward.code} WARD</span><strong>{ward.locality}</strong></div><RiskBadge category={ward.risk_category} /><p><span>HTSI</span><strong>{ward.htsi.toFixed(0)}</strong></p><p><span>PVI</span><strong>{ward.vulnerability_index.toFixed(0)}</strong></p></div>}
        <button className="ops-button ops-button-primary alert-primary" onClick={() => void simulate()} disabled={busy}><MessageSquare size={14} />{busy ? 'Generating…' : 'Generate local preview'}</button>
        <button className="ops-button alert-send-test" disabled={!provider.configured || !result || busy} onClick={() => setConfirmOpen(true)}><Send size={14} />Send restricted test SMS</button>
        {!provider.configured && <div className="provider-requirements"><FileKey2 size={14} /><span><strong>Simulation-only until configured</strong>{provider.requirements.join(' · ')}</span></div>}
        {error && <div className="inline-error"><AlertTriangle size={13} />{error}</div>}
      </div>

      <div className="ops-panel alert-review">
        <div className="ops-panel-head"><div><span>02 / REVIEW</span><h2>SMS preview</h2></div>{result && <span className={`review-status ${result.simulated ? 'simulated' : 'accepted'}`}><Radio size={12} />{result.status}</span>}</div>
        {selectedPreview ? <div className="sms-review">
          <div className="sms-review-meta"><span>TO</span><strong>{selectedPreview.audience}</strong><span>PROVIDER</span><strong>{result?.provider}</strong></div>
          <pre>{selectedPreview.message}</pre>
          <div className="sms-review-actions"><button onClick={() => void navigator.clipboard?.writeText(selectedPreview.message)}><Clipboard size={13} />Copy</button><span>{selectedPreview.message.length} characters</span></div>
          <div className="preview-provenance"><Info size={14} /><span><strong>Generated from selected ward context</strong>{ward?.source}. Health outputs remain prototype estimates.</span></div>
          <div className={`result-receipt ${result?.simulated ? '' : 'provider-receipt'}`}>{result?.simulated ? <MessageSquare size={17} /> : <CheckCircle2 size={17} />}<div><strong>{result?.simulated ? 'Local preview recorded' : 'Provider accepted test request'}</strong><span>Record #{result?.id ?? '—'} · {result?.message_id ? `message ID ${result.message_id}` : 'no delivery receipt'}</span></div></div>
        </div> : <div className="alert-empty"><MessageSquare size={28} /><h3>No preview in review</h3><p>Select a ward, forecast period and audience, then generate a local preview. Nothing will be sent.</p></div>}
      </div>
    </section>

    <section className="ops-panel delivery-log-panel">
      <div className="ops-panel-head"><div><span>03 / AUDIT</span><h2>Alert delivery log</h2></div><button className="icon-button" onClick={() => void load()} title="Refresh logs"><RefreshCw size={14} /></button></div>
      <div className="delivery-table-wrap"><table className="delivery-table"><thead><tr><th>TIME</th><th>WARD</th><th>AUDIENCE</th><th>CHANNEL</th><th>PROVIDER</th><th>RECIPIENT</th><th>STATUS</th><th>MESSAGE ID</th></tr></thead><tbody>{logs.length ? logs.map((log) => <tr key={log.id}><td>{new Date(log.generated_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</td><td>{log.ward_id?.replace('BMC-', '') ?? '—'}</td><td>{log.audience}</td><td>{log.channel}</td><td>{log.provider}</td><td>{maskPhone(log.recipient)}</td><td><span className={`log-status ${log.status.startsWith('FAILED') ? 'failed' : log.simulated ? 'simulated' : 'accepted'}`}>{log.status}</span></td><td>{log.message_id ?? '—'}</td></tr>) : <tr><td colSpan={8}>No alert records yet.</td></tr>}</tbody></table></div>
    </section>

    {confirmOpen && <div className="modal-backdrop" onMouseDown={() => setConfirmOpen(false)}><div className="confirm-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="confirm-modal-head"><div><span>EXTERNAL SIDE EFFECT</span><h2>Confirm one test SMS</h2></div><button onClick={() => setConfirmOpen(false)}><X size={17} /></button></div><div className="confirm-warning"><AlertTriangle size={16} /><p>This will call MSG91 for one allow-listed test number. The result can only confirm provider acceptance, not handset delivery.</p></div><label className="ops-field"><span>ALLOW-LISTED RECIPIENT · {provider.test_recipient}</span><input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Enter configured TEST_PHONE_NUMBER" /></label><label className="ops-field"><span>TYPE SEND TEST SMS TO CONFIRM</span><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="SEND TEST SMS" /></label><div className="confirm-summary"><strong>{ward?.name}</strong><span>{audience} · SMS · {_dayLabel(day)}</span></div><div className="confirm-actions"><button className="ops-button" onClick={() => setConfirmOpen(false)}>Cancel</button><button className="ops-button ops-button-danger" disabled={confirmation.trim().toUpperCase() !== 'SEND TEST SMS' || !recipient || busy} onClick={() => void send()}><Send size={14} />{busy ? 'Submitting…' : 'Send one test SMS'}</button></div></div></div>}
  </AppShell>
}

function _dayLabel(day: number) { return day === 0 ? 'today' : day === 1 ? 'tomorrow' : `day +${day}` }
