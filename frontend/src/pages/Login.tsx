import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { LogIn, AlertCircle, BrainCircuit, Timer, ShieldCheck, Users, Activity, Database } from 'lucide-react'
import Logo from '../components/Logo'
import { useAuth, homePathFor } from '../context/AuthContext'
import { ApiError, api } from '../lib/api'

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})
type FormValues = z.infer<typeof schema>

interface HealthInfo {
  status: string
  database: string
  ai_model: string
  demo_accounts?: boolean
}

const FEATURES = [
  { icon: BrainCircuit, title: 'AI-assisted triage', text: 'Every grievance is classified, urgency-scored and routed by a trained model — with a human officer always in the loop.' },
  { icon: Timer, title: 'SLA clock & auto-escalation', text: 'A background scheduler watches resolution deadlines around the clock and escalates overdue cases on its own.' },
  { icon: ShieldCheck, title: 'Transparent & audited', text: 'Every status change, override and duplicate link is recorded in a permanent, reviewable audit trail.' },
  { icon: Users, title: 'Three roles, one workflow', text: 'Citizens submit and track; officers resolve; administrators oversee — each with strictly enforced permissions.' },
]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [serverError, setServerError] = useState('')
  const [demoAvailable, setDemoAvailable] = useState(false)
  const [demoBusy, setDemoBusy] = useState('')
  const [health, setHealth] = useState<HealthInfo | null>(null)

  // One-click demo logins + live status chips are offered only when this
  // deployment actually seeds demo accounts (backend /health), never in prod.
  useEffect(() => {
    api.get<HealthInfo>('/health')
      .then(h => { setHealth(h); setDemoAvailable(!!h.demo_accounts) })
      .catch(() => setDemoAvailable(false))
  }, [])

  const demoLogin = async (email: string, password: string) => {
    setServerError('')
    setDemoBusy(email)
    try {
      const user = await login(email, password)
      navigate(homePathFor(user), { replace: true })
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : 'Demo sign-in failed. Please try again.')
    } finally {
      setDemoBusy('')
    }
  }

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (values: FormValues) => {
    setServerError('')
    try {
      const user = await login(values.email, values.password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : homePathFor(user), { replace: true })
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : 'Login failed. Please try again.')
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ------------------------------ brand / info panel ------------------------------ */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-obsidian px-12 py-10 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/15 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-primary/10 blur-3xl" aria-hidden />

        <Link to="/" className="relative flex items-center gap-2.5">
          <Logo className="h-9 w-9" />
          <span className="text-lg font-bold tracking-tight">Smart<span className="text-primary">Petition</span></span>
        </Link>

        <div className="relative max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Automated Grievance Management</p>
          <h1 className="mt-3 text-4xl font-bold leading-tight">
            Every complaint heard, tracked and resolved — <span className="text-primary">with AI in the loop.</span>
          </h1>
          <ul className="mt-8 space-y-5">
            {FEATURES.map(f => (
              <li key={f.title} className="flex gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <f.icon className="h-5 w-5 text-primary" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold">{f.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-white/60">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
            <Activity className={`h-3.5 w-3.5 ${health?.status === 'ok' ? 'text-emerald-400' : 'text-amber-400'}`} aria-hidden />
            API {health ? health.status : '…'}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
            <Database className={`h-3.5 w-3.5 ${health?.database === 'ok' ? 'text-emerald-400' : 'text-amber-400'}`} aria-hidden />
            Database {health ? health.database : '…'}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
            <BrainCircuit className="h-3.5 w-3.5 text-primary" aria-hidden />
            {health ? health.ai_model : 'AI …'}
          </span>
        </div>
      </aside>

      {/* ------------------------------ form panel ------------------------------ */}
      <main className="flex items-center justify-center bg-ice px-4 py-10">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-6 flex items-center justify-center gap-2.5 text-ink lg:hidden">
            <Logo className="h-9 w-9" />
            <span className="text-lg font-bold tracking-tight">Smart<span className="text-primary">Petition</span></span>
          </Link>

          <div className="card p-7 sm:p-8">
            <h2 className="text-2xl font-bold text-ink">Welcome back</h2>
            <p className="mt-1.5 text-sm text-muted">Log in to submit, track and manage grievances.</p>

            {new URLSearchParams(location.search).get('session') === 'expired' && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800" role="status">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Your previous session ended (server restart or expired token). Please sign in again.
              </div>
            )}
            {serverError && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-danger" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {serverError}
              </div>
            )}

            {demoAvailable && (
              <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-3.5 text-xs leading-relaxed text-muted" data-testid="demo-quick-login">
                <p className="font-semibold text-ink">Quick start — one-click demo sign-in</p>
                <div className="mt-2 flex flex-col gap-2">
                  <button type="button" onClick={() => demoLogin('citizen@demo.smartpetition.dev', 'Citizen#123')}
                          disabled={!!demoBusy} className="btn-primary w-full !py-2 text-xs">
                    {demoBusy === 'citizen@demo.smartpetition.dev' ? 'Signing in…' : 'Sign in as Demo Citizen'}
                  </button>
                  <button type="button" onClick={() => demoLogin('officer@demo.smartpetition.dev', 'Officer#123')}
                          disabled={!!demoBusy} className="btn-secondary w-full !py-2 text-xs">
                    {demoBusy === 'officer@demo.smartpetition.dev' ? 'Signing in…' : 'Sign in as Demo Officer'}
                  </button>
                </div>
                <p className="mt-2">Admin: generated at first startup (backend console / FIRST_ADMIN.txt).</p>
              </div>
            )}

            <div className="mt-5 flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-border" aria-hidden />
              or sign in manually
              <span className="h-px flex-1 bg-border" aria-hidden />
            </div>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-4 space-y-4">
              <div>
                <label className="label" htmlFor="email">Email address</label>
                <input id="email" type="email" autoComplete="email" className="input"
                       placeholder="you@example.com" {...register('email')} aria-invalid={!!errors.email} />
                {errors.email && <p className="field-error" role="alert">{errors.email.message}</p>}
              </div>
              <div>
                <label className="label" htmlFor="password">Password</label>
                <input id="password" type="password" autoComplete="current-password" className="input"
                       placeholder="••••••••" {...register('password')} aria-invalid={!!errors.password} />
                {errors.password && <p className="field-error" role="alert">{errors.password.message}</p>}
              </div>
              <button type="submit" className="btn-primary w-full !py-3" disabled={isSubmitting}>
                <LogIn className="h-4 w-4" aria-hidden />
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-muted">
              New citizen?{' '}
              <Link to="/register" className="font-semibold text-primary hover:underline">Create an account</Link>
            </p>
          </div>

          <p className="mt-5 text-center text-xs leading-relaxed text-muted">
            AI recommendations are advisory — every decision is made by an authorized officer.
            <br />
            Protected by rate limiting, hashed credentials and server-side permission checks.
          </p>
        </div>
      </main>
    </div>
  )
}
