import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import Login from '../pages/Login'
import { AuthProvider } from '../context/AuthContext'

function Probe() {
  const loc = useLocation()
  return <div data-testid="loc">{loc.pathname}</div>
}

const DEMO = {
  citizen: { email: 'citizen@smartpetition.local', password: 'CitizenDemo@123', path: '/dashboard' },
  officer: { email: 'officer@smartpetition.local', password: 'OfficerDemo@123', path: '/officer' },
  admin: { email: 'admin@smartpetition.local', password: 'AdminDemo@123', path: '/admin' },
}

function userFor(role: keyof typeof DEMO) {
  return {
    id: role === 'citizen' ? 10 : role === 'officer' ? 11 : 12,
    email: DEMO[role].email, full_name: `Demo ${role}`, role,
    phone: '', is_active: true, created_at: '2026-01-01T00:00:00Z',
  }
}

function stubFetch(opts: { health?: boolean; loginRole?: keyof typeof DEMO | 'fail' } = {}) {
  const { health = true, loginRole } = opts
  return vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.endsWith('/api/v1/health')) {
      return new Response(JSON.stringify({
        status: 'ok', version: '1.0.0', database: 'ok', ai_model: 'x',
        time: '2026-01-01T00:00:00Z', demo_accounts: health,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if (u.endsWith('/api/v1/auth/login')) {
      if (loginRole === 'fail') {
        return new Response(JSON.stringify({ detail: 'Incorrect email or password' }), { status: 401 })
      }
      const body = JSON.parse(String(init?.body)) as { email: string }
      const role = (Object.keys(DEMO) as (keyof typeof DEMO)[]).find(r => DEMO[r].email === body.email)
      if (!role) return new Response(JSON.stringify({ detail: 'Incorrect email or password' }), { status: 401 })
      return new Response(JSON.stringify({ access_token: 'tok-' + role, token_type: 'bearer', user: userFor(role) }),
        { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response('', { status: 404 })
  })
}

function renderLogin() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Probe />} />
          <Route path="/officer" element={<Probe />} />
          <Route path="/admin" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe('one-click demo login', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('offers demo buttons when the backend seeds demo accounts, and signs in as citizen', async () => {
    vi.stubGlobal('fetch', stubFetch({ loginRole: 'citizen' }))
    renderLogin()

    const btn = await screen.findByRole('button', { name: /sign in as demo citizen/i })
    fireEvent.click(btn)

    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/dashboard'))
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit?][]
    const loginCall = calls.find(([u]) => String(u).endsWith('/api/v1/auth/login'))
    expect(loginCall).toBeTruthy()
    expect(JSON.parse(String(loginCall![1]?.body))).toMatchObject({
      email: 'citizen@smartpetition.local', password: 'CitizenDemo@123',
    })
    expect(localStorage.getItem('smartpetition_token') ?? 'mem').toBeTruthy()
  })

  it.each([
    ['officer', /sign in as demo officer/i, '/officer'],
    ['admin', /sign in as demo admin/i, '/admin'],
  ] as [keyof typeof DEMO, RegExp, string][])('redirects %s to their own dashboard', async (_role, name, path) => {
    vi.stubGlobal('fetch', stubFetch({ loginRole: _role }))
    renderLogin()
    fireEvent.click(await screen.findByRole('button', { name }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe(path))
  })

  it('shows a clear error when demo credentials are rejected (account not seeded)', async () => {
    vi.stubGlobal('fetch', stubFetch({ loginRole: 'fail' }))
    renderLogin()
    fireEvent.click(await screen.findByRole('button', { name: /sign in as demo citizen/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect email or password/i)
    expect(screen.queryByTestId('loc')).toBeNull() // no navigation on failure
  })

  it('hides one-click buttons when demo accounts are not seeded (production)', async () => {
    vi.stubGlobal('fetch', stubFetch({ health: false }))
    renderLogin()
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 50))
    expect(screen.queryByRole('button', { name: /sign in as demo (citizen|officer|admin)/i })).toBeNull()
  })
})

describe('login resilience', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('retries automatically when the server is momentarily unreachable (status 0)', async () => {
    let loginAttempts = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url)
      if (u.endsWith('/api/v1/health')) {
        return new Response(JSON.stringify({
          status: 'ok', version: '1.0.0', database: 'ok', ai_model: 'x',
          time: '2026-01-01T00:00:00Z', demo_accounts: true,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (u.endsWith('/api/v1/auth/login')) {
        loginAttempts += 1
        if (loginAttempts === 1) throw new TypeError('Failed to fetch') // server down
        return new Response(JSON.stringify({ access_token: 'tok2', token_type: 'bearer', user: userFor('citizen') }),
          { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('', { status: 404 })
    }))

    renderLogin()
    fireEvent.click(await screen.findByRole('button', { name: /sign in as demo citizen/i }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/dashboard'), { timeout: 15000 })
    expect(loginAttempts).toBe(2) // failed once, retried, succeeded
  })
})
