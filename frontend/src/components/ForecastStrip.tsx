import { ArrowDown, ArrowUp, CalendarDays, ThermometerSun } from 'lucide-react'
import type { ForecastAggregate } from '../types'
import { RiskBadge } from './RiskBadge'

export function ForecastStrip({ forecast, selectedDay, onSelect }: { forecast: ForecastAggregate[]; selectedDay: number; onSelect: (day: number) => void }) {
  return <div className="forecast-strip">{forecast.map((day, index) => {
    const active = day.day_offset === selectedDay
    const delta = index === 0 ? 0 : day.max_temperature - forecast[index - 1].max_temperature
    return <button key={day.day_offset} className={`forecast-card ${active ? 'forecast-active' : ''}`} onClick={() => onSelect(day.day_offset)}>
      <div className="forecast-day"><span>{day.label}</span><CalendarDays size={14} /></div>
      <div className="forecast-temp">{day.max_temperature.toFixed(1)}°<span>C</span></div>
      <RiskBadge category={day.risk_category} compact />
      <div className="forecast-foot"><span>HTSI <strong>{day.max_htsi.toFixed(0)}</strong></span>{index > 0 && <span className={delta > 0 ? 'delta-up' : 'delta-down'}>{delta > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{Math.abs(delta).toFixed(1)}°</span>}</div>
      {index === 0 && <div className="forecast-caption"><ThermometerSun size={12} /> current window</div>}
    </button>
  })}</div>
}
