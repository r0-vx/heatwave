export function LoadingState({ label = 'Loading operational data…' }: { label?: string }) {
  return <div className="loading-state"><span className="loading-ring" />{label}</div>
}

export function ErrorState({ message }: { message: string }) {
  return <div className="error-state"><strong>Data unavailable</strong><span>{message}</span><small>Start the local FastAPI service and refresh this page.</small></div>
}
