import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity,
  BellRing,
  ChevronRight,
  CircleDot,
  Command,
  Database,
  FileSearch,
  Gauge,
  MapPin,
  Menu,
  RadioTower,
  Search,
  ShieldCheck,
  TableProperties,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { getWards } from '../services/api'
import type { WardSummary } from '../types'

const navItems = [
  { to: '/', label: 'Control room', icon: Gauge, end: true },
  { to: '/alerts', label: 'Alert console', icon: BellRing },
  { to: '/sources', label: 'Data sources', icon: RadioTower },
  { to: '/explorer', label: 'Data explorer', icon: TableProperties },
  { to: '/citizen', label: 'Public brief', icon: Users },
]

const routeLabels: Record<string, string> = {
  '/': 'CONTROL ROOM',
  '/alerts': 'ALERT CONSOLE',
  '/sources': 'DATA SOURCES',
  '/explorer': 'DATA EXPLORER',
  '/citizen': 'PUBLIC BRIEF',
}

interface PaletteItem {
  id: string
  label: string
  detail: string
  path: string
  kind: 'COMMAND' | 'WARD'
}

export function AppShell({ children, source = 'DEMO FALLBACK', city = 'Mumbai' }: { children: ReactNode; source?: string; city?: string }) {
  const [open, setOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [clock, setClock] = useState(() => new Date())
  const [wards, setWards] = useState<WardSummary[]>([])
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((value) => !value)
      }
      if (event.key === 'Escape') setPaletteOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (!paletteOpen || wards.length) return
    void getWards().then(setWards).catch(() => undefined)
  }, [paletteOpen, wards.length])

  const paletteItems = useMemo<PaletteItem[]>(() => [
    { id: 'control', label: 'Open control room', detail: 'Map and municipal heat-health posture', path: '/', kind: 'COMMAND' },
    { id: 'alerts', label: 'Open alert console', detail: 'Preview, test gate and delivery logs', path: '/alerts', kind: 'COMMAND' },
    { id: 'sources', label: 'Inspect data-source status', detail: 'Authority, freshness, credentials and fallbacks', path: '/sources', kind: 'COMMAND' },
    { id: 'explorer', label: 'Inspect ward data table', detail: 'Transparent metric values and CSV export', path: '/explorer', kind: 'COMMAND' },
    ...wards.map((ward) => ({ id: ward.id, label: ward.name, detail: `${ward.risk_category} · HTSI ${ward.htsi.toFixed(0)} · ${ward.locality}`, path: `/ward/${ward.id}`, kind: 'WARD' as const })),
  ], [wards])
  const filtered = paletteItems.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(query.toLowerCase())).slice(0, 10)
  const currentLabel = location.pathname.startsWith('/ward/') ? 'WARD BRIEF' : routeLabels[location.pathname] ?? 'OPERATIONS'
  const sourceClass = source.toLowerCase().includes('demo') ? 'source-warning' : 'source-connected'

  const run = (item: PaletteItem) => {
    setPaletteOpen(false)
    setQuery('')
    navigate(item.path)
  }

  return <div className="app-shell">
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="brand-block">
        <div className="brand-mark"><Activity size={18} strokeWidth={2.4} /></div>
        <div><div className="brand-name">HEAT<span>SHIELD</span></div><div className="brand-subtitle">MUMBAI / SIH26083</div></div>
        <button className="mobile-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={18} /></button>
      </div>
      <div className="nav-kicker">MUNICIPAL OPERATIONS</div>
      <nav className="primary-nav">
        {navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}><Icon size={16} /><span>{label}</span>{label === 'Control room' && <span className="live-pill">LOCAL</span>}</NavLink>)}
      </nav>
      <div className="nav-kicker nav-kicker-lower">OPERATIONAL SCOPE</div>
      <div className="ops-scope">
        <div><MapPin size={14} /><span><strong>24</strong>BMC admin wards</span></div>
        <div><ShieldCheck size={14} /><span><strong>Local</strong>no deployment</span></div>
        <div><Database size={14} /><span><strong>SQLite</strong>auditable state</span></div>
      </div>
      <div className="sidebar-bottom">
        <div className="system-status"><span className="status-pulse" />Decision engine online</div>
        <div className="sidebar-version">v0.2 · municipal prototype</div>
      </div>
    </aside>
    {open && <button className="sidebar-scrim" onClick={() => setOpen(false)} aria-label="Close navigation" />}
    <div className="main-column">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
        <div className="crumbs"><span>HEAT-HEALTH OPS</span><ChevronRight size={13} /><strong>{currentLabel}</strong></div>
        <div className="topbar-center"><label className="city-selector"><MapPin size={13} /><span>BMC JURISDICTION</span><select aria-label="Current city" value={city} onChange={() => undefined}><option value={city}>{city}</option></select></label></div>
        <div className="topbar-right">
          <div className="clock"><span className="clock-label">IST</span><span>{clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })}</span></div>
          <NavLink to="/sources" className={`source-chip ${sourceClass}`}><span className="source-dot" />{source}</NavLink>
          <button className="command-button" onClick={() => setPaletteOpen(true)}><Search size={15} /><span>Command</span><kbd>Ctrl K</kbd></button>
        </div>
      </header>
      <main className="page-content">{children}</main>
      <footer className="app-footer"><span><CircleDot size={12} /> HeatShield local decision-support</span><span>Actual BMC boundary snapshot · fallback data visibly labelled · no deployment</span></footer>
    </div>
    {paletteOpen && <div className="command-overlay" role="presentation" onMouseDown={() => setPaletteOpen(false)}>
      <div className="command-palette" role="dialog" aria-modal="true" aria-label="HeatShield command palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="command-input"><Command size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search wards, sources, alerts, commands…" /><kbd>ESC</kbd></div>
        <div className="command-results">{filtered.length ? filtered.map((item) => <button key={item.id} onClick={() => run(item)}><span className="command-result-icon">{item.kind === 'WARD' ? <MapPin size={15} /> : <Zap size={15} />}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span><em>{item.kind}</em></button>) : <div className="command-empty"><FileSearch size={22} />No matching command or ward</div>}</div>
        <div className="command-footer"><span>↑↓ navigate</span><span>↵ open</span><span>Esc close</span></div>
      </div>
    </div>}
  </div>
}
