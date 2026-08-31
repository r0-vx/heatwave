import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { AppShell } from '../components/AppShell'
import { ErrorState, LoadingState } from '../components/LoadingState'
import { clearApiCache, getAlertProvider, getSystemStatus, refreshSystemStatus } from '../services/api'
import type { AlertProviderStatus, SystemStatus } from '../types'

export function SystemSettingsPage() {
  const [system, setSystem] = useState<SystemStatus | null>(null)
  const [provider, setProvider] = useState<AlertProviderStatus | null>(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    const [systemState, providerState] = await Promise.all([getSystemStatus(), getAlertProvider()])
    setSystem(systemState)
    setProvider(providerState)
  }
  useEffect(() => { void load().catch((err) => setError(err instanceof Error ? err.message : 'Unable to load system settings')) }, [])

  const refresh = async () => {
    setRefreshing(true)
    try {
      await refreshSystemStatus()
      clearApiCache()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh system status')
    } finally {
      setRefreshing(false)
    }
  }

  if (error && !system) return <AppShell><ErrorState message={error} /></AppShell>
  if (!system || !provider) return <AppShell><LoadingState label="Loading system settings…" /></AppShell>

  return <AppShell city={system.city} updatedAt={system.as_of} onRefresh={() => void refresh()} refreshing={refreshing}>
    <div className="ops-page-head"><div><h1>System Settings</h1><p>Local runtime status and non-deployment operating mode.</p></div><button className="ops-button" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={13} className={refreshing ? 'spin' : ''} />Refresh</button></div>
    <section className="reference-panel settings-status-panel">
      <div className="reference-panel-head"><h2>Runtime components</h2><div><span className="data-mode-label">{system.mode.replaceAll('_', ' ')}</span></div></div>
      <div className="settings-status-table"><div><span>Component</span><span>Status</span><span>Detail</span></div>{system.components.map((component) => <div key={component.name}><strong>{component.name}</strong><span className={`system-state-text state-${component.status.toLowerCase().replaceAll('_', '-')}`}>{component.status.replaceAll('_', ' ')}</span><span>{component.detail}</span></div>)}</div>
    </section>
    <section className="reference-panel settings-alert-panel">
      <div className="reference-panel-head"><h2>Alert Provider</h2><div><span className="data-mode-label">{provider.configured ? 'Ready' : 'Not configured'}</span></div></div>
      <div className="settings-status-table"><div><span>Setting</span><span>Status</span><span>Detail</span></div><div><strong>Provider</strong><span className="system-state-text">{provider.provider === 'msg91_test' ? 'MSG91' : 'Simulation'}</span><span>{provider.status_detail}</span></div><div><strong>Test mode</strong><span className={`system-state-text ${provider.configured ? 'state-test-ready' : 'state-simulation-only'}`}>{provider.mode === 'TEST_SMS' ? 'Enabled' : 'Disabled'}</span><span>External delivery remains restricted to the configured test recipient.</span></div><div><strong>Allowed Test Recipient</strong><span className="system-state-text">{provider.test_recipient ?? 'Not set'}</span><span>The full number and all gateway secrets remain server-side.</span></div><div><strong>Gateway configuration</strong><span className={`system-state-text ${provider.configured ? 'state-connected' : 'state-missing-credentials'}`}>{provider.configured ? 'Ready' : 'Not configured'}</span><span>{provider.requirements.join(' · ')}</span></div></div>
    </section>
    <section className="reference-panel settings-local-panel"><div className="reference-panel-head"><h2>Local operation</h2></div><div className="settings-local-copy"><p>Deployment and bulk alert broadcasting remain disabled. Theme and sidebar preferences are stored only in this browser.</p><p>Active fallbacks: {system.active_fallbacks.length ? system.active_fallbacks.join(' · ') : 'None'}</p></div></section>
  </AppShell>
}
