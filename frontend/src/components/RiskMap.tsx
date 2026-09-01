import { memo, useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { ExpressionSpecification, GeoJSONSource, LngLatBoundsLike, Map as MapLibreMap, MapLayerMouseEvent, StyleSpecification } from 'maplibre-gl'
import type { FeatureCollection, Geometry } from 'geojson'
import { Layers3 } from 'lucide-react'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { WardBoundaryCollection, WardSummary } from '../types'

export type MapMetric = 'risk' | 'htsi' | 'wbgt' | 'vulnerability' | 'health'
export interface MapSelectionAnchor { x: number; y: number; width: number; height: number }
export type RiskGroup = 'low' | 'moderate' | 'high' | 'extreme'
export type RiskVisibility = Record<RiskGroup, boolean>

const MUMBAI_BOUNDS: LngLatBoundsLike = [[72.75, 18.88], [73.03, 19.32]]

maplibregl.setWorkerUrl(mapLibreWorkerUrl)

const localStyle: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#090b0c' } },
    {
      id: 'osm-dimmed',
      type: 'raster',
      source: 'osm',
      paint: {
        'raster-opacity': 0.42,
        'raster-saturation': -1,
        'raster-contrast': 0.18,
        'raster-brightness-min': 0,
        'raster-brightness-max': 0.34,
      },
    },
  ],
}

const riskExpression: ExpressionSpecification = [
  'match', ['get', 'risk_category'],
  'LOW', '#607b61',
  'CAUTION', '#9b8b45',
  'HIGH', '#b26835',
  'DANGEROUS', '#a84c39',
  'EXTREME', '#b23b30',
  '#54585a',
]

const metricExpression = (property: string, stops: Array<[number, string]>): ExpressionSpecification => [
  'interpolate', ['linear'], ['coalesce', ['get', property], 0],
  ...stops.flatMap(([value, colour]) => [value, colour]),
] as ExpressionSpecification

const expressions: Record<MapMetric, ExpressionSpecification> = {
  risk: riskExpression,
  htsi: metricExpression('htsi', [[0, '#4f5d50'], [35, '#9b8b45'], [60, '#b26835'], [80, '#a84c39'], [100, '#8a302b']]),
  wbgt: metricExpression('wbgt', [[20, '#4f5d50'], [26, '#9b8b45'], [30, '#b26835'], [34, '#a84c39'], [40, '#8a302b']]),
  vulnerability: metricExpression('vulnerability_index', [[0, '#35393a'], [40, '#555a5b'], [60, '#777a76'], [80, '#9b8b45'], [100, '#b26835']]),
  health: metricExpression('health_risk', [[0, '#4f5d50'], [35, '#9b8b45'], [60, '#b26835'], [80, '#a84c39'], [100, '#8a302b']]),
}

const legends: Record<MapMetric, Array<[string, string]>> = {
  risk: [['Low', '#607b61'], ['Moderate', '#9b8b45'], ['High', '#b26835'], ['Extreme', '#b23b30']],
  htsi: [['Low', '#4f5d50'], ['Moderate', '#9b8b45'], ['High', '#b26835'], ['Extreme', '#a84c39']],
  wbgt: [['Low', '#4f5d50'], ['Moderate', '#9b8b45'], ['High', '#b26835'], ['Extreme', '#a84c39']],
  vulnerability: [['Low', '#35393a'], ['Moderate', '#555a5b'], ['High', '#777a76'], ['Very high', '#b26835']],
  health: [['Low', '#4f5d50'], ['Moderate', '#9b8b45'], ['High', '#b26835'], ['Extreme', '#a84c39']],
}

const riskGroups: Array<[RiskGroup, string, string]> = [
  ['low', 'Low', '#607b61'],
  ['moderate', 'Moderate', '#9b8b45'],
  ['high', 'High', '#b26835'],
  ['extreme', 'Extreme', '#b23b30'],
]
const allRiskVisible: RiskVisibility = { low: true, moderate: true, high: true, extreme: true }

