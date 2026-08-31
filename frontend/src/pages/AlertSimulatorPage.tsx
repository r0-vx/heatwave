import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Clipboard, MessageSquare, Plus, RefreshCw, Send, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ErrorState, LoadingState } from '../components/LoadingState'
import { RiskBadge } from '../components/RiskBadge'
import { clearApiCache, getAlertAudiences, getAlertProvider, getAlerts, getWards, previewAlert, sendTestAlert, simulateAlert } from '../services/api'
import type { AlertAudience, AlertLog, AlertProviderStatus, AlertSimulation, RiskCategory, WardSummary } from '../types'

function maskPhone(value: string | null) {
  if (!value) return '—'
  if (value.includes('•')) return value
  const digits = value.replace(/\D/g, '')
  return `${digits.startsWith('91') ? '+91 ' : ''}${'•'.repeat(Math.max(0, digits.length - (digits.startsWith('91') ? 6 : 4)))}${digits.slice(-4)}`
}

function compactStatus(log: AlertLog) {
  if (log.delivery_confirmed) return { label: 'Delivered', tone: 'delivered', detail: 'Provider delivery tracking confirmed delivery.' }
  if (log.simulated) return { label: 'Simulated', tone: 'simulated', detail: 'No external message was sent.' }
  const value = log.status.toUpperCase()
  if (value.includes('FAILED')) return { label: 'Failed', tone: 'failed', detail: log.status.replaceAll('_', ' ') }
  if (value.includes('ACCEPTED')) return { label: 'Accepted', tone: 'accepted', detail: 'The gateway accepted the request; delivery is not confirmed.' }
  if (value.includes('QUEUED')) return { label: 'Queued', tone: 'queued', detail: log.status.replaceAll('_', ' ') }
  if (value.includes('SENT')) return { label: 'Sent', tone: 'sent', detail: 'The request was sent; delivery is not confirmed.' }
  return { label: 'Draft', tone: 'draft', detail: log.status.replaceAll('_', ' ') }
}

function calmError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unable to complete the alert request.'
  if (message.includes('not fully configured')) return 'SMS provider is not configured.'
  if (message.includes('TEST_PHONE_NUMBER') || message.toLowerCase().includes('recipient')) return 'Recipient is not approved for test sending.'
  if (message.toLowerCase().includes('timeout')) return 'The SMS provider timed out. No delivery is confirmed.'
  if (message.includes('MSG91 rejected')) return 'MSG91 rejected the request.'
  return message
}

