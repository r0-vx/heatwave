import type {
  ActionPlan,
  AlertAudience,
  AlertLog,
  AlertProviderStatus,
  AlertSimulation,
  DashboardSummary,
  SourcesResponse,
  SystemEvent,
  SystemStatus,
  WardBoundaryCollection,
  WardDetail,
  WardSummary,
} from '../types'

const cache = new Map<string, { expires: number; value: unknown }>()
let boundaryRequest: Promise<WardBoundaryCollection> | null = null
const configuredApiBase = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
const apiBase = configuredApiBase.endsWith('/api') ? configuredApiBase : `${configuredApiBase}/api`

const api = async <T>(path: string, options?: RequestInit, cacheMs = 0): Promise<T> => {
  const cacheKey = `${options?.method ?? 'GET'}:${path}`
  const cached = cache.get(cacheKey)
  if (cacheMs && cached && cached.expires > Date.now()) return cached.value as T
  const response = await fetch(`${apiBase}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  })
  if (!response.ok) {
    let detail = `Request failed with ${response.status}`
    try {
      const body = await response.json() as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      const body = await response.text()
      if (body) detail = body
    }
    throw new Error(detail)
  }
  const value = await response.json() as T
  if (cacheMs) cache.set(cacheKey, { expires: Date.now() + cacheMs, value })
  return value
}

export const clearApiCache = () => cache.clear()

export const getDashboardSummary = () => api<DashboardSummary>('/dashboard/summary', undefined, 15_000)

export const getWards = (forecastDay = 0, riskLevel?: string, minVulnerability?: number) => {
  const params = new URLSearchParams({ forecast_day: String(forecastDay) })
  if (riskLevel) params.set('risk_level', riskLevel)
  if (minVulnerability !== undefined) params.set('min_vulnerability', String(minVulnerability))
  return api<WardSummary[]>(`/wards?${params.toString()}`, undefined, 10_000)
}

export const getWardBoundaries = () => {
  boundaryRequest ??= api<WardBoundaryCollection>('/map/wards', undefined, 60 * 60 * 1000)
  return boundaryRequest
}

export const getWard = (wardId: string, forecastDay = 0) =>
  api<WardDetail>(`/wards/${encodeURIComponent(wardId)}?forecast_day=${forecastDay}`, undefined, 10_000)

export const getWardForecast = (wardId: string) =>
  api<WardSummary[]>(`/wards/${encodeURIComponent(wardId)}/forecast`, undefined, 10_000)

export const getWardRisk = (wardId: string) => api<WardDetail>(`/wards/${encodeURIComponent(wardId)}/risk`, undefined, 10_000)

export const getActionPlan = (wardId: string, forecastDay = 0) =>
  api<ActionPlan>(`/action-plan/${encodeURIComponent(wardId)}?forecast_day=${forecastDay}`, undefined, 5_000)

export const updateActionTask = (wardId: string, taskKey: string, status: ActionPlan['actions'][number]['status'], forecastDay = 0) =>
  api<ActionPlan>(`/action-plan/${encodeURIComponent(wardId)}/tasks/${encodeURIComponent(taskKey)}?forecast_day=${forecastDay}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, operator: 'Local control-room operator' }),
  })

export const simulateAlert = (payload: { ward_id: string; audience: string; channel: string; forecast_day: number }) =>
  api<AlertSimulation>('/alerts/simulate', { method: 'POST', body: JSON.stringify(payload) })

export const previewAlert = (payload: { ward_id: string; audience: string; channel: string; forecast_day: number }) =>
  api<AlertSimulation>('/alerts/preview', { method: 'POST', body: JSON.stringify(payload) })

export const sendTestAlert = (payload: {
  ward_id: string
  audience: string
  channel: string
  forecast_day: number
  recipient?: string | null
  confirm: boolean
  confirmation_text: string
}) => api<AlertSimulation>('/alerts/send-test', { method: 'POST', body: JSON.stringify(payload) })

export const getAlerts = () => api<AlertLog[]>('/alerts', undefined, 3_000)
export const getAlertAudiences = () => api<AlertAudience[]>('/alerts/audiences', undefined, 60_000)
export const getAlertProvider = () => api<AlertProviderStatus>('/alerts/provider', undefined, 5_000)
export const getSources = () => api<SourcesResponse>('/sources', undefined, 10_000)
export const getSystemStatus = () => api<SystemStatus>('/system/status', undefined, 10_000)
export const getEvents = (limit = 30) => api<SystemEvent[]>(`/events?limit=${limit}`, undefined, 3_000)
export const refreshSystemStatus = () => api<{ status: string; message: string; event_id: number; data_mutated: boolean; as_of: string }>('/system/refresh', { method: 'POST' })
