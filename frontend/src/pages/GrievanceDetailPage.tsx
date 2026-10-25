import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, Bot, Building2, CalendarClock, CheckCircle2, Download, FileUp,
  Link2, MessageSquare, Paperclip, RotateCcw, Send, Star, Timer, UserCheck, XCircle,
} from 'lucide-react'
import { api, ApiError, getToken } from '../lib/api'
import type { Category, Department, GrievanceDetail } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { AIBadge, DemoBadge, PriorityBadge, StatusBadge } from '../components/Badges'
import { ErrorState, Spinner } from '../components/States'
import Timeline from '../components/Timeline'
import { fileSize, formatDate, hoursLeft, pct } from '../lib/format'

type TransitionForm = { to_status: string; note: string; resolution_summary: string; rejection_reason: string } | null

export default function GrievanceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [g, setG] = useState<GrievanceDetail | null>(null)
  const [allowed, setAllowed] = useState<string[]>([])
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [comment, setComment] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [transition, setTransition] = useState<TransitionForm>(null)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [overridePriority, setOverridePriority] = useState('high')
  const [overrideReason, setOverrideReason] = useState('')
  const [assignOpen, setAssignOpen] = useState(false)
  const [departments, setDepartments] = useState<Department[]>([])
  const [officers, setOfficers] = useState<{ id: number; full_name: string }[]>([])
  const [assignDept, setAssignDept] = useState<string>('')
  const [assignOfficer, setAssignOfficer] = useState<string>('')
  const [assignReason, setAssignReason] = useState('')
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [fbRating, setFbRating] = useState(5)
  const [fbComments, setFbComments] = useState('')
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [correctCat, setCorrectCat] = useState('')
  const [correctReason, setCorrectReason] = useState('')

  const staff = user?.role === 'officer' || user?.role === 'admin'

  const load = useCallback(async () => {
    setError('')
    try {
      const [detail, trans] = await Promise.all([
        api.get<GrievanceDetail>(`/grievances/${id}`),
        api.get<{ allowed: string[] }>(`/grievances/${id}/allowed-transitions`).catch(() => ({ allowed: [] })),
      ])
      setG(detail)
      setAllowed(trans.allowed)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load grievance')
    }
  }, [id])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!staff) return
    api.get<Department[]>('/departments').then(setDepartments).catch(() => {})
    api.get<Category[]>('/categories').then(setCategories).catch(() => {})
  }, [staff])

  useEffect(() => {
    if (!assignOpen) return
    const deptId = assignDept || String(g?.department_id ?? '')
    if (!deptId) { setOfficers([]); return }
    api.get<{ id: number; full_name: string }[]>(`/departments/${deptId}/officers`)
      .then(setOfficers).catch(() => setOfficers([]))
  }, [assignOpen, assignDept, g?.department_id])

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!g || !user) return <Spinner label="Loading grievance…" />

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setActionError('')
    try {
      await fn()
      await load()
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const addComment = async () => {
    if (!comment.trim()) return
    await run(async () => {
      await api.post(`/grievances/${g.id}/comments`, { body: comment.trim(), is_internal: staff && isInternal })
      setComment(''); setIsInternal(false)
    })
  }

  const doTransition = async () => {
    if (!transition) return
    await run(async () => {
      await api.post(`/grievances/${g.id}/transition`, {
        to_status: transition.to_status, note: transition.note,
        resolution_summary: transition.resolution_summary, rejection_reason: transition.rejection_reason,
      })
      setTransition(null)
    })
  }

  const uploadAttachment = async (files: FileList | null) => {
    if (!files?.length) return
    await run(async () => {
      for (const f of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', f)
        await api.upload(`/grievances/${g.id}/attachments`, fd)
      }
    })
  }

  const downloadAttachment = async (attId: number, filename: string) => {
    try {
      const blob = await api.download(`/grievances/${g.id}/attachments/${attId}`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    } catch {
      setActionError('Download failed')
    }
  }

  const deadline = hoursLeft(g.due_at)
  const pred = g.ai_predictions[g.ai_predictions.length - 1]

  const transitionLabel: Record<string, string> = {
    under_review: 'Start Review', in_progress: 'Mark In Progress', escalated: 'Escalate',
    resolved: 'Resolve…', closed: 'Close Case', reopened: 'Reopen', rejected: 'Reject…',
  }

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-sm font-semibold text-primary">{g.tracking_id}</p>
            <StatusBadge status={g.status} />
            <PriorityBadge priority={g.priority} />
            {g.is_demo_data && <DemoBadge />}
            {g.needs_triage && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold text-warning">
                <AlertTriangle className="h-3 w-3" aria-hidden /> Needs triage
              </span>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-bold leading-snug">{g.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1"><UserCheck className="h-3.5 w-3.5" aria-hidden /> {staff ? g.citizen_name || `Citizen #${g.citizen_id}` : 'You'}</span>
            <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" aria-hidden /> Submitted {formatDate(g.submitted_at)}</span>
            {g.location && <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" aria-hidden /> {g.location}{g.jurisdiction ? `, ${g.jurisdiction}` : ''}</span>}
          </p>
        </div>
        {staff && deadline && ['submitted', 'under_review', 'in_progress', 'escalated', 'reopened'].includes(g.status) && (
          <div className={`rounded-lg border px-4 py-2.5 text-sm font-semibold ${deadline.overdue ? 'border-red-200 bg-red-50 text-danger' : 'border-border bg-white text-ink'}`}>
            <Timer className="mr-1.5 inline h-4 w-4" aria-hidden />
            {deadline.overdue ? `SLA breached — ${deadline.text}` : `SLA deadline: ${deadline.text}`}
            <p className="mt-0.5 text-xs font-normal text-muted">Due {formatDate(g.due_at)}</p>
          </div>
        )}
      </div>

      {actionError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-danger" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {actionError}
        </div>
      )}

      {/* action bar */}
      <div className="card flex flex-wrap items-center gap-2 p-4">
        <p className="mr-2 text-sm font-semibold text-muted">Actions:</p>
        {allowed.includes('resolved') && (
          <button className="btn-primary !bg-success hover:!bg-emerald-700" disabled={busy}
                  onClick={() => setTransition({ to_status: 'resolved', note: '', resolution_summary: '', rejection_reason: '' })}>
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Resolve…
          </button>
        )}
        {allowed.filter(s => !['resolved', 'rejected'].includes(s)).map(s => (
          <button key={s} className={s === 'reopened' ? 'btn-secondary' : 'btn-primary'} disabled={busy}
                  onClick={() => setTransition({ to_status: s, note: '', resolution_summary: '', rejection_reason: '' })}>
            <ArrowRight className="h-4 w-4" aria-hidden /> {transitionLabel[s] ?? s}
          </button>
        ))}
        {allowed.includes('rejected') && (
          <button className="btn-danger" disabled={busy}
                  onClick={() => setTransition({ to_status: 'rejected', note: '', resolution_summary: '', rejection_reason: '' })}>
            <XCircle className="h-4 w-4" aria-hidden /> Reject…
          </button>
        )}
        {staff && (
          <>
            <button className="btn-secondary" disabled={busy} onClick={() => setOverrideOpen(o => !o)}>
              <AlertTriangle className="h-4 w-4" aria-hidden /> Override priority
            </button>
            <button className="btn-secondary" disabled={busy}
                    onClick={() => { setAssignDept(String(g.department_id ?? '')); setAssignOfficer(String(g.assignee_id ?? '')); setAssignOpen(o => !o) }}>
              <UserCheck className="h-4 w-4" aria-hidden /> Assign / reassign
            </button>
            {user.role === 'admin' && (
              <button className="btn-secondary" disabled={busy} onClick={() => { setCorrectCat(String(g.category_id ?? '')); setCorrectionOpen(o => !o) }}>
                <Bot className="h-4 w-4" aria-hidden /> Correct category
              </button>
            )}
          </>
        )}
        {user.role === 'citizen' && (g.status === 'resolved' || g.status === 'closed') && !g.feedback && (
          <button className="btn-secondary" onClick={() => setFeedbackOpen(o => !o)}>
            <Star className="h-4 w-4" aria-hidden /> Give feedback
          </button>
        )}
      </div>

      {/* transition dialog */}
      {transition && (
        <div className="card border-primary/30 p-5">
          <h2 className="text-base font-semibold capitalize">
            {transition.to_status === 'resolved' ? 'Resolve grievance' :
             transition.to_status === 'rejected' ? 'Reject grievance' :
             `Move to “${transition.to_status.replace(/_/g, ' ')}”`}
          </h2>
          <div className="mt-3 space-y-3">
            {transition.to_status === 'resolved' && (
              <div>
                <label className="label" htmlFor="t-summary">Resolution summary <span className="text-danger">*</span></label>
                <textarea id="t-summary" rows={3} className="input" placeholder="What was done, by whom, and how it was verified…"
                          value={transition.resolution_summary}
                          onChange={e => setTransition({ ...transition, resolution_summary: e.target.value })} />
                <p className="mt-1 text-xs text-muted">Shown to the citizen and stored permanently.</p>
              </div>
            )}
            {transition.to_status === 'rejected' && (
              <div>
                <label className="label" htmlFor="t-reason">Rejection reason <span className="text-danger">*</span></label>
                <textarea id="t-reason" rows={3} className="input" placeholder="Documented reason (required)…"
                          value={transition.rejection_reason}
                          onChange={e => setTransition({ ...transition, rejection_reason: e.target.value })} />
              </div>
            )}
            <div>
              <label className="label" htmlFor="t-note">Note <span className="font-normal text-muted">(optional{transition.to_status === 'in_progress' && user.role !== 'citizen' ? ' — visible to citizen as a progress update' : ''})</span></label>
              <textarea id="t-note" rows={2} className="input" value={transition.note}
                        onChange={e => setTransition({ ...transition, note: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button className="btn-primary" disabled={busy} onClick={doTransition}>Confirm</button>
              <button className="btn-secondary" disabled={busy} onClick={() => setTransition(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* override priority dialog */}
      {overrideOpen && (
        <div className="card p-5">
          <h2 className="text-base font-semibold">Override priority</h2>
          <p className="mt-1 text-xs text-muted">Current: <PriorityBadge priority={g.priority} /> — overrides are recorded in the audit log with your reason.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[200px_1fr]">
            <select className="input" value={overridePriority} onChange={e => setOverridePriority(e.target.value)} aria-label="New priority">
              {['critical', 'high', 'medium', 'low'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input className="input" placeholder="Reason (required, min 5 characters)" value={overrideReason}
                   onChange={e => setOverrideReason(e.target.value)} aria-label="Override reason" />
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" disabled={busy || overrideReason.trim().length < 5}
                    onClick={() => run(async () => {
                      await api.post(`/grievances/${g.id}/priority-override`, { priority: overridePriority, reason: overrideReason.trim() })
                      setOverrideOpen(false); setOverrideReason('')
                    })}>
              Save override
            </button>
            <button className="btn-secondary" onClick={() => setOverrideOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* assign dialog */}
      {assignOpen && (
        <div className="card p-5">
          <h2 className="text-base font-semibold">Assign / reassign</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="a-dept">Department</label>
              <select id="a-dept" className="input" value={assignDept} onChange={e => { setAssignDept(e.target.value); setAssignOfficer('') }}>
                <option value="">— none —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="a-off">Officer</label>
              <select id="a-off" className="input" value={assignOfficer} onChange={e => setAssignOfficer(e.target.value)}>
                <option value="">— department pool —</option>
                {officers.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="a-reason">Reason</label>
              <input id="a-reason" className="input" value={assignReason} onChange={e => setAssignReason(e.target.value)} placeholder="e.g. field engineer on duty" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" disabled={busy}
                    onClick={() => run(async () => {
                      await api.post(`/grievances/${g.id}/assign`, {
                        department_id: assignDept ? Number(assignDept) : null,
                        officer_id: assignOfficer ? Number(assignOfficer) : null,
                        reason: assignReason.trim() || 'manual-assignment',
                      })
                      setAssignOpen(false); setAssignReason('')
                    })}>
              Save assignment
            </button>
            <button className="btn-secondary" onClick={() => setAssignOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* category correction dialog */}
      {correctionOpen && (
        <div className="card p-5">
          <h2 className="text-base font-semibold">Correct AI category</h2>
          <p className="mt-1 text-xs text-muted">The AI prediction stays recorded; your correction becomes the official decision (audited).</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <select className="input" value={correctCat} onChange={e => setCorrectCat(e.target.value)} aria-label="Correct category">
              <option value="">— select —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input className="input" placeholder="Reason" value={correctReason} onChange={e => setCorrectReason(e.target.value)} aria-label="Correction reason" />
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" disabled={busy || !correctCat}
                    onClick={() => run(async () => {
                      await api.post(`/grievances/${g.id}/category-correction`, { category_id: Number(correctCat), reason: correctReason.trim() })
                      setCorrectionOpen(false); setCorrectReason('')
                    })}>
              Save correction
            </button>
            <button className="btn-secondary" onClick={() => setCorrectionOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* feedback dialog */}
      {feedbackOpen && (
        <div className="card p-5">
          <h2 className="text-base font-semibold">Rate the resolution</h2>
          <div className="mt-3 flex items-center gap-1.5" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" role="radio" aria-checked={fbRating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
                      onClick={() => setFbRating(n)}
                      className={`rounded-lg border p-1.5 ${fbRating >= n ? 'border-amber-300 bg-amber-50 text-amber-500' : 'border-border text-muted hover:border-amber-200'}`}>
                <Star className="h-5 w-5" fill={fbRating >= n ? 'currentColor' : 'none'} aria-hidden />
              </button>
            ))}
            <span className="ml-2 text-sm font-semibold">{fbRating}/5</span>
          </div>
          <textarea rows={3} className="input mt-3" placeholder="Comments (optional)" value={fbComments}
                    onChange={e => setFbComments(e.target.value)} aria-label="Feedback comments" />
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" disabled={busy}
                    onClick={() => run(async () => {
                      await api.post(`/grievances/${g.id}/feedback`, { rating: fbRating, comments: fbComments.trim() })
                      setFeedbackOpen(false); setFbComments('')
                    })}>
              Submit feedback
            </button>
            <button className="btn-secondary" onClick={() => setFeedbackOpen(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        {/* ============ main column ============ */}
        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Description</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{g.description}</p>
            {g.address && <p className="mt-2 text-xs text-muted">Address landmark: {g.address}</p>}
            {g.latitude != null && g.longitude != null && (
              <p className="mt-1 text-xs text-muted">Coordinates: {g.latitude.toFixed(4)}, {g.longitude.toFixed(4)}</p>
            )}
            {g.resolution_summary && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
                  <CheckCircle2 className="h-4 w-4" aria-hidden /> Resolution summary
                </p>
                <p className="mt-1 text-sm text-ink">{g.resolution_summary}</p>
                <p className="mt-1 text-xs text-muted">Resolved {formatDate(g.resolved_at)}</p>
              </div>
            )}
            {g.rejection_reason && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3.5">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-danger">
                  <XCircle className="h-4 w-4" aria-hidden /> Rejection reason
                </p>
                <p className="mt-1 text-sm text-ink">{g.rejection_reason}</p>
              </div>
            )}
            {g.priority_override_reason && (
              <p className="mt-3 text-xs text-muted">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-warning" aria-hidden />
                Priority overridden by staff: “{g.priority_override_reason}”
              </p>
            )}
            {g.feedback && (
              <div className="mt-4 rounded-lg border border-border bg-ice/50 p-3.5">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Star className="h-4 w-4 text-amber-500" fill="currentColor" aria-hidden /> Citizen feedback: {g.feedback.rating}/5
                </p>
                {g.feedback.comments && <p className="mt-1 text-sm text-muted">“{g.feedback.comments}”</p>}
              </div>
            )}
          </section>

          {/* attachments */}
          <section className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
                <Paperclip className="h-4 w-4" aria-hidden /> Attachments ({g.attachments.length})
              </h2>
              {(!['closed', 'rejected'].includes(g.status)) && (
                <label className="btn-secondary !py-1.5 cursor-pointer">
                  <FileUp className="h-4 w-4" aria-hidden /> Upload
                  <input type="file" className="sr-only" multiple onChange={e => { uploadAttachment(e.target.files); e.target.value = '' }} />
                </label>
              )}
            </div>
            {g.attachments.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No attachments. Photos of the issue help officers act faster.</p>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {g.attachments.map(a => (
                  <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{a.original_filename}</span>
                      <span className="text-xs text-muted">{fileSize(a.size_bytes)} • {formatDate(a.created_at)}</span>
                    </span>
                    <button className="btn-secondary !px-2.5 !py-1.5" onClick={() => downloadAttachment(a.id, a.original_filename)}
                            aria-label={`Download ${a.original_filename}`}>
                      <Download className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* comments */}
          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
              <MessageSquare className="h-4 w-4" aria-hidden /> Conversation & updates
            </h2>
            <ul className="mt-4 space-y-3">
              {g.comments.length === 0 && <li className="text-sm text-muted">No updates yet.</li>}
              {g.comments.map(c => (
                <li key={c.id} className={`rounded-lg border p-3.5 ${c.is_internal ? 'border-amber-200 bg-amber-50/60' : 'border-border bg-white'}`}>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-ink">{c.author_name || `User #${c.author_id}`}</span>
                    <span className="rounded-full bg-ice px-2 py-0.5 font-medium uppercase text-primary">{c.author_role}</span>
                    {c.is_internal && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-warning">INTERNAL — not visible to citizen</span>
                    )}
                    <span className="ml-auto text-muted">{formatDate(c.created_at)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{c.body}</p>
                </li>
              ))}
            </ul>
            {!['closed', 'rejected'].includes(g.status) && (
              <div className="mt-4 border-t border-border pt-4">
                <label className="label" htmlFor="new-comment">
                  {user.role === 'citizen' ? 'Add information to your grievance' : 'Post an update'}
                </label>
                <textarea id="new-comment" rows={3} className="input" value={comment}
                          onChange={e => setComment(e.target.value)}
                          placeholder={user.role === 'citizen' ? 'Add details, corrections or new evidence…' : 'Progress update for the citizen…'} />
                {staff && (
                  <label className="mt-2 flex items-center gap-2 text-sm text-muted">
                    <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)}
                           className="h-4 w-4 rounded border-border accent-[#0066F5]" />
                    Internal investigation note (hidden from the citizen)
                  </label>
                )}
                <button className="btn-primary mt-3" disabled={busy || !comment.trim()} onClick={addComment}>
                  <Send className="h-4 w-4" aria-hidden /> Post
                </button>
              </div>
            )}
          </section>
        </div>

        {/* ============ side column ============ */}
        <div className="space-y-5">
          {/* routing card */}
          <section className="card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Routing & assignment</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Category</dt>
                <dd className="font-semibold capitalize">{g.category_name || <span className="text-warning">Pending triage</span>}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Department</dt>
                <dd className="text-right font-semibold">{g.department_name || <span className="text-warning">Unassigned</span>}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Assigned officer</dt>
                <dd className="text-right font-semibold">{g.assignee_name || <span className="text-muted">Department pool</span>}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Assigned at</dt>
                <dd className="text-right">{formatDate(g.assigned_at)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">SLA deadline</dt>
                <dd className={`text-right font-semibold ${g.is_overdue ? 'text-danger' : ''}`}>
                  {g.due_at ? formatDate(g.due_at) : '—'}
                </dd>
              </div>
            </dl>
            {g.assignments.length > 0 && (
              <details className="mt-3 border-t border-border pt-3">
                <summary className="cursor-pointer text-xs font-semibold text-primary">Assignment history ({g.assignments.length})</summary>
                <ul className="mt-2 space-y-2">
                  {g.assignments.map(a => (
                    <li key={a.id} className="rounded-lg bg-ice/60 px-3 py-2 text-xs">
                      <p className="font-semibold">{a.department_name || '—'}{a.officer_name ? ` → ${a.officer_name}` : ''}</p>
                      <p className="text-muted">{a.reason} • {formatDate(a.created_at)}</p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          {/* AI panel */}
          {pred && (
            <section className="card p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
                <Bot className="h-4 w-4" aria-hidden /> AI analysis
                <span className="ml-auto"><AIBadge method={pred.method} /></span>
              </h2>
              <div className="mt-3 space-y-2.5 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Predicted category</span>
                  <span className="font-semibold capitalize">{pred.predicted_category} ({pct(pred.confidence)})</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Urgency</span>
                  <span className="font-semibold capitalize">{pred.urgency_level} ({pred.urgency_score.toFixed(2)})</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Model version</span>
                  <span className="font-mono text-xs">{pred.model_version}</span>
                </div>
                {pred.recommended_department && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted">Suggested dept.</span>
                    <span className="text-right font-semibold">{pred.recommended_department}</span>
                  </div>
                )}
                <div>
                  <p className="mt-1 text-xs font-semibold text-muted">Urgency factors</p>
                  <ul className="mt-1 space-y-1">
                    {safeParse<string[]>(pred.urgency_factors_json, []).map(f => (
                      <li key={f} className="flex items-start gap-1.5 text-xs text-muted">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden /> {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="border-t border-border pt-2 text-[11px] text-muted">
                  {g.ai_analysis_status === 'needs_review' && 'Flagged for human review (low confidence or fallback model). '}
                  AI output is advisory — the official decision is the category/priority shown in the header.
                </p>
                {staff && (
                  <button className="btn-secondary w-full !py-2" disabled={busy}
                          onClick={() => run(() => api.post(`/ai/grievances/${g.id}/reanalyze`))}>
                    <RotateCcw className="h-4 w-4" aria-hidden /> Re-run AI analysis
                  </button>
                )}
              </div>
            </section>
          )}

          {/* duplicates */}
          {g.duplicate_candidates.length > 0 && (
            <section className="card p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
                <Link2 className="h-4 w-4" aria-hidden /> Possible duplicates ({g.duplicate_candidates.length})
              </h2>
              <ul className="mt-3 space-y-2.5">
                {g.duplicate_candidates.map(d => (
                  <li key={d.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <Link to={`/grievances/${d.candidate_grievance_id}`} className="line-clamp-2 text-sm font-medium text-primary hover:underline">
                        {d.candidate_title || d.candidate_tracking_id}
                      </Link>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${d.score >= 0.7 ? 'bg-red-50 text-danger' : d.score >= 0.5 ? 'bg-amber-50 text-warning' : 'bg-ice text-primary'}`}>
                        {pct(d.score)}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      {d.candidate_tracking_id} • {d.candidate_status.replace(/_/g, ' ')} • via {d.method}
                    </p>
                    {d.matched_terms && (
                      <p className="mt-1 flex flex-wrap gap-1">
                        {d.matched_terms.split(',').filter(Boolean).slice(0, 6).map(t => (
                          <span key={t} className="rounded bg-ice px-1.5 py-0.5 text-[10px] font-medium text-primary">{t.trim()}</span>
                        ))}
                      </p>
                    )}
                    {staff && d.review_status === 'pending' && (
                      <div className="mt-2 flex gap-2">
                        <button className="btn-secondary !px-2.5 !py-1 !text-xs" disabled={busy}
                                onClick={() => run(() => api.post(`/grievances/duplicates/${d.id}/review?decision=confirmed_duplicate`))}>
                          Confirm duplicate
                        </button>
                        <button className="btn-secondary !px-2.5 !py-1 !text-xs" disabled={busy}
                                onClick={() => run(() => api.post(`/grievances/duplicates/${d.id}/review?decision=dismissed`))}>
                          Dismiss
                        </button>
                      </div>
                    )}
                    {d.review_status !== 'pending' && (
                      <p className={`mt-2 text-xs font-semibold ${d.review_status === 'confirmed_duplicate' ? 'text-warning' : 'text-muted'}`}>
                        {d.review_status === 'confirmed_duplicate' ? '✓ Confirmed duplicate (both records preserved)' : 'Dismissed by reviewer'}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* timeline */}
          <section className="card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Timeline</h2>
            <div className="mt-4">
              <Timeline entries={[...g.history].reverse()} />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function safeParse<T>(json: string, fallback: T): T {
  try { return JSON.parse(json) as T } catch { return fallback }
}
