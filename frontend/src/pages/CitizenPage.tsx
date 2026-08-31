import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Clock3, Droplets, HeartHandshake, MapPin, ShieldAlert, Sun, Users, Wind } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ErrorState, LoadingState } from '../components/LoadingState'
import { RiskBadge } from '../components/RiskBadge'
import { getWardRisk, getWards } from '../services/api'
import type { WardDetail, WardSummary } from '../types'

export function CitizenPage() {
  const [wards, setWards] = useState<WardSummary[]>([])
  const [selectedId, setSelectedId] = useState('BMC-ME')
  const [ward, setWard] = useState<WardDetail | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { void getWards().then((data) => { setWards(data); if (!data.some((item) => item.id === selectedId)) setSelectedId(data[0]?.id ?? '') }).catch((err) => setError(err instanceof Error ? err.message : 'Unable to load locations')) }, [])
  useEffect(() => { if (selectedId) void getWardRisk(selectedId).then(setWard).catch((err) => setError(err instanceof Error ? err.message : 'Unable to load location')) }, [selectedId])
  const dangerWindow = useMemo(() => ward && ward.risk_category !== 'LOW' ? '12 PM – 4 PM' : '1 PM – 3 PM', [ward])
  if (error) return <AppShell><ErrorState message={error} /></AppShell>
  if (!ward || !wards.length) return <AppShell><LoadingState label="Preparing public heat view…" /></AppShell>
  const recommendations = ward.risk_category === 'EXTREME' || ward.risk_category === 'DANGEROUS' ? ['Avoid strenuous outdoor activity during the peak window.', 'Drink water regularly and use shaded or cooled spaces.', 'Check on elderly family members, children and neighbours.'] : ['Keep water nearby and take regular shade breaks.', 'Plan strenuous outdoor work for the cooler morning or evening.', 'Check on people who may need extra support.']
  return <AppShell source={ward.data_flags.weather_demo ? 'DEMO FALLBACK' : 'IMD CONNECTED'} city={ward.city}>
    <div className="citizen-top"><Link to="/" className="back-link"><ArrowLeft size={15} />Control room</Link><span className="public-tag"><HeartHandshake size={14} />PUBLIC HEAT SAFETY</span></div>
    <div className="citizen-wrap"><div className="citizen-heading"><div className="eyebrow"><span className="eyebrow-line" />SIMPLE LOCAL GUIDANCE</div><h1>How hot will it feel today?</h1><p>Choose your BMC administrative ward for a plain-language heat safety brief.</p><label className="location-select"><MapPin size={17} /><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{wards.map((item) => <option value={item.id} key={item.id}>{item.code} Ward · {item.locality}</option>)}</select></label></div><div className={`citizen-risk-card citizen-risk-${ward.risk_category.toLowerCase()}`}><div className="citizen-risk-top"><div><span className="citizen-label">HEAT RISK TODAY</span><h2>{ward.risk_category === 'EXTREME' ? 'Extreme heat risk' : `${ward.risk_category[0]}${ward.risk_category.slice(1).toLowerCase()} heat risk`}</h2><p>Based on the loaded weather scenario and vulnerability profile for this ward.</p></div><RiskBadge category={ward.risk_category} /></div><div className="citizen-score"><strong>{ward.htsi.toFixed(0)}</strong><span>HTSI / 100</span></div><div className="citizen-condition-row"><div><Sun size={17} /><span>Feels like</span><strong>{ward.heat_index.toFixed(1)}°C</strong></div><div><Clock3 size={17} /><span>Peak concern</span><strong>{dangerWindow}</strong></div><div><Wind size={17} /><span>Tomorrow</span><strong>{ward.forecast?.[1]?.risk_category ?? 'Check again'}</strong></div></div></div><div className="citizen-grid"><section className="citizen-card"><div className="citizen-card-heading"><ShieldAlert size={18} /><h3>Who should take extra care?</h3></div><div className="group-chips"><span><Users size={15} />Older adults</span><span><Users size={15} />Children</span><span><Wind size={15} />Outdoor workers</span></div><p className="citizen-muted">This exercise layer has a population vulnerability score of <strong>{ward.vulnerability_index.toFixed(0)} / 100</strong>. Please check on people who live or work in heat-exposed places.</p></section><section className="citizen-card"><div className="citizen-card-heading"><Droplets size={18} /><h3>What you can do</h3></div><div className="citizen-advice">{recommendations.map((item) => <div key={item}><span><Check size={13} /></span>{item}</div>)}</div></section></div><div className="citizen-footer-note"><span><InfoIcon /></span><p>HeatShield is decision-support, not a medical diagnosis. Default weather and demographics are labelled demo fallbacks. If someone has confusion, fainting, severe weakness or trouble breathing, seek urgent medical help.</p></div></div>
  </AppShell>
}

function InfoIcon() { return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg> }
