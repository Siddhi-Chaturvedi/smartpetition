import { ReactNode } from 'react'
import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react'

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
      {label}
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-12 w-full" />
      ))}
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="card space-y-3 p-5" aria-hidden>
      <div className="skeleton h-4 w-1/3" />
      <div className="skeleton h-8 w-2/3" />
      <div className="skeleton h-4 w-1/2" />
    </div>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-white px-6 py-14 text-center">
      <Inbox className="h-10 w-10 text-border" aria-hidden />
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-md text-sm text-muted">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-red-200 bg-red-50 px-6 py-10 text-center" role="alert">
      <AlertTriangle className="h-8 w-8 text-danger" aria-hidden />
      <p className="text-sm font-medium text-danger">{message}</p>
      {onRetry && (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Try again
        </button>
      )}
    </div>
  )
}
