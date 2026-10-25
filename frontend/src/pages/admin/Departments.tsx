import { useCallback, useEffect, useState } from 'react'
import { Building2, Plus, Save, Tags } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import type { Category, Department } from '../../lib/types'
import { ErrorState, Spinner } from '../../components/States'

export default function AdminDepartments() {
  const [departments, setDepartments] = useState<Department[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [newDept, setNewDept] = useState({ name: '', description: '', jurisdictions: '' })
  const [showDeptForm, setShowDeptForm] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const [d, c] = await Promise.all([api.get<Department[]>('/departments'), api.get<Category[]>('/categories')])
      setDepartments(d); setCategories(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const saveCategoryMapping = async (cat: Category, department_id: string, sla: string) => {
    setBusyId(cat.id)
    try {
      await api.patch(`/categories/${cat.id}`, {
        name: cat.name,
        department_id: department_id ? Number(department_id) : null,
        sla_resolution_hours: Number(sla) || cat.sla_resolution_hours,
      })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save mapping')
    } finally {
      setBusyId(null)
    }
  }

  const createDepartment = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusyId(-1)
    try {
      await api.post('/departments', newDept)
      setNewDept({ name: '', description: '', jurisdictions: '' }); setShowDeptForm(false)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create department')
    } finally {
      setBusyId(null)
    }
  }

  const toggleDept = async (d: Department) => {
    try {
      await api.patch(`/departments/${d.id}`, { is_active: !d.is_active })
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed')
    }
  }

  if (error && !departments) return <ErrorState message={error} onRetry={load} />
  if (!departments) return <Spinner label="Loading departments…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Departments & Routing Rules</h1>
          <p className="mt-1 text-sm text-muted">
            Category→department mappings drive automatic routing; SLA hours drive deadlines.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowDeptForm(s => !s)}>
          <Plus className="h-4 w-4" aria-hidden /> New department
        </button>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-danger" role="alert">{error}</p>}

      {showDeptForm && (
        <form onSubmit={createDepartment} className="card grid gap-4 p-5 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="d-name">Name</label>
            <input id="d-name" className="input" required value={newDept.name}
                   onChange={e => setNewDept({ ...newDept, name: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="d-desc">Description</label>
            <input id="d-desc" className="input" value={newDept.description}
                   onChange={e => setNewDept({ ...newDept, description: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="d-jur">Jurisdictions (comma-separated)</label>
            <input id="d-jur" className="input" placeholder="Chennai North,Chennai South" value={newDept.jurisdictions}
                   onChange={e => setNewDept({ ...newDept, jurisdictions: e.target.value })} />
          </div>
          <div className="sm:col-span-3">
            <button className="btn-primary" disabled={busyId === -1}>{busyId === -1 ? 'Creating…' : 'Create department'}</button>
          </div>
        </form>
      )}

      <section className="card overflow-hidden">
        <h2 className="flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-semibold">
          <Building2 className="h-4 w-4 text-primary" aria-hidden /> Departments ({departments.length})
        </h2>
        <ul className="divide-y divide-border">
          {departments.map(d => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{d.name}
                  {!d.is_active && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-muted">inactive</span>}
                </p>
                <p className="text-xs text-muted">{d.description}</p>
                {d.jurisdictions && <p className="mt-0.5 text-[11px] text-muted">Jurisdictions: {d.jurisdictions}</p>}
              </div>
              <button className={d.is_active ? 'btn-secondary !py-1.5 !text-xs' : 'btn-primary !py-1.5 !text-xs'} onClick={() => toggleDept(d)}>
                {d.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card overflow-hidden">
        <h2 className="flex items-center gap-2 border-b border-border px-5 py-3.5 text-sm font-semibold">
          <Tags className="h-4 w-4 text-primary" aria-hidden /> Category → department routing map
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] divide-y divide-border">
            <thead className="bg-ice">
              <tr>
                <th className="th">Category</th>
                <th className="th">Responsible department</th>
                <th className="th">Default SLA (hours)</th>
                <th className="th"><span className="sr-only">Save</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white">
              {categories.map(c => (
                <CategoryRow key={c.id} cat={c} departments={departments}
                             busy={busyId === c.id} onSave={saveCategoryMapping} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function CategoryRow({ cat, departments, busy, onSave }: {
  cat: Category
  departments: Department[]
  busy: boolean
  onSave: (c: Category, dept: string, sla: string) => void
}) {
  const [dept, setDept] = useState(String(cat.department_id ?? ''))
  const [sla, setSla] = useState(String(cat.sla_resolution_hours))
  const dirty = dept !== String(cat.department_id ?? '') || sla !== String(cat.sla_resolution_hours)
  return (
    <tr>
      <td className="td font-medium capitalize">{cat.name}</td>
      <td className="td">
        <select className="input !w-64 !py-1.5" value={dept} onChange={e => setDept(e.target.value)} aria-label={`Department for ${cat.name}`}>
          <option value="">— unassigned (triage) —</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </td>
      <td className="td">
        <input type="number" min={1} className="input !w-24 !py-1.5" value={sla} onChange={e => setSla(e.target.value)}
               aria-label={`SLA hours for ${cat.name}`} />
      </td>
      <td className="td">
        <button className="btn-primary !px-3 !py-1.5 !text-xs" disabled={!dirty || busy} onClick={() => onSave(cat, dept, sla)}>
          <Save className="h-3.5 w-3.5" aria-hidden /> {busy ? 'Saving…' : 'Save'}
        </button>
      </td>
    </tr>
  )
}
