import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Filter, Search } from 'lucide-react'
import { api, buildQuery, getToken } from '../lib/api'
import type { GrievanceList } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { DemoBadge, PriorityBadge, StatusBadge } from '../components/Badges'
import { EmptyState, ErrorState, TableSkeleton } from '../components/States'
import Pagination from '../components/Pagination'
import { formatDate } from '../lib/format'

const PAGE_SIZE = 15

export default function GrievanceListPage() {
  const { user } = useAuth()
  const [data, setData] = useState<GrievanceList | null>(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusF, setStatusF] = useState('')
  const [priorityF, setPriorityF] = useState('')
  const [overdueF, setOverdueF] = useState('')
  const [sort, setSort] = useState('newest')

  const staff = user?.role === 'officer' || user?.role === 'admin'

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await api.get<GrievanceList>(`/grievances${buildQuery({
        page, page_size: PAGE_SIZE, search, status: statusF, priority: priorityF,
        overdue: overdueF || undefined, sort,
      })}`)
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load grievances')
    }
  }, [page, search, statusF, priorityF, overdueF, sort])

  useEffect(() => { void load() }, [load])

  const exportCsv = async () => {
    try {
      const res = await fetch(`/api/v1/grievances/export/csv${buildQuery({ status: statusF })}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `grievances-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    }
  }

  const title = user?.role === 'citizen' ? 'My Grievances' : user?.role === 'officer' ? 'Department Cases' : 'All Grievances'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted">
            {user?.role === 'citizen'
              ? 'Every grievance you submitted, with live status.'
              : user?.role === 'officer'
                ? 'Cases routed to your department (backend-scoped to your permissions).'
                : 'System-wide view across all departments.'}
          </p>
        </div>
        {staff && (
          <button type="button" className="btn-secondary" onClick={exportCsv}>
            <Download className="h-4 w-4" aria-hidden /> Export CSV
          </button>
        )}
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <form
            className="relative min-w-[220px] flex-1"
            onSubmit={e => { e.preventDefault(); setPage(1); setSearch(searchInput) }}
            role="search"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search" className="input pl-9" placeholder="Search by title, tracking ID, location…"
              value={searchInput} onChange={e => setSearchInput(e.target.value)}
              aria-label="Search grievances"
            />
          </form>
          <Filter className="h-4 w-4 text-muted" aria-hidden />
          <select className="input !w-auto !py-2" value={statusF} onChange={e => { setPage(1); setStatusF(e.target.value) }} aria-label="Status filter">
            <option value="">All statuses</option>
            {['submitted', 'under_review', 'in_progress', 'escalated', 'resolved', 'closed', 'rejected', 'reopened'].map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <select className="input !w-auto !py-2" value={priorityF} onChange={e => { setPage(1); setPriorityF(e.target.value) }} aria-label="Priority filter">
            <option value="">All priorities</option>
            {['critical', 'high', 'medium', 'low'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {staff && (
            <select className="input !w-auto !py-2" value={overdueF} onChange={e => { setPage(1); setOverdueF(e.target.value) }} aria-label="Deadline filter">
              <option value="">Any deadline</option>
              <option value="true">Overdue only</option>
              <option value="false">Within deadline</option>
            </select>
          )}
          <select className="input !w-auto !py-2" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort order">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="due">Deadline soonest</option>
            <option value="priority">Priority</option>
          </select>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      <div className="card overflow-hidden">
        {!data && !error ? (
          <TableSkeleton rows={6} />
        ) : data && data.items.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No grievances match" hint="Adjust the filters or search term." />
          </div>
        ) : data ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] divide-y divide-border">
                <thead className="bg-ice">
                  <tr>
                    <th className="th">Tracking ID</th>
                    <th className="th">Title</th>
                    {staff && <th className="th">Department</th>}
                    <th className="th">Status</th>
                    <th className="th">Priority</th>
                    <th className="th">Submitted</th>
                    {staff && <th className="th">SLA</th>}
                    <th className="th"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-white">
                  {data.items.map(g => (
                    <tr key={g.id} className="hover:bg-ice/60">
                      <td className="td font-mono text-xs">{g.tracking_id}</td>
                      <td className="td max-w-[300px]">
                        <span className="line-clamp-1 font-medium">{g.title}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {g.is_demo_data && <DemoBadge />}
                          {g.needs_triage && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-warning">triage</span>}
                          {g.location && <span className="text-[11px] text-muted">{g.location}</span>}
                        </span>
                      </td>
                      {staff && <td className="td text-muted">{g.department_name || <span className="text-warning">Unassigned</span>}</td>}
                      <td className="td"><StatusBadge status={g.status} /></td>
                      <td className="td"><PriorityBadge priority={g.priority} /></td>
                      <td className="td text-muted">{formatDate(g.submitted_at)}</td>
                      {staff && (
                        <td className="td">
                          {g.is_overdue
                            ? <span className="text-xs font-bold text-danger">OVERDUE</span>
                            : g.due_at ? <span className="text-xs text-muted">{formatDate(g.due_at)}</span> : '—'}
                        </td>
                      )}
                      <td className="td">
                        <Link to={`/grievances/${g.id}`} className="text-sm font-semibold text-primary hover:underline">Open</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} />
          </>
        ) : null}
      </div>
    </div>
  )
}
