import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle2, Clock, FileWarning, Inbox, ListChecks, PlusCircle, Search, XCircle,
} from 'lucide-react'
import { api, buildQuery } from '../../lib/api'
import type { CitizenStats, Grievance, GrievanceList } from '../../lib/types'
import StatCard from '../../components/StatCard'
import { EmptyState, ErrorState, TableSkeleton } from '../../components/States'
import { StatusBadge, PriorityBadge, DemoBadge } from '../../components/Badges'
import { timeAgo } from '../../lib/format'

export default function CitizenDashboard() {
  const [stats, setStats] = useState<CitizenStats | null>(null)
  const [recent, setRecent] = useState<Grievance[] | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [s, r] = await Promise.all([
        api.get<CitizenStats>('/analytics/my-stats'),
        api.get<GrievanceList>(`/grievances${buildQuery({ page: 1, page_size: 8, sort: 'newest' })}`),
      ])
      setStats(s)
      setRecent(r.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = (recent ?? []).filter(g => {
    const q = search.trim().toLowerCase()
    const matchesSearch = !q || g.title.toLowerCase().includes(q) || g.tracking_id.toLowerCase().includes(q)
    const matchesStatus = !statusFilter || g.status === statusFilter
    return matchesSearch && matchesStatus
  })

  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Overview of your grievances and their live status.</p>
        </div>
        <Link to="/submit" className="btn-primary">
          <PlusCircle className="h-4 w-4" aria-hidden /> Submit New Grievance
        </Link>
      </div>

      {!stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="card p-5"><div className="skeleton h-16" /></div>)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total grievances" value={stats.total} icon={ListChecks} />
          <StatCard label="Pending review" value={stats.pending} icon={Inbox} tone="warning" />
          <StatCard label="In progress" value={stats.in_progress} icon={Clock} tone="primary" />
          <StatCard label="Resolved" value={stats.resolved + stats.closed} icon={CheckCircle2} tone="success" />
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">Recent grievances</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="search" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search title or tracking ID…"
                className="input !w-56 !py-2 pl-9" aria-label="Search grievances"
              />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="input !w-40 !py-2" aria-label="Filter by status">
              <option value="">All statuses</option>
              {['submitted', 'under_review', 'in_progress', 'escalated', 'resolved', 'closed', 'rejected', 'reopened'].map(s => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
        </div>

        {!recent ? (
          <TableSkeleton rows={4} />
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={recent.length === 0 ? 'No grievances yet' : 'No grievances match your filters'}
              hint={recent.length === 0
                ? 'Submit your first grievance and track it here from submission to resolution.'
                : 'Try clearing the search box or status filter.'}
              action={recent.length === 0 ? <Link to="/submit" className="btn-primary"><PlusCircle className="h-4 w-4" /> Submit Grievance</Link> : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] divide-y divide-border">
              <thead className="bg-ice">
                <tr>
                  <th className="th">Tracking ID</th>
                  <th className="th">Title</th>
                  <th className="th">Status</th>
                  <th className="th">Priority</th>
                  <th className="th">Updated</th>
                  <th className="th"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {filtered.map(g => (
                  <tr key={g.id} className="hover:bg-ice/60">
                    <td className="td font-mono text-xs">{g.tracking_id}</td>
                    <td className="td max-w-[280px]">
                      <span className="line-clamp-1 font-medium">{g.title}</span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        {g.is_demo_data && <DemoBadge />}
                        {g.is_overdue && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-danger">
                            <FileWarning className="h-3 w-3" aria-hidden /> overdue
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="td"><StatusBadge status={g.status} /></td>
                    <td className="td"><PriorityBadge priority={g.priority} /></td>
                    <td className="td text-muted">{timeAgo(g.submitted_at)}</td>
                    <td className="td">
                      <Link to={`/grievances/${g.id}`} className="text-sm font-semibold text-primary hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {stats && stats.rejected > 0 && (
          <p className="flex items-center gap-1.5 border-t border-border px-5 py-3 text-xs text-muted">
            <XCircle className="h-3.5 w-3.5 text-danger" aria-hidden />
            {stats.rejected} grievance(s) were rejected with a documented reason — you may reopen them from the detail page.
          </p>
        )}
      </section>
    </div>
  )
}
