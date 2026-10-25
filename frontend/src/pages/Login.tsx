import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { LogIn, AlertCircle } from 'lucide-react'
import Logo from '../components/Logo'
import { useAuth, homePathFor } from '../context/AuthContext'
import { ApiError } from '../lib/api'

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

          {serverError && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-danger" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
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
          <div className="mt-6 rounded-lg bg-ice p-3.5 text-xs leading-relaxed text-muted">
            <p className="font-semibold text-ink">Development demo accounts</p>
            <p className="mt-1">citizen@demo.smartpetition.dev / Citizen#123</p>
            <p>officer@demo.smartpetition.dev / Officer#123</p>
            <p>Admin credentials are generated at first startup (see backend console / FIRST_ADMIN.txt).</p>
          </div>
        </div>
      </div>
    </div>
  )
}
