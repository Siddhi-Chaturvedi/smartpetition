import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { KeyRound, Save, UserCog } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api, ApiError } from '../lib/api'
import type { User } from '../lib/types'
import { formatDate } from '../lib/format'

const profileSchema = z.object({
  full_name: z.string().min(2, 'Name is required').max(160),
  phone: z.string().max(32).optional().or(z.literal('')),
})

const passwordSchema = z.object({
  current_password: z.string().min(1, 'Required'),
  new_password: z.string().min(8, 'At least 8 characters')
    .regex(/[A-Za-z]/, 'Must contain letters').regex(/\d/, 'Must contain numbers'),
  confirm: z.string(),
}).refine(d => d.new_password === d.confirm, { message: 'Passwords do not match', path: ['confirm'] })

export default function Profile() {
  const { user, refresh } = useAuth()
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    values: { full_name: user?.full_name ?? '', phone: user?.phone ?? '' },
  })
  const pwForm = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema) })

  const saveProfile = async (values: z.infer<typeof profileSchema>) => {
    setProfileMsg(null)
    try {
      await api.patch<User>('/auth/me', values)
      await refresh()
      setProfileMsg({ ok: true, text: 'Profile updated.' })
    } catch (e) {
      setProfileMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Update failed' })
    }
  }

  const changePassword = async (values: z.infer<typeof passwordSchema>) => {
    setPwMsg(null)
    try {
      await api.post('/auth/change-password', {
        current_password: values.current_password, new_password: values.new_password,
      })
      pwForm.reset()
      setPwMsg({ ok: true, text: 'Password changed successfully.' })
    } catch (e) {
      setPwMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Could not change password' })
    }
  }

  if (!user) return null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Profile</h1>
        <p className="mt-1 text-sm text-muted">
          Member since {formatDate(user.created_at)} • Role:{' '}
          <span className="font-semibold capitalize text-ink">{user.role}</span>
        </p>
      </div>

      <section className="card p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold"><UserCog className="h-4 w-4 text-primary" aria-hidden /> Personal details</h2>
        <form onSubmit={profileForm.handleSubmit(saveProfile)} noValidate className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="p-name">Full name</label>
            <input id="p-name" className="input" {...profileForm.register('full_name')} />
            {profileForm.formState.errors.full_name && (
              <p className="field-error" role="alert">{profileForm.formState.errors.full_name.message}</p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="p-email">Email <span className="font-normal text-muted">(cannot be changed)</span></label>
            <input id="p-email" className="input bg-slate-50" value={user.email} disabled />
          </div>
          <div>
            <label className="label" htmlFor="p-phone">Phone</label>
            <input id="p-phone" className="input" {...profileForm.register('phone')} />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-primary" disabled={profileForm.formState.isSubmitting}>
              <Save className="h-4 w-4" aria-hidden />
              {profileForm.formState.isSubmitting ? 'Saving…' : 'Save changes'}
            </button>
          </div>
          {profileMsg && (
            <p className={`sm:col-span-2 text-sm ${profileMsg.ok ? 'text-success' : 'text-danger'}`} role="status">{profileMsg.text}</p>
          )}
        </form>
      </section>

      <section className="card p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold"><KeyRound className="h-4 w-4 text-primary" aria-hidden /> Change password</h2>
        <form onSubmit={pwForm.handleSubmit(changePassword)} noValidate className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="pw-current">Current password</label>
            <input id="pw-current" type="password" className="input" autoComplete="current-password"
                   {...pwForm.register('current_password')} />
            {pwForm.formState.errors.current_password && <p className="field-error" role="alert">{pwForm.formState.errors.current_password.message}</p>}
          </div>
          <div>
            <label className="label" htmlFor="pw-new">New password</label>
            <input id="pw-new" type="password" className="input" autoComplete="new-password"
                   {...pwForm.register('new_password')} />
            {pwForm.formState.errors.new_password && <p className="field-error" role="alert">{pwForm.formState.errors.new_password.message}</p>}
          </div>
          <div>
            <label className="label" htmlFor="pw-confirm">Confirm new</label>
            <input id="pw-confirm" type="password" className="input" autoComplete="new-password"
                   {...pwForm.register('confirm')} />
            {pwForm.formState.errors.confirm && <p className="field-error" role="alert">{pwForm.formState.errors.confirm.message}</p>}
          </div>
          <div className="sm:col-span-3 flex items-center gap-4">
            <button type="submit" className="btn-primary" disabled={pwForm.formState.isSubmitting}>
              {pwForm.formState.isSubmitting ? 'Changing…' : 'Change password'}
            </button>
            {pwMsg && <p className={`text-sm ${pwMsg.ok ? 'text-success' : 'text-danger'}`} role="status">{pwMsg.text}</p>}
          </div>
        </form>
      </section>
    </div>
  )
}
