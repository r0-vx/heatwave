import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  Command,
  Database,
  EllipsisVertical,
  FileSearch,
  LayoutDashboard,
  Map,
  MapPin,
  Menu,
  Moon,
  PanelLeftClose,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Sun,
  X,
  Zap,
} from 'lucide-react'
import { getWards } from '../services/api'
import type { WardSummary } from '../types'

interface AppShellProps {
  children: ReactNode
  source?: string
  city?: string
  updatedAt?: string
  forecastCycle?: string
  systemState?: string
  onRefresh?: () => void
  refreshing?: boolean
}

interface PaletteItem {
  id: string
  label: string
  detail: string
  path: string
  kind: 'COMMAND' | 'FILTER' | 'WARD'
}

const sidebarItems = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { id: 'map', label: 'Map', path: '/map', icon: Map },
  { id: 'forecast', label: 'Forecast', path: '/forecast', icon: ChartNoAxesCombined },
  { id: 'alerts', label: 'Alerts', path: '/alerts', icon: Bell },
]

function formatUpdate(value?: string) {
  const date = value ? new Date(value) : new Date()
  const datePart = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
  const timePart = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
  return `${datePart}, ${timePart} IST`
}

export function AppShell({ children, city = 'Mumbai', updatedAt, onRefresh, refreshing = false }: AppShellProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem('heatshield-sidebar') === 'collapsed')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(() => location.pathname === '/sources' || location.pathname === '/settings')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => window.localStorage.getItem('heatshield-theme') === 'light' ? 'light' : 'dark')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [wards, setWards] = useState<WardSummary[]>([])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('heatshield-theme', theme)
    window.dispatchEvent(new CustomEvent('heatshield:theme-change', { detail: theme }))
  }, [theme])

  useEffect(() => {
    window.localStorage.setItem('heatshield-sidebar', collapsed ? 'collapsed' : 'expanded')
    window.dispatchEvent(new Event('heatshield:layout-change'))
    const timer = window.setTimeout(() => window.dispatchEvent(new Event('heatshield:layout-change')), 220)
    return () => window.clearTimeout(timer)
  }, [collapsed])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((value) => !value)
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false)
        setMobileOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!paletteOpen || wards.length) return
    void getWards().then(setWards).catch(() => undefined)
  }, [paletteOpen, wards.length])

  const paletteItems = useMemo<PaletteItem[]>(() => [
    { id: 'dashboard', label: 'Open dashboard', detail: 'Mumbai current overview', path: '/', kind: 'COMMAND' },
    { id: 'map', label: 'Open map', detail: 'Mumbai BMC ward risk surface', path: '/map', kind: 'COMMAND' },
    { id: 'forecast', label: 'Open forecast', detail: 'Explore risk across forecast time', path: '/forecast', kind: 'COMMAND' },
    { id: 'extreme', label: 'Show extreme wards', detail: 'Filter the map to extreme risk', path: '/map?risk=EXTREME', kind: 'FILTER' },
    { id: 'plus48', label: 'Show +48h forecast', detail: 'Display the Day +2 ward layer', path: '/forecast?step=48', kind: 'FILTER' },
    { id: 'alerts', label: 'Open alerts', detail: 'Review preview and MSG91 test controls', path: '/alerts', kind: 'COMMAND' },
    { id: 'sources', label: 'Open data sources', detail: 'Inspect provenance and provider status', path: '/sources', kind: 'COMMAND' },
    { id: 'refresh', label: 'Refresh data', detail: 'Recheck configured providers', path: '/?command=refresh', kind: 'COMMAND' },
    { id: 'reset-map', label: 'Reset map', detail: 'Fit all Mumbai ward boundaries', path: '/map?command=reset-map', kind: 'COMMAND' },
    ...wards.map((ward) => ({ id: ward.id, label: `${ward.code} Ward`, detail: `${ward.locality} · ${ward.risk_category} · HTSI ${ward.htsi.toFixed(0)}`, path: `/map?ward=${encodeURIComponent(ward.id)}`, kind: 'WARD' as const })),
  ], [wards])

  const queryTerms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const filtered = paletteItems.filter((item) => {
    const searchable = `${item.label} ${item.detail}`.toLowerCase()
    return queryTerms.every((term) => searchable.includes(term))
  }).slice(0, 12)

  useEffect(() => { setActiveIndex(0) }, [paletteOpen, query])

  const run = (item: PaletteItem) => {
    setPaletteOpen(false)
    setQuery('')
    navigate(item.path)
  }

  const handlePaletteKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!filtered.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % filtered.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + filtered.length) % filtered.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      run(filtered[activeIndex] ?? filtered[0])
    }
  }

  const isActive = (id: string) => {
    if (id === 'dashboard') return location.pathname === '/'
    if (id === 'map') return location.pathname === '/map' || location.pathname === '/explorer' || location.pathname.startsWith('/ward/')
    if (id === 'forecast') return location.pathname === '/forecast'
    return id === 'alerts' && location.pathname === '/alerts'
  }

  const toggleNavigation = () => {
    if (window.matchMedia('(max-width: 820px)').matches) setMobileOpen((value) => !value)
    else setCollapsed((value) => !value)
  }

  const handleRefresh = () => {
    if (onRefresh) onRefresh()
    else window.location.reload()
  }

  return <div className={`app-shell ${collapsed ? 'shell-collapsed' : ''}`}>
    <header className="final-topbar">
      <div className="header-left">
        <button className="header-icon-button" onClick={toggleNavigation} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}><Menu size={17} /></button>
        <label className="header-city"><MapPin size={12} /><select value={city} onChange={() => undefined} aria-label="Current city"><option value={city}>{city}</option></select><ChevronDown size={11} /></label>
      </div>
      <div className="header-right">
        <span className="header-updated">Last updated: {formatUpdate(updatedAt)}</span>
        <span className="header-separator" />
        <button className="header-icon-button" onClick={handleRefresh} disabled={refreshing} aria-label="Refresh data" title="Refresh data"><RefreshCw size={14} className={refreshing ? 'spin' : ''} /></button>
        <button className="header-icon-button" onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}</button>
        <button className="theme-switch" onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} aria-label={`Current theme: ${theme}`}><span className={theme === 'dark' ? 'theme-knob-dark' : ''} /></button>
        <button className="header-icon-button" onClick={() => setPaletteOpen(true)} aria-label="Open utilities and command palette" title="Command palette (Ctrl+K)"><EllipsisVertical size={15} /></button>
      </div>
    </header>

    <aside className={`final-sidebar ${mobileOpen ? 'sidebar-mobile-open' : ''}`}>
      <nav className="final-nav" aria-label="Primary navigation">
        {sidebarItems.map(({ id, label, path, icon: Icon }) => <Link key={id} to={path} title={collapsed ? label : undefined} onClick={() => setMobileOpen(false)} className={`final-nav-link ${isActive(id) ? 'final-nav-active' : ''}`}><Icon size={18} /><span>{label}</span></Link>)}
      </nav>
      <div className="settings-group">
        <button className="settings-toggle" onClick={() => setSettingsOpen((value) => !value)} title={collapsed ? 'Settings' : undefined} aria-expanded={settingsOpen}><Settings size={18} /><span>Settings</span><ChevronDown size={12} className={settingsOpen ? 'settings-chevron-open' : ''} /></button>
        {settingsOpen && <div className="settings-children">
          <Link to="/sources" title={collapsed ? 'Data Sources' : undefined} className={location.pathname === '/sources' ? 'settings-active' : ''} onClick={() => setMobileOpen(false)}><Database size={18} /><span>Data Sources</span></Link>
          <Link to="/settings" title={collapsed ? 'System Settings' : undefined} className={location.pathname === '/settings' ? 'settings-active' : ''} onClick={() => setMobileOpen(false)}><SlidersHorizontal size={18} /><span>System Settings</span></Link>
        </div>}
        <button className="sidebar-collapse" onClick={() => window.matchMedia('(max-width: 820px)').matches ? setMobileOpen(false) : setCollapsed((value) => !value)} title={collapsed ? 'Expand' : 'Collapse'}><PanelLeftClose size={18} /><span>{collapsed ? 'Expand' : 'Collapse'}</span></button>
      </div>
    </aside>
    {mobileOpen && <button className="sidebar-mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}

    <main className={`page-content ${location.pathname === '/' ? 'dashboard-page-content' : ''} ${location.pathname === '/map' || location.pathname === '/forecast' ? 'spatial-page-content' : ''}`}>{children}</main>

    {paletteOpen && <div className="command-overlay" role="presentation" onMouseDown={() => setPaletteOpen(false)}>
      <div className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="command-input"><Search size={16} /><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }} onKeyDown={handlePaletteKey} placeholder="Search commands or wards…" aria-label="Search command palette" aria-activedescendant={filtered[activeIndex] ? `command-${filtered[activeIndex].id}` : undefined} /><kbd>ESC</kbd></div>
        <div className="command-results" role="listbox">{filtered.length ? filtered.map((item, index) => <button id={`command-${item.id}`} key={item.id} onClick={() => run(item)} onMouseMove={() => setActiveIndex(index)} className={index === activeIndex ? 'command-active' : ''} role="option" aria-selected={index === activeIndex}><span className="command-result-icon">{item.kind === 'WARD' ? <MapPin size={14} /> : item.kind === 'FILTER' ? <Zap size={14} /> : <Command size={14} />}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span><em>{item.kind}</em></button>) : <div className="command-empty"><FileSearch size={20} />No matching command or ward</div>}</div>
        <div className="command-footer"><span>↑↓ navigate</span><span>↵ open</span><span>Esc close</span></div>
      </div>
    </div>}
  </div>
}
