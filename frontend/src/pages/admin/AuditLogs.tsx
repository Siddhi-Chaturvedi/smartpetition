import { useCallback, useEffect, useState } from 'react'
import { History, Search } from 'lucide-react'
import { api } from '../../lib/api'
import type { AuditLogEntry } from '../../lib/types'
import { ErrorState, TableSkeleton } from '../../components/States'
import Pagination from '../../components/Pagination'
import { formatDate } from '../../lib/format'

interface Page { items: AuditLogEntry[]; total: number; page: number; page_size: number }

export default function AdminAudit() {
  const [data, setData] = useState<Page | null>(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [actionInput, setActionInput] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '25' })
      if (action) params.set('action', action)
      setData(await api.get<Page>(`/admin/audit-logs?${params}`))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit logs')
    }
  }, [page, action])

  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><History className="h-6 w-6 text-primary" aria-hidden /> Audit Logs</h1>
        <p className="mt-1 text-sm text-muted">
          Permanent record of significant actions: who did what, when, from where.
        </p>
      </div>

      <form
        className="card flex flex-wrap items-center gap-3 p-4"
        onSubmit={e => { e.preventDefault(); setPage(1); setAction(actionInput) }}
        role="search"
      >
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" className="input pl-9" placeholder="Filter by action (e.g. grievance.status_changed)"
                 value={actionInput} onChange={e => setActionInput(e.target.value)} aria-label="Filter audit logs" />
        </div>
        <button className="btn-primary !py-2">Filter</button>
        {action && <button type="button" className="btn-secondary !py-2" onClick={() => { setAction(''); setActionInput('') }}>Clear</button>}
      </form>

      {error && <ErrorState message={error} onRetry={load} />}

      <div className="card overflow-hidden">
        {!data && !error ? <TableSkeleton rows={8} /> : data && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] divide-y divide-border">
                <thead className="bg-ice">
                  <tr>
                    <th className="th">When</th><th className="th">Actor</th><th className="th">Action</th>
                    <th className="th">Entity</th><th className="th">Detail</th><th className="th">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-white">
                  {data.items.map(a => (
                    <tr key={a.id} className="hover:bg-ice/50">
                      <td className="td whitespace-nowrap text-muted">{formatDate(a.created_at)}</td>
                      <td className="td font-medium">{a.actor_name || 'system'}</td>
                      <td className="td"><code className="rounded bg-ice px-1.5 py-0.5 font-mono text-[11px] text-primary">{a.action}</code></td>
                      <td className="td text-muted">{a.entity_type}{a.entity_id ? ` #${a.entity_id}` : ''}</td>
                      <td className="td max-w-[320px] truncate font-mono text-[11px] text-muted" title={a.detail}>{a.detail || '—'}</td>
                      <td className="td font-mono text-[11px] text-muted">{a.ip_address || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.page_size} total={data.total} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  )
}
