import { useCallback, useEffect, useState } from 'react'
import { Search, ShieldCheck, UserPlus, UserX } from 'lucide-react'
import { api, ApiError } from '../../lib/api'
import type { Department, Role, User } from '../../lib/types'
import { ErrorState, TableSkeleton } from '../../components/States'
import { formatDate } from '../../lib/format'
import { useAuth } from '../../context/AuthContext'

const EMPTY_FORM = { email: '', full_name: '', password: '', role: 'officer' as Role, department_id: '' }

export default function AdminUsers() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<User[] | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const [u, d] = await Promise.all([
        api.get<User[]>(`/admin/users?limit=300${search ? `&search=${encodeURIComponent(search)}` : ''}${roleFilter ? `&role=${roleFilter}` : ''}`),
        api.get<Department[]>('/departments'),
      ])
      setUsers(u); setDepartments(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users')
    }
  }, [search, roleFilter])

  useEffect(() => { void load() }, [load])

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setFormError('')
    try {
      await api.post('/admin/users', {
        email: form.email, full_name: form.full_name, password: form.password,
        role: form.role, department_id: form.department_id ? Number(form.department_id) : null,
      })
      setForm(EMPTY_FORM); setShowForm(false)
      await load()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create user')
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (u: User) => {
    try {
      await api.patch(`/admin/users/${u.id}`, { is_active: !u.is_active })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed')
    }
  }

  const changeRole = async (u: User, role: Role) => {
    try {
      await api.patch(`/admin/users/${u.id}`, { role })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed')
    }
  }

  const deptName = (id: number | null) => departments.find(d => d.id === id)?.name ?? '—'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="mt-1 text-sm text-muted">Register officers and administrators, manage roles and access.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(s => !s)}>
          <UserPlus className="h-4 w-4" aria-hidden /> {showForm ? 'Close form' : 'Create staff user'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={createUser} className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="label" htmlFor="u-name">Full name</label>
            <input id="u-name" className="input" required value={form.full_name}
                   onChange={e => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="u-email">Email</label>
            <input id="u-email" type="email" className="input" required value={form.email}
                   onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="u-pass">Temporary password</label>
            <input id="u-pass" type="password" className="input" required minLength={8} value={form.password}
                   onChange={e => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="u-role">Role</label>
            <select id="u-role" className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value as Role })}>
              <option value="officer">Officer</option>
              <option value="admin">Admin</option>
              <option value="citizen">Citizen</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="u-dept">Department {form.role === 'officer' && <span className="text-danger">*</span>}</label>
            <select id="u-dept" className="input" value={form.department_id} required={form.role === 'officer'}
                    onChange={e => setForm({ ...form, department_id: e.target.value })}>
              <option value="">— none —</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          {formError && <p className="text-sm text-danger sm:col-span-5" role="alert">{formError}</p>}
          <div className="sm:col-span-5">
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create user'}</button>
          </div>
        </form>
      )}

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" className="input pl-9" placeholder="Search name or email…"
                 value={search} onChange={e => setSearch(e.target.value)} aria-label="Search users" />
        </div>
        <select className="input !w-40 !py-2" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} aria-label="Role filter">
          <option value="">All roles</option>
          <option value="citizen">Citizens</option>
          <option value="officer">Officers</option>
          <option value="admin">Admins</option>
        </select>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      <div className="card overflow-hidden">
        {!users ? <TableSkeleton rows={6} /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] divide-y divide-border">
              <thead className="bg-ice">
                <tr>
                  <th className="th">User</th>
                  <th className="th">Role</th>
                  <th className="th">Department</th>
                  <th className="th">Status</th>
                  <th className="th">Joined</th>
                  <th className="th">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-ice/50">
                    <td className="td">
                      <p className="font-medium">{u.full_name} {u.id === me?.id && <span className="text-xs text-muted">(you)</span>}</p>
                      <p className="text-xs text-muted">{u.email}</p>
                    </td>
                    <td className="td">
                      <select className="input !w-32 !py-1.5 text-xs" value={u.role} disabled={u.id === me?.id}
                              onChange={e => changeRole(u, e.target.value as Role)} aria-label={`Role for ${u.full_name}`}>
                        <option value="citizen">citizen</option>
                        <option value="officer">officer</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="td text-muted">{u.role === 'officer' ? deptName(u.department_id) : '—'}</td>
                    <td className="td">
                      {u.is_active
                        ? <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-success">Active</span>
                        : <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-danger">Deactivated</span>}
                    </td>
                    <td className="td text-muted">{formatDate(u.created_at)}</td>
                    <td className="td">
                      {u.id !== me?.id && (
                        <button className={u.is_active ? 'btn-secondary !px-2.5 !py-1.5 !text-xs' : 'btn-primary !px-2.5 !py-1.5 !text-xs'}
                                onClick={() => toggleActive(u)}>
                          {u.is_active ? <><UserX className="h-3.5 w-3.5" /> Deactivate</> : <><ShieldCheck className="h-3.5 w-3.5" /> Reactivate</>}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
