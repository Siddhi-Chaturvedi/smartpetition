import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { UserPlus, AlertCircle } from 'lucide-react'
import Logo from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../lib/api'

const schema = z.object({
  fullName: z.string().min(2, 'Full name is required').max(160),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  phone: z.string().max(32).optional().or(z.literal('')),
  password: z.string().min(8, 'At least 8 characters').max(128)
    .regex(/[A-Za-z]/, 'Must contain letters')
    .regex(/\d/, 'Must contain numbers'),
  confirm: z.string(),
}).refine(d => d.password === d.confirm, { message: 'Passwords do not match', path: ['confirm'] })
type FormValues = z.infer<typeof schema>

export default function Register() {
  const { register: doRegister } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (values: FormValues) => {
    setServerError('')
    try {
      await doRegister(values.email, values.fullName, values.password, values.phone)
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : 'Registration failed. Please try again.')
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
          <h1 className="text-xl font-bold text-ink">Create your citizen account</h1>
          <p className="mt-1 text-sm text-muted">Submit grievances and track them to resolution.</p>

          {serverError && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-danger" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="fullName">Full name</label>
              <input id="fullName" autoComplete="name" className="input" placeholder="Priya Sharma"
                     {...register('fullName')} aria-invalid={!!errors.fullName} />
              {errors.fullName && <p className="field-error" role="alert">{errors.fullName.message}</p>}
            </div>
            <div>
              <label className="label" htmlFor="email">Email address</label>
              <input id="email" type="email" autoComplete="email" className="input" placeholder="you@example.com"
                     {...register('email')} aria-invalid={!!errors.email} />
              {errors.email && <p className="field-error" role="alert">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label" htmlFor="phone">Phone <span className="font-normal text-muted">(optional)</span></label>
              <input id="phone" type="tel" autoComplete="tel" className="input" placeholder="+91 98765 43210"
                     {...register('phone')} aria-invalid={!!errors.phone} />
              {errors.phone && <p className="field-error" role="alert">{errors.phone.message}</p>}
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" type="password" autoComplete="new-password" className="input" placeholder="Min 8 chars, letters + numbers"
                     {...register('password')} aria-invalid={!!errors.password} />
              {errors.password && <p className="field-error" role="alert">{errors.password.message}</p>}
            </div>
            <div>
              <label className="label" htmlFor="confirm">Confirm password</label>
              <input id="confirm" type="password" autoComplete="new-password" className="input"
                     {...register('confirm')} aria-invalid={!!errors.confirm} />
              {errors.confirm && <p className="field-error" role="alert">{errors.confirm.message}</p>}
            </div>
            <button type="submit" className="btn-primary w-full !py-3" disabled={isSubmitting}>
              <UserPlus className="h-4 w-4" aria-hidden />
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            Already registered?{' '}
            <Link to="/login" className="font-semibold text-primary hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
