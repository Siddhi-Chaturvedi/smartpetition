import { STATUS_LABELS, PRIORITY_LABELS } from '../lib/format'

const STATUS_STYLES: Record<string, string> = {
  submitted: 'bg-ice text-primary border-primary/20',
  under_review: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-50 text-warning border-amber-200',
  escalated: 'bg-red-50 text-danger border-red-200',
  resolved: 'bg-emerald-50 text-success border-emerald-200',
  closed: 'bg-slate-100 text-slate-600 border-slate-200',
  reopened: 'bg-purple-50 text-purple-700 border-purple-200',
  rejected: 'bg-slate-100 text-slate-500 border-slate-300',
}

const PRIORITY_STYLES: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600 border-slate-200',
  medium: 'bg-ice text-primary border-primary/20',
  high: 'bg-amber-50 text-warning border-amber-200',
  critical: 'bg-red-50 text-danger border-red-200',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}
      aria-label={`Status: ${STATUS_LABELS[status] ?? status}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[priority] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}
      aria-label={`Priority: ${PRIORITY_LABELS[priority] ?? priority}`}
    >
      {PRIORITY_LABELS[priority] ?? priority}
    </span>
  )
}

export function AIBadge({ method }: { method: string }) {
  return method === 'ml_model' ? (
    <span className="inline-flex items-center rounded-full border border-primary/20 bg-ice px-2.5 py-0.5 text-xs font-semibold text-primary">
      AI Model
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-warning/30 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-warning" title="No trained model available — rule-based fallback in use">
      Rule Fallback
    </span>
  )
}

export function DemoBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted" title="Seeded demonstration record (synthetic)">
      Demo data
    </span>
  )
}
