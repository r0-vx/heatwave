import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LoadingState } from './components/LoadingState'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const WardDetailPage = lazy(() => import('./pages/WardDetailPage').then((module) => ({ default: module.WardDetailPage })))
const CitizenPage = lazy(() => import('./pages/CitizenPage').then((module) => ({ default: module.CitizenPage })))
const DataExplorerPage = lazy(() => import('./pages/DataExplorerPage').then((module) => ({ default: module.DataExplorerPage })))
const AlertSimulatorPage = lazy(() => import('./pages/AlertSimulatorPage').then((module) => ({ default: module.AlertSimulatorPage })))
const DataSourcesPage = lazy(() => import('./pages/DataSourcesPage').then((module) => ({ default: module.DataSourcesPage })))

export default function App() {
  return <Suspense fallback={<div className="route-loading"><LoadingState label="Loading operations module…" /></div>}>
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/ward/:wardId" element={<WardDetailPage />} />
      <Route path="/citizen" element={<CitizenPage />} />
      <Route path="/explorer" element={<DataExplorerPage />} />
      <Route path="/alerts" element={<AlertSimulatorPage />} />
      <Route path="/sources" element={<DataSourcesPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Suspense>
}