const groupForRisk = (category: string): RiskGroup => category === 'LOW' ? 'low' : category === 'CAUTION' ? 'moderate' : category === 'EXTREME' ? 'extreme' : 'high'

function boundsForFeatures(features: FeatureCollection<Geometry>['features']) {
  const bounds = new maplibregl.LngLatBounds()
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') bounds.extend([value[0], value[1]])
    else value.forEach(visit)
  }
  features.forEach((feature) => visit('coordinates' in feature.geometry ? feature.geometry.coordinates : []))
  return bounds
}

function createPopupNode(properties: Record<string, unknown>) {
  const node = document.createElement('div')
  node.className = 'map-popup-content'
  const title = document.createElement('strong')
  title.textContent = String(properties.name ?? properties.code ?? 'Ward')
  const metrics = document.createElement('span')
  metrics.textContent = `HTSI ${Number(properties.htsi ?? 0).toFixed(0)} · WBGT ${Number(properties.wbgt ?? 0).toFixed(1)}°C · PVI ${Number(properties.vulnerability_index ?? 0).toFixed(0)}`
  const status = document.createElement('em')
  status.textContent = String(properties.risk_category ?? 'DATA UNAVAILABLE')
  node.append(title, metrics, status)
  return node
}

function RiskMapComponent({
  boundaries,
  wards,
  selectedId,
  metric,
  onSelect,
  onClear,
  onCycleMetric,
  fitSelection = false,
  riskVisibility = allRiskVisible,
  onToggleRisk,
  onFocusExtreme,
  onResetRisk,
  focusExtreme = false,
  showHoverPopup = true,
}: {
  boundaries: WardBoundaryCollection
  wards: WardSummary[]
  selectedId?: string
  metric: MapMetric
  onSelect: (id: string, anchor: MapSelectionAnchor) => void
  onClear?: () => void
  onCycleMetric?: () => void
  fitSelection?: boolean
  riskVisibility?: RiskVisibility
  onToggleRisk?: (group: RiskGroup) => void
  onFocusExtreme?: () => void
  onResetRisk?: () => void
  focusExtreme?: boolean
  showHoverPopup?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRefs = useRef<maplibregl.Marker[]>([])
  const selectRef = useRef(onSelect)
  const clearRef = useRef(onClear)
  const [ready, setReady] = useState(false)
  selectRef.current = onSelect
  clearRef.current = onClear

  const merged = useMemo<FeatureCollection<Geometry>>(() => {
    const rows = new Map(wards.map((ward) => [ward.id, ward]))
    return {
      type: 'FeatureCollection',
      features: boundaries.features.map((feature) => {
        const ward = rows.get(String(feature.properties?.id))
        const riskGroup = groupForRisk(ward?.risk_category ?? '')
        return {
          ...feature,
          properties: {
            ...feature.properties,
            htsi: ward?.htsi ?? null,
            wbgt: ward?.wbgt ?? null,
            vulnerability_index: ward?.vulnerability_index ?? null,
            health_risk: ward?.health_risk ?? null,
            risk_category: ward?.risk_category ?? 'UNAVAILABLE',
            visible: Boolean(ward),
            risk_group: riskGroup,
            risk_visible: Boolean(ward) && riskVisibility[riskGroup],
          },
        }
      }),
    }
  }, [boundaries, riskVisibility, wards])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: localStyle,
      center: [72.88, 19.08],
      zoom: 10.15,
      minZoom: 8.8,
      maxZoom: 15,
      attributionControl: false,
      renderWorldCopies: false,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 54, unit: 'metric' }), 'bottom-left')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, maxWidth: '330px' })
    map.once('style.load', () => {
      map.addSource('bmc-wards', { type: 'geojson', data: merged })
      map.addLayer({
        id: 'ward-fill',
        type: 'fill',
        source: 'bmc-wards',
        paint: {
          'fill-color': expressions.risk,
          'fill-opacity': ['case', ['get', 'risk_visible'], 0.5, ['get', 'visible'], 0.025, 0.015],
          'fill-outline-color': '#a3a6a4',
        },
      })
      map.addLayer({
        id: 'ward-line',
        type: 'line',
        source: 'bmc-wards',
        paint: { 'line-color': '#a8aaa8', 'line-width': 0.65, 'line-opacity': ['case', ['get', 'risk_visible'], 0.62, 0.12] },
      })
      map.addLayer({
        id: 'ward-hover',
        type: 'line',
        source: 'bmc-wards',
        filter: ['==', ['get', 'id'], '__none__'],
        paint: { 'line-color': '#f0f0ed', 'line-width': 1.35, 'line-opacity': 0.92 },
      })
      map.addLayer({
        id: 'ward-selected',
        type: 'line',
        source: 'bmc-wards',
        filter: ['==', ['get', 'id'], selectedId ?? ''],
        paint: { 'line-color': '#f2f1ed', 'line-width': 2.1, 'line-opacity': 1 },
      })
      const light = document.documentElement.dataset.theme === 'light'
      if (light) {
        map.setPaintProperty('background', 'background-color', '#e7e7e3')
        map.setPaintProperty('osm-dimmed', 'raster-opacity', 0.68)
        map.setPaintProperty('osm-dimmed', 'raster-brightness-min', 0.28)
        map.setPaintProperty('osm-dimmed', 'raster-brightness-max', 0.92)
      }
      markerRefs.current = boundaries.features.map((feature) => {
        const element = document.createElement('button')
        element.className = 'ward-code-marker'
        element.type = 'button'
        element.textContent = feature.properties.code
        element.title = feature.properties.name
        element.dataset.wardId = feature.properties.id
        element.addEventListener('click', () => {
          const point = map.project([feature.properties.label_lon, feature.properties.label_lat])
          const container = map.getContainer()
          selectRef.current(feature.properties.id, { x: point.x, y: point.y, width: container.clientWidth, height: container.clientHeight })
        })
        return new maplibregl.Marker({ element, anchor: 'center' })
          .setLngLat([feature.properties.label_lon, feature.properties.label_lat])
          .addTo(map)
      })
      map.fitBounds(MUMBAI_BOUNDS, { padding: 28, duration: 0 })
      setReady(true)
    })
    map.on('click', 'ward-fill', (event: MapLayerMouseEvent) => {
      if (!event.features?.[0]?.properties?.risk_visible) return
      const id = event.features?.[0]?.properties?.id as string | undefined
      if (id) {
        popup.remove()
        const container = map.getContainer()
        selectRef.current(id, { x: event.point.x, y: event.point.y, width: container.clientWidth, height: container.clientHeight })
      }
    })
    map.on('click', (event) => {
      if (!map.getLayer('ward-fill')) return
      const hit = map.queryRenderedFeatures(event.point, { layers: ['ward-fill'] })
      if (!hit.length) clearRef.current?.()
    })
    map.on('mouseenter', 'ward-fill', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mousemove', 'ward-fill', (event: MapLayerMouseEvent) => {
      const properties = event.features?.[0]?.properties
      if (!properties?.risk_visible) {
        map.setFilter('ward-hover', ['==', ['get', 'id'], '__none__'])
        popup.remove()
        return
      }
      map.setFilter('ward-hover', ['==', ['get', 'id'], String(properties.id)])
      if (showHoverPopup) popup.setLngLat(event.lngLat).setDOMContent(createPopupNode(properties)).addTo(map)
    })
    map.on('mouseleave', 'ward-fill', () => {
      map.getCanvas().style.cursor = ''
      map.setFilter('ward-hover', ['==', ['get', 'id'], '__none__'])
      popup.remove()
    })
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(containerRef.current)
    return () => {
      observer.disconnect()
      markerRefs.current.forEach((marker) => marker.remove())
      markerRefs.current = []
      popup.remove()
      map.remove()
      mapRef.current = null
    }
  // Map is deliberately created once. Dynamic data is updated through the source below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const source = mapRef.current?.getSource('bmc-wards') as GeoJSONSource | undefined
    if (!ready || !source) return
    source.setData(merged)
    const visibleIds = new Set(wards.filter((ward) => riskVisibility[groupForRisk(ward.risk_category)]).map((ward) => ward.id))
    markerRefs.current.forEach((marker) => {
      marker.getElement().hidden = !visibleIds.has(marker.getElement().dataset.wardId ?? '')
    })
  }, [merged, ready, riskVisibility, wards])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map?.getLayer('ward-fill')) return
    map.setPaintProperty('ward-fill', 'fill-color', expressions[metric])
  }, [metric, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map?.getLayer('ward-selected')) return
    map.setFilter('ward-selected', ['==', ['get', 'id'], selectedId ?? ''])
  }, [selectedId, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !fitSelection || !map) return
    const timer = window.setTimeout(() => {
      map.resize()
      map.fitBounds(MUMBAI_BOUNDS, { padding: 28, duration: 360 })
    }, 210)
    return () => window.clearTimeout(timer)
  }, [fitSelection, ready, selectedId])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !focusExtreme || !map) return
    const extreme = merged.features.filter((feature) => feature.properties?.risk_group === 'extreme' && feature.properties?.visible)
    if (!extreme.length) return
    const bounds = boundsForFeatures(extreme)
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 52, maxZoom: 12.2, duration: 500 })
  }, [focusExtreme, merged, ready])

  useEffect(() => {
    const reset = () => mapRef.current?.fitBounds(MUMBAI_BOUNDS, { padding: 28, duration: 550 })
    const resize = () => {
      mapRef.current?.resize()
      window.setTimeout(() => mapRef.current?.resize(), 220)
    }
    const applyTheme = (event: Event) => {
      const map = mapRef.current
      if (!map?.getLayer('osm-dimmed')) return
      const light = (event as CustomEvent<'dark' | 'light'>).detail === 'light'
      map.setPaintProperty('background', 'background-color', light ? '#e7e7e3' : '#090b0c')
      map.setPaintProperty('osm-dimmed', 'raster-opacity', light ? 0.68 : 0.42)
      map.setPaintProperty('osm-dimmed', 'raster-brightness-min', light ? 0.28 : 0)
      map.setPaintProperty('osm-dimmed', 'raster-brightness-max', light ? 0.92 : 0.34)
    }
    window.addEventListener('heatshield:reset-map', reset)
    window.addEventListener('heatshield:layout-change', resize)
    window.addEventListener('heatshield:theme-change', applyTheme)
    return () => {
      window.removeEventListener('heatshield:reset-map', reset)
      window.removeEventListener('heatshield:layout-change', resize)
      window.removeEventListener('heatshield:theme-change', applyTheme)
    }
  }, [])

  return <div className="map-shell ops-map-shell">
    <div ref={containerRef} className="risk-map" aria-label="Interactive BMC ward heat-health map" />
    {!ready && <div className="map-loading">Initializing ward geometry…</div>}
    <button className="map-reset-control" type="button" onClick={onCycleMetric} disabled={!ready || !onCycleMetric} aria-label="Cycle map layer" title="Cycle map layer"><Layers3 size={13} /></button>
    <div className={`map-legend ops-map-legend ${onToggleRisk ? 'interactive-map-legend' : ''}`} aria-label={`${metric} legend`}>
      {onToggleRisk ? <>
        <strong>Risk Level</strong>
        {riskGroups.map(([group, label, colour]) => <button key={group} onClick={() => onToggleRisk(group)} aria-label={`${riskVisibility[group] ? 'Hide' : 'Show'} ${label} risk wards`} aria-pressed={riskVisibility[group]}><span className="legend-checkbox">{riskVisibility[group] ? '✓' : ''}</span><i style={{ backgroundColor: colour }} /><span>{label}</span></button>)}
        <div className="legend-actions"><button onClick={onFocusExtreme} className={focusExtreme ? 'active' : ''}>Focus Extreme</button><button onClick={onResetRisk}>Reset</button></div>
      </> : legends[metric].map(([label, colour]) => <div className="legend-item" key={label}><span style={{ backgroundColor: colour }} />{label}</div>)}
    </div>
  </div>
}

export const RiskMap = memo(RiskMapComponent)
