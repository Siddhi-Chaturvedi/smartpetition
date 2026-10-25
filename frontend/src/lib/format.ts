export function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  const now = Date.now()
  const s = Math.max(1, Math.floor((now - then) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return formatDate(iso)
}

export function hoursLeft(iso?: string | null): { text: string; overdue: boolean } | null {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  const h = Math.floor(Math.abs(diff) / 3_600_000)
  if (diff < 0) return { text: `${h}h overdue`, overdue: true }
  return { text: `${h}h left`, overdue: false }
}

export function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  in_progress: 'In Progress',
  escalated: 'Escalated',
  resolved: 'Resolved',
  closed: 'Closed',
  reopened: 'Reopened',
  rejected: 'Rejected',
}

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical',
}
