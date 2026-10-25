import { useCallback, useEffect, useState } from 'react'
import { PlayCircle, Save, Timer, Trash2 } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import type { SLARule } from '../../lib/types'
import { ErrorState, Spinner } from '../../components/States'
import { formatDate } from '../../lib/format'

interface Escalation { id: number; grievance_id: number; level: number; reason: string; notified_count: number; created_at?: string }
interface SweepStats { scanned: number; overdue: number; escalations_created: number; notifications: number }

export default function AdminSLA() {
  const [rules, setRules] = useState<SLARule[] | null>(null)
  const [escalations, setEscalations] = useState<Escalation[]>([])
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({ scope: 'category', scope_value: '', resolution_hours: 72, escalation_hours: 24 })

  const load = useCallback(async () => {
    setError('')
    try {
      const [r, e] = await Promise.all([
        api.get<SLARule[]>('/admin/sla-rules'),
        api.get<Escalation[]>('/admin/escalations?limit=20'),
      ])
      setRules(r); setEscalations(e)
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Failed to load SLA configuration')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const saveRule = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    try {
      await api.post('/admin/sla-rules', form)
      setForm({ scope: 'category', scope_value: '', resolution_hours: 72, escalation_hours: 24 })
      await load()
      setMsg('Rule saved.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save rule')
    }
  }

  const deleteRule = async (id: number) => {
    try {
      await api.delete(`/admin/sla-rules/${id}`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete rule')
    }
  }

  const runSweep = async () => {
    setMsg('')
    try {
      const stats = await api.post<SweepStats>('/admin/sla/run-sweep')
      setMsg(`Sweep complete: scanned ${stats.scanned}, overdue ${stats.overdue}, new escalations ${stats.escalations_created}, notifications ${stats.notifications}.`)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sweep failed')
    }
  }

  if (!rules && !error) return <Spinner label="Loading SLA configuration…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Timer className="h-6 w-6 text-primary" aria-hidden /> SLA Rules & Escalation</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Deadlines use <strong>UTC calendar hours</strong> (not business hours). A background scheduler runs
            every minute and escalates overdue cases automatically — the button below triggers the same sweep on
            demand for testing.
          </p>
        </div>
        <button className="btn-primary" onClick={runSweep}>
          <PlayCircle className="h-4 w-4" aria-hidden /> Run SLA sweep now
        </button>
      </div>

      {msg && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-success" role="status">{msg}</p>}
      {error && <ErrorState message={error} onRetry={load} />}

      <section className="card overflow-hidden">
        <h2 className="border-b border-border px-5 py-3.5 text-sm font-semibold">Rules (most specific scope wins: priority → category → department → global)</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] divide-y divide-border">
            <thead className="bg-ice">
              <tr>
                <th className="th">Scope</th><th className="th">Value</th>
                <th className="th">Resolution (h)</th><th className="th">Escalate after (h)</th>
                <th className="th"><span className="sr-only">Delete</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white">
              {rules?.map(r => (
                <tr key={r.id}>
                  <td className="td font-medium capitalize">{r.scope}</td>
                  <td className="td capitalize">{r.scope_value || <span className="text-muted">—</span>}</td>
                  <td className="td">{r.resolution_hours}</td>
                  <td className="td">{r.escalation_hours}</td>
                  <td className="td">
                    <button className="btn-secondary !px-2.5 !py-1.5" onClick={() => deleteRule(r.id)} aria-label={`Delete rule ${r.id}`}>
                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form onSubmit={saveRule} className="grid gap-3 border-t border-border bg-ice/40 p-5 sm:grid-cols-5">
          <div>
            <label className="label" htmlFor="r-scope">Scope</label>
            <select id="r-scope" className="input" value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })}>
              <option value="global">global</option>
              <option value="priority">priority</option>
              <option value="category">category</option>
              <option value="department">department</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="r-value">Value {form.scope !== 'global' && <span className="text-danger">*</span>}</label>
            <input id="r-value" className="input" required={form.scope !== 'global'} placeholder={form.scope === 'priority' ? 'critical' : form.scope === 'category' ? 'roads' : 'Transport'}
                   value={form.scope_value} onChange={e => setForm({ ...form, scope_value: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="r-res">Resolution hours</label>
            <input id="r-res" type="number" min={1} className="input" value={form.resolution_hours}
                   onChange={e => setForm({ ...form, resolution_hours: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label" htmlFor="r-esc">Escalation hours (after due)</label>
            <input id="r-esc" type="number" min={1} className="input" value={form.escalation_hours}
                   onChange={e => setForm({ ...form, escalation_hours: Number(e.target.value) })} />
          </div>
          <div className="flex items-end">
            <button className="btn-primary w-full" type="submit"><Save className="h-4 w-4" aria-hidden /> Save rule</button>
          </div>
        </form>
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-border px-5 py-3.5 text-sm font-semibold">Recent escalation events</h2>
        {escalations.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No escalations recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {escalations.map(e => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${e.level >= 3 ? 'bg-red-50 text-danger' : e.level === 2 ? 'bg-amber-50 text-warning' : 'bg-ice text-primary'}`}>
                  Level {e.level}
                </span>
                <span className="font-medium">Grievance #{e.grievance_id}</span>
                <span className="font-mono text-xs text-muted">{e.reason}</span>
                <span className="text-xs text-muted">{e.notified_count} notified</span>
                <span className="ml-auto text-xs text-muted">{formatDate(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
