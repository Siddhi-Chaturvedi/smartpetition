import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, CalendarClock, CheckCircle2, Flame, Inbox, ListChecks, Timer,
} from 'lucide-react'
import { api, buildQuery } from '../../lib/api'
import type { Grievance, GrievanceList, SummaryStats } from '../../lib/types'
import StatCard from '../../components/StatCard'
import { PriorityBadge, StatusBadge } from '../../components/Badges'
import { ErrorState, TableSkeleton } from '../../components/States'
import { formatDate, hoursLeft } from '../../lib/format'

const OPEN = ['submitted', 'under_review', 'in_progress', 'escalated', 'reopened']

export default function OfficerDashboard() {
  const [stats, setStats] = useState<SummaryStats | null>(null)
  const [critical, setCritical] = useState<Grievance[] | null>(null)
  const [overdue, setOverdue] = useState<Grievance[] | null>(null)
  const [upcoming, setUpcoming] = useState<Grievance[] | null>(null)
  const [recent, setRecent] = useState<Grievance[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [summary, crit, over, rec] = await Promise.all([
        api.get<SummaryStats>('/analytics/summary'),
        api.get<GrievanceList>(`/grievances${buildQuery({ priority: 'critical', page_size: 8 })}`),
        api.get<GrievanceList>(`/grievances${buildQuery({ overdue: true, page_size: 8, sort: 'due' })}`),
        api.get<GrievanceList>(`/grievances${buildQuery({ page_size: 8, sort: 'due' })}`),
      ])
      setStats(summary)
      setCritical(crit.items.filter(g => OPEN.includes(g.status)))
      setOverdue(over.items)
      setUpcoming(rec.items.filter(g => OPEN.includes(g.status) && !g.is_overdue).slice(0, 6))
      setRecent(rec.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load officer dashboard')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (error) return <ErrorState message={error} onRetry={load} />

  const queueCard = (title: string, icon: React.ReactNode, items: Grievance[] | null, empty: string, tone: string) => (
    <section className="card overflow-hidden">
      <h2 className={`flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-semibold ${tone}`}>
        {icon} {title}
        {items && <span className="ml-auto rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold">{items.length}</span>}
      </h2>
      {!items ? (
        <TableSkeleton rows={2} />
      ) : items.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map(g => {
            const dl = hoursLeft(g.due_at)
            return (
              <li key={g.id}>
                <Link to={`/grievances/${g.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-ice/60">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{g.title}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted">
                      {g.tracking_id} • {g.location || 'no location'} • due {formatDate(g.due_at)}
                    </p>
                  </div>
                  <StatusBadge status={g.status} />
                  <PriorityBadge priority={g.priority} />
                  {dl && (
                    <span className={`hidden w-24 text-right text-xs font-semibold sm:block ${dl.overdue ? 'text-danger' : 'text-muted'}`}>
                      {dl.text}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Officer Queue</h1>
          <p className="mt-1 text-sm text-muted">Cases assigned to your department, scoped by the backend to your permissions.</p>
        </div>
        <Link to="/grievances" className="btn-primary"><ListChecks className="h-4 w-4" aria-hidden /> Open all cases</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open cases" value={stats ? stats.pending + stats.in_progress : null} icon={Inbox} />
        <StatCard label="Critical / high" value={stats ? stats.critical_open : null} icon={Flame} tone="danger" />
        <StatCard label="Overdue" value={stats ? stats.overdue : null} icon={AlertTriangle} tone={stats && stats.overdue > 0 ? 'danger' : 'warning'} />
        <StatCard label="Resolved (dept)" value={stats ? stats.resolved : null} icon={CheckCircle2} tone="success"
                  hint={stats?.sla_compliance_pct != null ? `SLA compliance ${stats.sla_compliance_pct}%` : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {queueCard('Critical priority queue', <Flame className="h-4 w-4 text-danger" aria-hidden />, critical,
                   'No critical cases right now.', 'text-danger')}
        {queueCard('Overdue — act now', <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />, overdue,
                   'Nothing overdue. Great work!', 'text-warning')}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {queueCard('Upcoming deadlines', <CalendarClock className="h-4 w-4 text-primary" aria-hidden />, upcoming,
                   'No upcoming deadlines.', 'text-primary')}
        {queueCard('Recently updated', <Timer className="h-4 w-4 text-muted" aria-hidden />, recent,
                   'No recent activity.', 'text-ink')}
      </div>
    </div>
  )
}
