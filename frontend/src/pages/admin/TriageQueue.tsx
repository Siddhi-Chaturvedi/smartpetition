import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList } from 'lucide-react'
import { api } from '../../lib/api'
import type { Grievance } from '../../lib/types'
import { EmptyState, ErrorState, TableSkeleton } from '../../components/States'
import { PriorityBadge, StatusBadge } from '../../components/Badges'
import { formatDate, pct } from '../../lib/format'

export default function AdminTriage() {
  const [items, setItems] = useState<Grievance[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      setItems(await api.get<Grievance[]>('/admin/triage-queue'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load triage queue')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ClipboardList className="h-6 w-6 text-primary" aria-hidden /> Triage Queue
        </h1>
        <p className="mt-1 text-sm text-muted">
          Grievances the router could not confidently assign (low AI confidence, unmapped category or
          AI failure). Review, correct the category if needed, and assign a department.
        </p>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {!items && !error ? <TableSkeleton rows={5} /> :
        items && items.length === 0 ? (
          <EmptyState title="Triage queue is empty" hint="Every grievance has been confidently routed. 🎉" />
        ) : (
          <ul className="space-y-3">
            {items!.map(g => (
              <li key={g.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-primary">{g.tracking_id}</span>
                      <StatusBadge status={g.status} />
                      <PriorityBadge priority={g.priority} />
                      {g.ai_analysis_status === 'failed' && (
                        <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-danger">AI failed</span>
                      )}
                      {g.ai_analysis_status === 'needs_review' && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-warning">Low confidence</span>
                      )}
                    </div>
                    <p className="mt-2 font-semibold">{g.title}</p>
                    <p className="mt-1 line-clamp-2 max-w-2xl text-sm text-muted">{g.description}</p>
                    <p className="mt-2 text-xs text-muted">
                      {g.location || 'No location'} • submitted {formatDate(g.submitted_at)} • by {g.citizen_name || `citizen #${g.citizen_id}`}
                    </p>
                  </div>
                  <Link to={`/grievances/${g.id}`} className="btn-primary shrink-0">Review & assign →</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}
