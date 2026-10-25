import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  AlertTriangle, Bot, CheckCircle2, Copy, FileUp, Loader2, MapPin, Search, Send, Sparkles, X,
} from 'lucide-react'
import { api, ApiError, buildQuery } from '../../lib/api'
import type { Category, ClassifyResult, DuplicatePreviewItem, GrievanceDetail } from '../../lib/types'
import { AIBadge, PriorityBadge } from '../../components/Badges'
import { fileSize, pct } from '../../lib/format'

const schema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(200, 'Max 200 characters'),
  description: z.string().min(20, 'Please describe the issue in at least 20 characters')
    .max(8000, 'Max 8000 characters'),
  category: z.string().optional().or(z.literal('')),
  location: z.string().max(200).optional().or(z.literal('')),
  jurisdiction: z.string().max(120).optional().or(z.literal('')),
  address: z.string().max(1000).optional().or(z.literal('')),
  latitude: z.string().optional().or(z.literal('')),
  longitude: z.string().optional().or(z.literal('')),
})
type FormValues = z.infer<typeof schema>

const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'txt']
const MAX_SIZE = 5 * 1024 * 1024

export default function SubmitGrievance() {
  const [categories, setCategories] = useState<Category[]>([])
  const [ai, setAi] = useState<ClassifyResult | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [dups, setDups] = useState<DuplicatePreviewItem[] | null>(null)
  const [dupsLoading, setDupsLoading] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [fileErrors, setFileErrors] = useState<string[]>([])
  const [serverError, setServerError] = useState('')
  const [result, setResult] = useState<{ grievance: GrievanceDetail; uploaded: number } | null>(null)
  const [copied, setCopied] = useState(false)
  const debounceRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })
  const title = watch('title')
  const description = watch('description')
  const category = watch('category')
  const location = watch('location')

  useEffect(() => {
    api.get<Category[]>('/categories').then(setCategories).catch(() => setCategories([]))
  }, [])

  // Live AI hints + duplicate preview (debounced, only when text is meaningful)
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    const text = `${title ?? ''}. ${description ?? ''}`.trim()
    if (text.length < 40 || (description ?? '').length < 20) {
      setAi(null); setDups(null)
      return
    }
    debounceRef.current = window.setTimeout(async () => {
      setAiLoading(true); setDupsLoading(true)
      try {
        setAi(await api.post<ClassifyResult>('/ai/classify', { text }))
      } catch { setAi(null) } finally { setAiLoading(false) }
      try {
        setDups(await api.post<DuplicatePreviewItem[]>('/grievances/preview-duplicates', {
          title, description, category: category || null, location: location || '',
        }))
      } catch { setDups(null) } finally { setDupsLoading(false) }
    }, 700)
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current) }
  }, [title, description, category, location])

  const validateFiles = (list: FileList | null) => {
    if (!list) return
    const errs: string[] = []
    const chosen: File[] = []
    for (const f of Array.from(list)) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
      if (!ALLOWED_EXT.includes(ext)) { errs.push(`"${f.name}": .${ext || '?'} files are not allowed (${ALLOWED_EXT.join(', ')})`); continue }
      if (f.size > MAX_SIZE) { errs.push(`"${f.name}": exceeds the ${fileSize(MAX_SIZE)} limit`); continue }
      chosen.push(f)
    }
    setFileErrors(errs)
    setFiles(prev => [...prev, ...chosen].slice(0, 6))
  }

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx))

  const onSubmit = async (values: FormValues) => {
    setServerError('')
    try {
      const payload = {
        title: values.title.trim(),
        description: values.description.trim(),
        selected_category: values.category || null,
        location: values.location || '',
        jurisdiction: values.jurisdiction || '',
        address: values.address || '',
        latitude: values.latitude ? Number(values.latitude) : null,
        longitude: values.longitude ? Number(values.longitude) : null,
      }
      if (payload.latitude !== null && (isNaN(payload.latitude) || payload.latitude < -90 || payload.latitude > 90)) {
        setServerError('Latitude must be between -90 and 90'); return
      }
      if (payload.longitude !== null && (isNaN(payload.longitude) || payload.longitude < -180 || payload.longitude > 180)) {
        setServerError('Longitude must be between -180 and 180'); return
      }
      const g = await api.post<GrievanceDetail>(`/grievances`, payload)
      let uploaded = 0
      for (const f of files) {
        const fd = new FormData()
        fd.append('file', f)
        try {
          await api.upload(`/grievances/${g.id}/attachments`, fd)
          uploaded++
        } catch { /* partial upload failure must not lose the grievance */ }
      }
      setResult({ grievance: g, uploaded })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : 'Submission failed. Please try again.')
    }
  }

  if (result) {
    const g = result.grievance
    const pred = g.ai_predictions[g.ai_predictions.length - 1]
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border bg-emerald-50 px-6 py-5">
            <CheckCircle2 className="h-8 w-8 text-success" aria-hidden />
            <div>
              <h1 className="text-lg font-bold text-ink">Grievance registered successfully</h1>
              <p className="text-sm text-muted">Keep your tracking ID — you can follow every step with it.</p>
            </div>
          </div>
          <div className="space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-ice px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Tracking ID</p>
                <p className="font-mono text-lg font-bold text-primary">{g.tracking_id}</p>
              </div>
              <button
                type="button"
                className="btn-secondary !py-2"
                onClick={() => { navigator.clipboard?.writeText(g.tracking_id); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
              >
                <Copy className="h-4 w-4" aria-hidden /> {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-border p-3">
                <dt className="text-xs text-muted">Status</dt>
                <dd className="mt-1 font-semibold capitalize">{g.status.replace('_', ' ')}</dd>
              </div>
              <div className="rounded-lg border border-border p-3">
                <dt className="text-xs text-muted">Recommended priority</dt>
                <dd className="mt-1"><PriorityBadge priority={g.priority} /></dd>
              </div>
              <div className="rounded-lg border border-border p-3">
                <dt className="text-xs text-muted">Category</dt>
                <dd className="mt-1 font-semibold capitalize">{g.category_name || 'Pending review'}</dd>
              </div>
              <div className="rounded-lg border border-border p-3">
                <dt className="text-xs text-muted">Routed to</dt>
                <dd className="mt-1 font-semibold">{g.needs_triage ? 'Triage queue (admin review)' : g.department_name || '—'}</dd>
              </div>
            </dl>
            {pred && (
              <div className="rounded-lg border border-border p-3 text-sm">
                <p className="flex items-center gap-2 font-semibold">
                  <Bot className="h-4 w-4 text-primary" aria-hidden /> AI analysis
                  <AIBadge method={pred.method} />
                </p>
                <p className="mt-1 text-muted">
                  Predicted “{pred.predicted_category}” with {pct(pred.confidence)} confidence
                  (model {pred.model_version}). Urgency {pred.urgency_level} (score {pred.urgency_score}).
                </p>
                <p className="mt-1 text-xs text-muted">
                  Note: AI recommendations are advisory — an authorized officer makes the final decision.
                </p>
              </div>
            )}
            {result.uploaded > 0 && (
              <p className="text-sm text-success">{result.uploaded} attachment(s) uploaded.</p>
            )}
            {files.length > result.uploaded && (
              <p className="text-sm text-warning">
                {files.length - result.uploaded} attachment(s) could not be uploaded — you can add them from the grievance page.
              </p>
            )}
            <div className="flex flex-wrap gap-3 pt-2">
              <Link to={`/grievances/${g.id}`} className="btn-primary">View grievance</Link>
              <button type="button" className="btn-secondary" onClick={() => { setResult(null); setFiles([]); setFileErrors([]) }}>
                Submit another
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_380px]">
      <div>
        <h1 className="text-2xl font-bold">Submit a grievance</h1>
        <p className="mt-1 text-sm text-muted">
          Describe the issue clearly — the AI assistant will suggest a category and priority, and check for
          similar complaints before you submit.
        </p>

        {serverError && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-danger" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="card mt-5 space-y-5 p-6">
          <div>
            <label className="label" htmlFor="title">Title <span className="text-danger">*</span></label>
            <input id="title" className="input" placeholder="e.g. Potholes on Main Road near City Hospital"
                   {...register('title')} aria-invalid={!!errors.title} />
            {errors.title && <p className="field-error" role="alert">{errors.title.message}</p>}
          </div>

          <div>
            <label className="label" htmlFor="description">Detailed description <span className="text-danger">*</span></label>
            <textarea id="description" rows={6} className="input"
                      placeholder="What is the problem? Where exactly? Since when? Who is affected? Mention safety risks if any."
                      {...register('description')} aria-invalid={!!errors.description} />
            <div className="mt-1 flex items-center justify-between">
              {errors.description
                ? <p className="field-error !mt-0" role="alert">{errors.description.message}</p>
                : <span />}
              <span className="text-xs text-muted">{(description ?? '').length}/8000</span>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="category">Category <span className="font-normal text-muted">(optional — AI suggests one)</span></label>
              <select id="category" className="input" {...register('category')}>
                <option value="">Let AI decide</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="location">Location / area <span className="font-normal text-muted">(optional)</span></label>
              <input id="location" className="input" placeholder="e.g. Anna Nagar, Ward 12" {...register('location')} />
            </div>
            <div>
              <label className="label" htmlFor="jurisdiction">Jurisdiction <span className="font-normal text-muted">(optional)</span></label>
              <input id="jurisdiction" className="input" placeholder="e.g. Chennai North" {...register('jurisdiction')} />
            </div>
            <div>
              <label className="label" htmlFor="address">Address landmark <span className="font-normal text-muted">(optional)</span></label>
              <input id="address" className="input" placeholder="Near the bus stand, opposite the park" {...register('address')} />
            </div>
            <div>
              <label className="label" htmlFor="latitude">Latitude <span className="font-normal text-muted">(optional)</span></label>
              <input id="latitude" className="input" placeholder="13.0827" inputMode="decimal" {...register('latitude')} />
            </div>
            <div>
              <label className="label" htmlFor="longitude">Longitude <span className="font-normal text-muted">(optional)</span></label>
              <input id="longitude" className="input" placeholder="80.2707" inputMode="decimal" {...register('longitude')} />
            </div>
          </div>

          {/* attachments */}
          <div>
            <span className="label">Supporting files <span className="font-normal text-muted">(optional, max 6 files, 5 MB each)</span></span>
            <div
              className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border bg-ice/50 px-4 py-6 text-center hover:border-primary/40"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
              role="button" tabIndex={0} aria-label="Choose files to attach"
            >
              <FileUp className="h-6 w-6 text-muted" aria-hidden />
              <p className="text-sm font-medium text-ink">Click to choose photos or documents</p>
              <p className="text-xs text-muted">Allowed: {ALLOWED_EXT.join(', ')}. Executables are blocked.</p>
            </div>
            <input ref={fileInputRef} type="file" multiple className="sr-only"
                   accept={ALLOWED_EXT.map(e => `.${e}`).join(',')}
                   onChange={e => { validateFiles(e.target.files); e.target.value = '' }} />
            {fileErrors.length > 0 && (
              <ul className="mt-2 space-y-1" role="alert">
                {fileErrors.map(err => (
                  <li key={err} className="flex items-start gap-1.5 text-xs text-danger">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {err}
                  </li>
                ))}
              </ul>
            )}
            {files.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2 text-sm">
                    <span className="truncate">{f.name} <span className="text-xs text-muted">({fileSize(f.size)})</span></span>
                    <button type="button" onClick={() => removeFile(i)} className="text-muted hover:text-danger"
                            aria-label={`Remove ${f.name}`}>
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
            <p className="text-xs text-muted">
              By submitting you confirm the information is true to the best of your knowledge.
            </p>
            <button type="submit" className="btn-primary !px-6" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              {isSubmitting ? 'Submitting…' : 'Submit grievance'}
            </button>
          </div>
        </form>
      </div>

      {/* ============ AI assistant sidebar ============ */}
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start" aria-label="AI assistant">
        <div className="card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden /> AI assistant
          </h2>
          {aiLoading && !ai && <p className="mt-3 flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Analyzing your text…</p>}
          {!aiLoading && !ai && (
            <p className="mt-3 text-sm text-muted">
              Keep writing — once your description is detailed enough (20+ characters), the AI will suggest a
              category, priority and department here, and search for similar complaints.
            </p>
          )}
          {ai && (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-border bg-ice/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Suggested category</p>
                  <AIBadge method={ai.method} />
                </div>
                <p className="mt-1 text-lg font-bold capitalize text-ink">{ai.category}</p>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>Confidence</span><span className="font-semibold text-ink">{pct(ai.confidence)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-border" role="progressbar"
                       aria-valuenow={Math.round(ai.confidence * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <div className={`h-full rounded-full ${ai.confidence >= 0.55 ? 'bg-primary' : 'bg-warning'}`}
                         style={{ width: `${Math.max(4, ai.confidence * 100)}%` }} />
                  </div>
                </div>
                {ai.confidence < 0.55 && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    Low confidence — your case will be reviewed by a human before routing.
                  </p>
                )}
                {ai.top_categories?.length > 1 && (
                  <p className="mt-2 text-xs text-muted">
                    Also considered: {ai.top_categories.slice(1).map(t => `${t.category} (${pct(t.confidence)})`).join(', ')}
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Recommended priority</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <PriorityBadge priority={ai.priority} />
                  <span className="text-xs text-muted">urgency score {ai.urgency_score.toFixed(2)}</span>
                </div>
                <ul className="mt-2 space-y-1">
                  {ai.urgency_factors.map(f => (
                    <li key={f} className="flex items-start gap-1.5 text-xs text-muted">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden /> {f}
                    </li>
                  ))}
                </ul>
              </div>

              {ai.recommended_department && (
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Likely department</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                    <MapPin className="h-4 w-4 text-primary" aria-hidden /> {ai.recommended_department}
                  </p>
                </div>
              )}
              <p className="text-[11px] leading-relaxed text-muted">
                Model {ai.model_version}. Suggestions are advisory; officers make final decisions.
                {ai.priority === 'critical' && ' For life-threatening emergencies call 112 immediately.'}
              </p>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Search className="h-4 w-4 text-primary" aria-hidden /> Similar open complaints
          </h2>
          {dupsLoading && !dups && <p className="mt-3 flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Searching…</p>}
          {!dupsLoading && dups && dups.length === 0 && ai && (
            <p className="mt-3 text-sm text-muted">
              No similar open complaints found — your submission looks unique.
            </p>
          )}
          {!dups && !dupsLoading && (
            <p className="mt-3 text-sm text-muted">Duplicate candidates will appear here as you type.</p>
          )}
          {dups && dups.length > 0 && (
            <div className="mt-3">
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  Similar complaints exist. You can still submit — nothing is auto-rejected — but adding your
                  own details (photos, exact spot) helps staff link them correctly.
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {dups.map(d => (
                  <li key={d.tracking_id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-medium">{d.title}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${d.score >= 0.7 ? 'bg-red-50 text-danger' : d.score >= 0.5 ? 'bg-amber-50 text-warning' : 'bg-ice text-primary'}`}>
                        {pct(d.score)}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted">{d.tracking_id} • {d.status.replace('_', ' ')}{d.location ? ` • ${d.location}` : ''}</p>
                    {d.matched_terms?.length > 0 && (
                      <p className="mt-1.5 flex flex-wrap gap-1">
                        {d.matched_terms.slice(0, 6).map(t => (
                          <span key={t} className="rounded bg-ice px-1.5 py-0.5 text-[10px] font-medium text-primary">{t}</span>
                        ))}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
