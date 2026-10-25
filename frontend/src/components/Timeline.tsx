import {
  CheckCircle2, Clock, FileText, Flag, MessageSquare, RotateCcw, Send, ShieldAlert, UserCheck, XCircle,
} from 'lucide-react'
import type { StatusHistoryEntry } from '../lib/types'
import { formatDate, STATUS_LABELS } from '../lib/format'

const ICONS: Record<string, typeof Send> = {
  submitted: Send,
  under_review: FileText,
  in_progress: Clock,
  escalated: ShieldAlert,
  resolved: CheckCircle2,
  closed: CheckCircle2,
  reopened: RotateCcw,
  rejected: XCircle,
}

const COLORS: Record<string, string> = {
  submitted: 'bg-primary text-white',
  under_review: 'bg-blue-600 text-white',
  in_progress: 'bg-warning text-white',
  escalated: 'bg-danger text-white',
  resolved: 'bg-success text-white',
  closed: 'bg-slate-500 text-white',
  reopened: 'bg-purple-600 text-white',
  rejected: 'bg-slate-400 text-white',
}

export default function Timeline({ entries }: { entries: StatusHistoryEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-muted">No history yet.</p>
  return (
    <ol className="relative space-y-5 border-l-2 border-border pl-6" aria-label="Grievance timeline">
      {entries.map((h, idx) => {
        const Icon = ICONS[h.to_status] ?? Flag
        return (
          <li key={h.id} className="relative">
            <span
              className={`absolute -left-[35px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white ${COLORS[h.to_status] ?? 'bg-muted text-white'}`}
              aria-hidden
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <p className="text-sm font-semibold text-ink">{STATUS_LABELS[h.to_status] ?? h.to_status}</p>
              <p className="text-xs text-muted">{formatDate(h.created_at)}</p>
              {h.actor_name && (
                <p className="inline-flex items-center gap-1 text-xs text-muted">
                  <UserCheck className="h-3 w-3" aria-hidden /> {h.actor_name}
                  {idx === 0 ? '' : ''}
                </p>
              )}
            </div>
            {h.note && (
              <p className="mt-1 inline-flex items-start gap-1.5 text-sm text-muted">
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {h.note}
              </p>
            )}
          </li>
        )
      })}
    </ol>
  )
}
