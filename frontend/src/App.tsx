import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LoadingState } from './components/LoadingState'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const WardDetailPage = lazy(() => import('./pages/WardDetailPage').then((module) => ({ default: module.WardDetailPage })))
const CitizenPage = lazy(() => import('./pages/CitizenPage').then((module) => ({ default: module.CitizenPage })))
const DataExplorerPage = lazy(() => import('./pages/DataExplorerPage').then((module) => ({ default: module.DataExplorerPage })))
const AlertSimulatorPage = lazy(() => import('./pages/AlertSimulatorPage').then((module) => ({ default: module.AlertSimulatorPage })))
const DataSourcesPage = lazy(() => import('./pages/DataSourcesPage').then((module) => ({ default: module.DataSourcesPage })))
const SystemSettingsPage = lazy(() => import('./pages/SystemSettingsPage').then((module) => ({ default: module.SystemSettingsPage })))
const MapPage = lazy(() => import('./pages/SpatialWorkspacePage').then((module) => ({ default: module.MapPage })))
const ForecastPage = lazy(() => import('./pages/SpatialWorkspacePage').then((module) => ({ default: module.ForecastPage })))

export default function App() {
  return <Suspense fallback={<div className="route-loading"><LoadingState label="Loading operations module…" /></div>}>
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/map" element={<MapPage />} />
      <Route path="/forecast" element={<ForecastPage />} />
      <Route path="/ward/:wardId" element={<WardDetailPage />} />
      <Route path="/citizen" element={<CitizenPage />} />
      <Route path="/explorer" element={<DataExplorerPage />} />
      <Route path="/alerts" element={<AlertSimulatorPage />} />
      <Route path="/sources" element={<DataSourcesPage />} />
      <Route path="/settings" element={<SystemSettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Suspense>
}