export function AlertSimulatorPage() {
  const [params, setParams] = useSearchParams()
  const requestedDay = Number(params.get('day'))
  const requestedWard = params.get('ward') ?? ''
  const requestedOpen = params.get('open') === '1'
  const [wards, setWards] = useState<WardSummary[]>([])
  const [audiences, setAudiences] = useState<AlertAudience[]>([])
  const [provider, setProvider] = useState<AlertProviderStatus | null>(null)
  const [logs, setLogs] = useState<AlertLog[]>([])
  const [wardId, setWardId] = useState(requestedWard)
  const [audience, setAudience] = useState('citizens')
  const [channel, setChannel] = useState('SMS')
  const [day, setDay] = useState(Number.isInteger(requestedDay) && requestedDay >= 0 && requestedDay <= 5 ? requestedDay : 1)
  const [result, setResult] = useState<AlertSimulation | null>(null)
  const [composerOpen, setComposerOpen] = useState(requestedOpen || Boolean(requestedWard))
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [wardRows, audienceRows, providerState, logRows] = await Promise.all([getWards(day), getAlertAudiences(), getAlertProvider(), getAlerts()])
    setWards(wardRows)
    setAudiences(audienceRows)
    setProvider(providerState)
    setLogs(logRows)
    setWardId((current) => current || requestedWard || wardRows[0]?.id || '')
  }, [day, requestedWard])

  useEffect(() => { void load().catch((err) => setError(calmError(err))) }, [load])
  useEffect(() => {
    if (requestedWard) setWardId(requestedWard)
    if (requestedOpen) setComposerOpen(true)
  }, [requestedOpen, requestedWard])

  useEffect(() => {
    if (!composerOpen || !wardId || !audience) return
    let active = true
    setPreviewBusy(true)
    const timer = window.setTimeout(() => {
      void previewAlert({ ward_id: wardId, audience, channel, forecast_day: day })
        .then((next) => { if (active) setResult(next) })
        .catch((err) => { if (active) setError(calmError(err)) })
        .finally(() => { if (active) setPreviewBusy(false) })
    }, 120)
    return () => { active = false; window.clearTimeout(timer) }
  }, [audience, channel, composerOpen, day, wardId])

  const ward = wards.find((item) => item.id === wardId)
  const selectedPreview = result?.previews['Selected Preview'] ?? result?.previews['SMS Preview']
  const selectedAudience = audiences.find((item) => item.id === audience)
  const wardById = useMemo(() => new Map(wards.map((item) => [item.id, item])), [wards])
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const sentToday = logs.filter((log) => !log.simulated && new Date(log.generated_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === today).length
  const failed = logs.filter((log) => log.status.toUpperCase().includes('FAILED')).length
  const active = logs.filter((log) => !log.status.toUpperCase().includes('FAILED')).length

  const closeComposer = () => {
    setComposerOpen(false)
    setConfirmOpen(false)
    setError('')
    const next = new URLSearchParams(params)
    next.delete('open')
    setParams(next, { replace: true })
  }

  const generatePreview = async () => {
    if (!wardId) return
    setBusy(true)
    setError('')
    try {
      setResult(await simulateAlert({ ward_id: wardId, audience, channel, forecast_day: day }))
      clearApiCache()
      setLogs(await getAlerts())
    } catch (err) {
      setError(calmError(err))
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    if (!wardId || !provider?.configured || channel !== 'SMS') return
    setBusy(true)
    setError('')
    try {
      setResult(await sendTestAlert({ ward_id: wardId, audience, channel, forecast_day: day, recipient: null, confirm: true, confirmation_text: 'SEND TEST SMS' }))
      setConfirmOpen(false)
      clearApiCache()
      setLogs(await getAlerts())
    } catch (err) {
      setConfirmOpen(false)
      setError(calmError(err))
      setLogs(await getAlerts())
    } finally {
      setBusy(false)
    }
  }

  if (error && !wards.length) return <AppShell city="Mumbai"><ErrorState message={error} /></AppShell>
  if (!wards.length || !audiences.length || !provider) return <AppShell city="Mumbai"><LoadingState label="Loading alert history and provider status…" /></AppShell>

  return <AppShell city="Mumbai">
    <div className="alerts-page-head"><div><h1>Alerts</h1><p>Ward warning history and controlled test delivery.</p></div><button className="create-alert-button" onClick={() => setComposerOpen(true)}><Plus size={14} />Create Alert</button></div>

    <section className="alerts-summary-strip" aria-label="Alert summary">
      <div><span>Active Alerts</span><strong>{active}</strong></div>
      <div><span>Sent Today</span><strong>{sentToday}</strong></div>
      <div><span>Failed</span><strong>{failed}</strong></div>
      <div><span>Gateway</span><strong>{provider.provider === 'msg91_test' ? 'MSG91' : 'Simulation'}</strong><small>{provider.configured ? 'Ready' : 'Not configured'}</small></div>
    </section>

    <section className="alerts-history-panel">
      <header><div><h2>Alert History</h2><span>{logs.length} recorded events</span></div><button onClick={() => void load()} aria-label="Refresh alert history"><RefreshCw size={14} /></button></header>
      <div className="alerts-table-wrap"><table className="alerts-history-table"><thead><tr><th>Time</th><th>Ward</th><th>Severity</th><th>Audience</th><th>Recipient</th><th>Channel</th><th>Status</th></tr></thead><tbody>{logs.map((log) => {
        const target = log.ward_id ? wardById.get(log.ward_id) : undefined
        const status = compactStatus(log)
        return <tr key={log.id}><td>{new Date(log.generated_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })}</td><td>{target?.code ?? log.ward_id?.replace('BMC-', '') ?? '—'}</td><td>{target ? <RiskBadge category={target.risk_category} /> : '—'}</td><td>{log.audience}</td><td>{maskPhone(log.recipient)}</td><td>{log.channel}</td><td><span className={`alert-status-text alert-status-${status.tone}`} title={status.detail}>{status.label}</span></td></tr>
      })}{!logs.length && <tr><td colSpan={7}>No alert history recorded.</td></tr>}</tbody></table></div>
    </section>

    {composerOpen && <div className="alert-composer-overlay" onMouseDown={closeComposer}>
      <section className="alert-composer-dialog" role="dialog" aria-modal="true" aria-labelledby="alert-composer-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span>Controlled prototype warning</span><h2 id="alert-composer-title">Create Alert</h2></div><button onClick={closeComposer} aria-label="Close alert composer"><X size={16} /></button></header>
        <div className="alert-composer-body">
          <div className="alert-composer-fields">
            <label><span>Ward</span><select value={wardId} onChange={(event) => setWardId(event.target.value)}>{wards.map((item) => <option value={item.id} key={item.id}>{item.code} Ward · {item.locality}</option>)}</select></label>
            <div className="composer-readonly"><span>Risk Level</span>{ward ? <RiskBadge category={ward.risk_category} /> : '—'}</div>
            <label><span>Forecast Period</span><select value={day} onChange={(event) => setDay(Number(event.target.value))}>{[0, 1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value === 0 ? 'Today' : value === 1 ? '+24h' : value <= 3 ? `+${value * 24}h` : `+${value}d`}</option>)}</select></label>
            <label><span>Audience</span><select value={audience} onChange={(event) => setAudience(event.target.value)}>{audiences.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <div className="composer-readonly"><span>Recipient / Group</span><strong>{selectedAudience?.recipient_group ?? '—'}</strong></div>
            <label><span>Channel</span><select value={channel} onChange={(event) => setChannel(event.target.value)}><option value="SMS">SMS</option><option value="WhatsApp">WhatsApp</option></select></label>
            <div className="composer-readonly"><span>Test Recipient</span><strong>{provider.test_recipient ?? 'Not configured'}</strong></div>
          </div>

          <div className="alert-message-preview">
            <div><span>Message Preview</span><em>{previewBusy ? 'Updating…' : result ? result.simulated ? 'Preview ready' : result.status.replaceAll('_', ' ') : 'Waiting'}</em></div>
            {selectedPreview ? <><pre>{selectedPreview.message}</pre><button onClick={() => void navigator.clipboard?.writeText(selectedPreview.message)}><Clipboard size={13} />Copy</button></> : <p>Preparing an audience-specific preview from the selected ward and forecast period.</p>}
          </div>

          {error && <div className="alert-calm-error"><AlertTriangle size={13} />{error}</div>}
          <div className="alert-provider-note"><span>{provider.configured ? 'MSG91 test mode' : 'Simulation mode'}</span><p>{provider.status_detail}</p></div>
        </div>
        <footer><button onClick={() => void generatePreview()} disabled={busy || previewBusy}><MessageSquare size={13} />{busy ? 'Working…' : 'Record Simulation'}</button><button className="send-test-button" onClick={() => setConfirmOpen(true)} disabled={!provider.configured || !result || channel !== 'SMS' || busy}><Send size={13} />Send Test SMS</button></footer>
      </section>
    </div>}

    {confirmOpen && ward && <div className="alert-confirm-overlay" onMouseDown={() => setConfirmOpen(false)}><section className="alert-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="alert-confirm-title" onMouseDown={(event) => event.stopPropagation()}><header><h2 id="alert-confirm-title">Send test SMS?</h2><button onClick={() => setConfirmOpen(false)} aria-label="Close confirmation"><X size={15} /></button></header><div><p><span>Ward</span><strong>{ward.code} Ward</strong></p><p><span>Recipient</span><strong>{provider.test_recipient}</strong></p><p><span>Risk</span><RiskBadge category={ward.risk_category} /></p></div><footer><button onClick={() => setConfirmOpen(false)}>Cancel</button><button onClick={() => void send()} disabled={busy}>Confirm Send</button></footer></section></div>}
  </AppShell>
}
