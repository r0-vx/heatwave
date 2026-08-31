import type { FeatureCollection, Geometry as GeoGeometry } from 'geojson'

export type RiskCategory = 'LOW' | 'CAUTION' | 'HIGH' | 'DANGEROUS' | 'EXTREME'

export interface Demographics {
  elderly_pct: number
  children_pct: number
  outdoor_worker_pct: number
  population_density: number
  slum_indicator: number
  green_cover_pct: number | null
  historical_hospitalization_rate: number
  historical_mortality_rate: number
  source: string
}

export interface DataFlags {
  geometry_demo: boolean
  weather_demo: boolean
  demographics_demo: boolean
  health_outcomes_validated: boolean
}

export interface WardSummary {
  id: string
  code: string
  name: string
  locality: string
  city: string
  state: string
  population: number
  population_source: string
  geometry?: GeoGeometry
  geometry_source: string
  temperature: number
  humidity: number
  wind_speed: number
  solar_radiation: number | null
  rainfall: number | null
  forecast_time: string
  day_offset: number
  heat_index: number
  wbgt: number
  utci: number
  htsi: number
  risk_category: RiskCategory
  vulnerability_index: number
  vulnerability_reasons: string[]
  health_risk: number
  hospitalization_risk: string
  mortality_risk: string
  confidence: number
  explanation: string[]
  major_vulnerable_group: string
  intervention: string
  source: string
  weather_is_estimated: boolean
  is_demo: boolean
  data_flags: DataFlags
}

export interface ForecastAggregate {
  day_offset: number
  label: string
  date: string
  max_temperature: number
  average_htsi: number
  max_htsi: number
  risk_category: RiskCategory
  highest_risk_ward: string
  high_risk_ward_count: number
}

export interface DashboardSummary {
  city: string
  state: string
  as_of: string
  source: string
  provider: string
  is_demo: boolean
  metrics: {
    temperature: number
    heat_index: number
    wbgt: number
    utci: number
    htsi: number
    risk_category: RiskCategory
    vulnerability_index: number
    health_risk: number
    highest_risk_ward: string
    highest_risk_ward_id: string
    high_risk_ward_count: number
  }
  wards: WardSummary[]
  forecast: ForecastAggregate[]
  alerts: SystemAlert[]
  provenance: Record<string, string>
  disclaimer: string
}

export interface SystemAlert {
  severity: string
  title: string
  detail: string
}

export interface WardDetail extends WardSummary {
  geometry: GeoGeometry
  demographics: Demographics
  pvi_components: Record<string, number>
  health_history: {
    period: string
    heat_hospitalizations: number
    heat_mortality: number
    population_at_risk: number
    source: string
    is_validated: boolean
  } | null
  forecast?: WardSummary[]
}

export interface ActionTask {
  task_key: string
  title: string
  action: string
  severity: string
  owner: string
  trigger: string
  rationale: string
  resource_notes: string
  status: 'PENDING' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'COMPLETE'
  operator?: string
  updated_at?: string
}

export interface ActionPlan {
  ward: string
  risk_category: RiskCategory
  summary: string
  actions: ActionTask[]
  audiences: string[]
  drivers: string[]
  source: string
  source_url: string
  generated_at: string
}

export interface AlertSimulation {
  id: number | null
  ward_id: string
  ward_name: string
  risk_category: RiskCategory
  generated_at: string
  simulated: boolean
  status: string
  provider: string
  recipient: string | null
  message_id?: string | null
  delivery_confirmed?: boolean
  previews: Record<string, { audience: string; message: string }>
  drivers: string[]
}

export interface AlertProviderStatus {
  provider: string
  mode: 'TEST_SMS' | 'SIMULATION_ONLY'
  configured: boolean
  test_recipient: string | null
  requirements: string[]
  status_detail: string
}

export interface AlertAudience {
  id: string
  label: string
  recipient_group: string
  title: string
}

export interface AlertLog {
  id: number
  ward_id: string | null
  audience: string
  channel: string
  title: string
  message: string
  generated_at: string
  status: string
  simulated: boolean
  provider: string
  recipient: string | null
  message_id: string | null
  delivery_confirmed: boolean
}

export interface SourceStatus {
  id: string
  name: string
  kind: string
  authority: string
  status: string
  status_detail: string
  last_success: string | null
  freshness: string
  source_url: string
  reference_url: string
  license: string
  credentials_required: boolean
  configuration: string[]
  in_use: boolean
  fallback: string | null
  quality_note: string
}

export interface SourcesResponse {
  as_of: string
  sources: SourceStatus[]
  connected: number
  attention: number
}

export interface SystemEvent {
  id: number
  timestamp: string
  severity: string
  category: string
  source: string
  message: string
  payload: Record<string, unknown>
}

export interface SystemStatus {
  as_of: string
  mode: string
  city: string
  ward_count: number
  active_fallbacks: string[]
  components: Array<{ name: string; status: string; detail: string }>
}

export type WardBoundaryCollection = FeatureCollection<GeoGeometry, { id: string; code: string; name: string; locality: string; label_lon: number; label_lat: number }> & {
  properties?: { name: string; crs: string; feature_count: number; source: string }
}
