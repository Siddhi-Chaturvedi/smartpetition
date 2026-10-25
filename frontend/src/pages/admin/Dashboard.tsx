import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, BarChart3, Bot, CheckCircle2, Clock, Download, Flame, Gauge, Inbox,
  ListChecks, RotateCcw, Star, Timer, TriangleAlert,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api, buildQuery, getToken } from '../../lib/api'
import type { Category, Department, SummaryStats } from '../../lib/types'
import StatCard from '../../components/StatCard'
import { ErrorState, Spinner } from '../../components/States'

const PALETTE = ['#0066F5', '#059669', '#D97706', '#DC2626', '#64748B', '#7C3AED', '#0891B2', '#BE185D']

interface ModelInfo { available: boolean; version: string; method: string; dataset_note: string }
interface Evaluation { accuracy?: number; macro_f1?: number; caveat?: string; duplicate_detection?: unknown }

export default function AdminDashboard() {
  const [stats, setStats] = useState<SummaryStats | null>(null)
  const [cats, setCats] = useState<{ name: string; count: number }[]>([])
  const [depts, setDepts] = useState<{ name: string; total: number; open: number; overdue: number }[]>([])
  const [trend, setTrend] = useState<{ month: string; submitted: number; resolved: number }[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [model, setModel] = useState<ModelInfo | null>(null)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [error, setError] = useState('')
  const [fDept, setFDept] = useState('')
  const [fCat, setFCat] = useState('')
  const [fPriority, setFPriority] = useState('')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')

  const load = useCallback(async () => {
    setError('')
    const q = buildQuery({
      department_id: fDept || undefined, category_id: fCat || undefined,
      priority: fPriority || undefined, date_from: fFrom || undefined, date_to: fTo || undefined,
    })
    try {
      const [summary, catDist, deptLoad, trends] = await Promise.all([
        api.get<SummaryStats>(`/analytics/summary${q}`),
        api.get<{ name: string; count: number }[]>(`/analytics/categories${q}`),
        api.get<{ name: string; total: number; open: number; overdue: number }[]>('/analytics/departments'),
        api.get<{ month: string; submitted: number; resolved: number }[]>('/analytics/trends?months=12'),
      ])
      setStats(summary); setCats(catDist); setDepts(deptLoad); setTrend(trends)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics')
    }
  }, [fDept, fCat, fPriority, fFrom, fTo])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    api.get<Department[]>('/departments').then(setDepartments).catch(() => {})
    api.get<Category[]>('/categories').then(setCategories).catch(() => {})
    api.get<ModelInfo>('/ai/model-info').then(setModel).catch(() => {})
    api.get<Evaluation>('/ai/evaluation').then(setEvaluation).catch(() => {})
  }, [])

  const exportCsv = async () => {
    const res = await fetch(`/api/v1/grievances/export/csv${buildQuery({ department_id: fDept || undefined })}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'grievances-export.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!stats) return <Spinner label="Loading analytics…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">System Analytics</h1>
          <p className="mt-1 text-sm text-muted">All metrics are computed from live database queries.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={exportCsv}>
          <Download className="h-4 w-4" aria-hidden /> Export grievances CSV
        </button>
      </div>

      {/* filters */}
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label" htmlFor="f-dept">Department</label>
          <select id="f-dept" className="input !w-48 !py-2" value={fDept} onChange={e => setFDept(e.target.value)}>
            <option value="">All</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-cat">Category</label>
          <select id="f-cat" className="input !w-40 !py-2" value={fCat} onChange={e => setFCat(e.target.value)}>
            <option value="">All</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-prio">Priority</label>
          <select id="f-prio" className="input !w-32 !py-2" value={fPriority} onChange={e => setFPriority(e.target.value)}>
            <option value="">All</option>
            {['critical', 'high', 'medium', 'low'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-from">From</label>
          <input id="f-from" type="date" className="input !w-40 !py-2" value={fFrom} onChange={e => setFFrom(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="f-to">To</label>
          <input id="f-to" type="date" className="input !w-40 !py-2" value={fTo} onChange={e => setFTo(e.target.value)} />
        </div>
        {(fDept || fCat || fPriority || fFrom || fTo) && (
          <button className="btn-secondary !py-2" onClick={() => { setFDept(''); setFCat(''); setFPriority(''); setFFrom(''); setFTo('') }}>
            Clear filters
          </button>
        )}
      </div>

      {/* headline stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total grievances" value={stats.total} icon={ListChecks} />
        <StatCard label="Pending" value={stats.pending} icon={Inbox} tone="warning" hint={`${stats.needs_triage} awaiting triage`} />
        <StatCard label="In progress" value={stats.in_progress} icon={Clock} tone="primary" />
        <StatCard label="Resolved" value={stats.resolved + stats.closed} icon={CheckCircle2} tone="success" />
        <StatCard label="Overdue" value={stats.overdue} icon={AlertTriangle} tone={stats.overdue ? 'danger' : 'default'} />
        <StatCard label="Critical open" value={stats.critical_open} icon={Flame} tone="danger" />
        <StatCard label="Reopened" value={stats.reopened} icon={RotateCcw} tone="warning" />
        <StatCard label="Rejected" value={stats.rejected} icon={TriangleAlert} />
        <StatCard label="Avg resolution" value={stats.avg_resolution_hours != null ? `${stats.avg_resolution_hours}h` : '—'} icon={Timer}
                  hint={stats.median_resolution_hours != null ? `median ${stats.median_resolution_hours}h` : undefined} />
        <StatCard label="SLA compliance" value={stats.sla_compliance_pct != null ? `${stats.sla_compliance_pct}%` : '—'} icon={Gauge}
                  tone={stats.sla_compliance_pct != null && stats.sla_compliance_pct < 70 ? 'warning' : 'success'} />
        <StatCard label="Feedback" value={stats.feedback_avg_rating != null ? `${stats.feedback_avg_rating}/5` : '—'} icon={Star}
                  hint={`${stats.feedback_count} responses`} />
        <StatCard label="AI model" value={model?.available ? 'Trained' : 'Fallback'} icon={Bot}
                  tone={model?.available ? 'success' : 'warning'} hint={model?.version} />
      </div>

      {/* charts */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
            <BarChart3 className="h-4 w-4" aria-hidden /> Category distribution
          </h2>
          {cats.length === 0 ? <p className="py-10 text-center text-sm text-muted">No data for the selected filters.</p> : (
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={cats} dataKey="count" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                    {cats.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v}`, 'grievances']} />
                  <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
            <BarChart3 className="h-4 w-4" aria-hidden /> Department workload
          </h2>
          {depts.length === 0 ? <p className="py-10 text-center text-sm text-muted">No data.</p> : (
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={depts} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: '#64748B' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="open" name="Open" fill="#0066F5" radius={[0, 4, 4, 0]} barSize={14} />
                  <Bar dataKey="overdue" name="Overdue" fill="#DC2626" radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      <section className="card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
          <BarChart3 className="h-4 w-4" aria-hidden /> Monthly submission & resolution trend
        </h2>
        <div className="mt-4 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ left: 0, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748B' }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="submitted" name="Submitted" stroke="#0066F5" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#059669" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* AI model performance */}
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
            <Bot className="h-4 w-4" aria-hidden /> AI model performance
          </h2>
          <Link to="/admin/ai" className="text-sm font-semibold text-primary hover:underline">Full report →</Link>
        </div>
        {model && (
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-ice/50 p-3">
              <p className="text-xs text-muted">Status</p>
              <p className="mt-0.5 font-semibold">{model.available ? 'Trained model active' : 'Rule-based fallback'}</p>
            </div>
            <div className="rounded-lg border border-border bg-ice/50 p-3">
              <p className="text-xs text-muted">Version</p>
              <p className="mt-0.5 font-mono text-xs font-semibold">{model.version}</p>
            </div>
            <div className="rounded-lg border border-border bg-ice/50 p-3">
              <p className="text-xs text-muted">Test accuracy</p>
              <p className="mt-0.5 font-semibold">{evaluation?.accuracy != null ? pct1(evaluation.accuracy) : '—'}</p>
            </div>
            <div className="rounded-lg border border-border bg-ice/50 p-3">
              <p className="text-xs text-muted">Macro F1</p>
              <p className="mt-0.5 font-semibold">{evaluation?.macro_f1 != null ? pct1(evaluation.macro_f1) : '—'}</p>
            </div>
          </div>
        )}
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-warning">
          ⚠ {evaluation?.caveat ?? model?.dataset_note ?? 'Trained on synthetic demonstration data — metrics do not represent real-world accuracy.'}
        </p>
      </section>
    </div>
  )
}

function pct1(x: number) { return `${(x * 100).toFixed(1)}%` }
