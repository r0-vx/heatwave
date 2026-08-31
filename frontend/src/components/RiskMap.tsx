import { memo, useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent, StyleSpecification } from 'maplibre-gl'
import type { FeatureCollection, Geometry } from 'geojson'
import { Crosshair, MapPinned } from 'lucide-react'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { WardBoundaryCollection, WardSummary } from '../types'

export type MapMetric = 'risk' | 'htsi' | 'wbgt' | 'vulnerability' | 'health'

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
    { id: 'background', type: 'background', paint: { 'background-color': '#071019' } },
    {
      id: 'osm-dimmed',
      type: 'raster',
      source: 'osm',
      paint: {
        'raster-opacity': 0.32,
        'raster-saturation': -0.72,
        'raster-contrast': 0.12,
        'raster-brightness-min': 0,
        'raster-brightness-max': 0.44,
      },
    },
  ],
}

const riskExpression: ExpressionSpecification = [
  'match', ['get', 'risk_category'],
  'LOW', '#24c997',
  'CAUTION', '#d5b547',
  'HIGH', '#f09a3e',
  'DANGEROUS', '#ed5d52',
  'EXTREME', '#b92645',
  '#536171',
]

const metricExpression = (property: string, stops: Array<[number, string]>): ExpressionSpecification => [
  'interpolate', ['linear'], ['coalesce', ['get', property], 0],
  ...stops.flatMap(([value, colour]) => [value, colour]),
] as ExpressionSpecification

const expressions: Record<MapMetric, ExpressionSpecification> = {
  risk: riskExpression,
  htsi: metricExpression('htsi', [[0, '#183f45'], [35, '#d5b547'], [60, '#f09a3e'], [80, '#ed5d52'], [100, '#8f1735']]),
  wbgt: metricExpression('wbgt', [[20, '#183f45'], [26, '#d5b547'], [30, '#f09a3e'], [34, '#ed5d52'], [40, '#8f1735']]),
  vulnerability: metricExpression('vulnerability_index', [[0, '#173c52'], [40, '#3d8d89'], [60, '#d5b547'], [80, '#ed5d52'], [100, '#8f1735']]),
  health: metricExpression('health_risk', [[0, '#173c52'], [35, '#3d8d89'], [60, '#d5b547'], [80, '#ed5d52'], [100, '#8f1735']]),
}

const legends: Record<MapMetric, Array<[string, string]>> = {
  risk: [['LOW', '#24c997'], ['CAUTION', '#d5b547'], ['HIGH', '#f09a3e'], ['DANGEROUS', '#ed5d52'], ['EXTREME', '#b92645']],
  htsi: [['0–34', '#183f45'], ['35–59', '#d5b547'], ['60–79', '#f09a3e'], ['80–100', '#b92645']],
  wbgt: [['<26°C', '#183f45'], ['26–29°C', '#d5b547'], ['30–33°C', '#f09a3e'], ['34°C+', '#b92645']],
  vulnerability: [['LOW', '#173c52'], ['MODERATE', '#3d8d89'], ['HIGH', '#d5b547'], ['VERY HIGH', '#b92645']],
  health: [['LOW', '#173c52'], ['MODERATE', '#3d8d89'], ['HIGH', '#d5b547'], ['VERY HIGH', '#b92645']],
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
}: {
  boundaries: WardBoundaryCollection
  wards: WardSummary[]
  selectedId?: string
  metric: MapMetric
  onSelect: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRefs = useRef<maplibregl.Marker[]>([])
  const selectRef = useRef(onSelect)
  const [ready, setReady] = useState(false)
  selectRef.current = onSelect

  const merged = useMemo<FeatureCollection<Geometry>>(() => {
    const rows = new Map(wards.map((ward) => [ward.id, ward]))
    return {
      type: 'FeatureCollection',
      features: boundaries.features.map((feature) => {
        const ward = rows.get(String(feature.properties?.id))
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
          },
        }
      }),
    }
  }, [boundaries, wards])

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
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left')
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
          'fill-opacity': ['case', ['get', 'visible'], 0.6, 0.06],
          'fill-outline-color': '#9ab0bf',
        },
      })
      map.addLayer({
        id: 'ward-line',
        type: 'line',
        source: 'bmc-wards',
        paint: { 'line-color': '#9ab0bf', 'line-width': 0.8, 'line-opacity': 0.7 },
      })
      map.addLayer({
        id: 'ward-selected',
        type: 'line',
        source: 'bmc-wards',
        filter: ['==', ['get', 'id'], selectedId ?? ''],
        paint: { 'line-color': '#f4f7f9', 'line-width': 3, 'line-opacity': 1 },
      })
      markerRefs.current = boundaries.features.map((feature) => {
        const element = document.createElement('button')
        element.className = 'ward-code-marker'
        element.type = 'button'
        element.textContent = feature.properties.code
        element.title = feature.properties.name
        element.addEventListener('click', () => selectRef.current(feature.properties.id))
        return new maplibregl.Marker({ element, anchor: 'center' })
          .setLngLat([feature.properties.label_lon, feature.properties.label_lat])
          .addTo(map)
      })
      map.fitBounds([[72.75, 18.88], [73.03, 19.32]], { padding: 28, duration: 0 })
      setReady(true)
    })
    map.on('click', 'ward-fill', (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id as string | undefined
      if (id) selectRef.current(id)
    })
    map.on('mouseenter', 'ward-fill', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mousemove', 'ward-fill', (event: MapLayerMouseEvent) => {
      const properties = event.features?.[0]?.properties
      if (!properties) return
      popup.setLngLat(event.lngLat).setDOMContent(createPopupNode(properties)).addTo(map)
    })
    map.on('mouseleave', 'ward-fill', () => { map.getCanvas().style.cursor = ''; popup.remove() })
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
    if (ready && source) source.setData(merged)
  }, [merged, ready])

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

  return <div className="map-shell ops-map-shell">
    <div ref={containerRef} className="risk-map" aria-label="Interactive BMC ward heat-health map" />
    {!ready && <div className="map-loading">Initializing ward geometry…</div>}
    <div className="map-coordinate-tag"><Crosshair size={12} />MUMBAI · EPSG:4326</div>
    <div className="map-legend ops-map-legend"><div className="legend-title">{metric.toUpperCase()} LAYER</div>{legends[metric].map(([label, colour]) => <div className="legend-item" key={label}><span style={{ backgroundColor: colour }} />{label}</div>)}</div>
    <div className="map-note"><MapPinned size={13} />24 actual BMC administrative ward polygons · DataMeet CC BY 4.0 snapshot</div>
  </div>
}

export const RiskMap = memo(RiskMapComponent)
