import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { LogIn, AlertCircle } from 'lucide-react'
import Logo from '../components/Logo'
import { useAuth, homePathFor } from '../context/AuthContext'
import { ApiError, api } from '../lib/api'

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})
type FormValues = z.infer<typeof schema>

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [serverError, setServerError] = useState('')
  const [demoAvailable, setDemoAvailable] = useState(false)
  const [demoBusy, setDemoBusy] = useState('')

  // One-click demo logins are offered only when this deployment actually
  // seeded demo accounts (backend reports it via /health), never in prod.
  useEffect(() => {
    api.get<{ demo_accounts?: boolean }>('/health')
      .then(h => setDemoAvailable(!!h.demo_accounts))
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
    <div className="flex min-h-screen items-center justify-center bg-obsidian px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2.5 text-white">
          <Logo className="h-10 w-10" />
          <span className="text-xl font-bold">Smart<span className="text-[#5B9BFF]">Petition</span></span>
        </Link>
        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <h1 className="text-xl font-bold text-ink">Welcome back</h1>
          <p className="mt-1 text-sm text-muted">Log in to submit, track and manage grievances.</p>

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
            <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-3.5 text-xs leading-relaxed text-muted" data-testid="demo-quick-login">
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
          <div className="mt-6 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" aria-hidden />
            or sign in manually
            <span className="h-px flex-1 bg-border" aria-hidden />
          </div>
          <div className="rounded-lg bg-ice p-3.5 text-xs leading-relaxed text-muted sr-only">
            <p className="font-semibold text-ink">Development demo accounts</p>
            <p className="mt-1">citizen@demo.smartpetition.dev / Citizen#123</p>
            <p>officer@demo.smartpetition.dev / Officer#123</p>
            <p>Admin credentials are generated at first startup (see backend console / FIRST_ADMIN.txt).</p>
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
      </div>
    </div>
  )
}
