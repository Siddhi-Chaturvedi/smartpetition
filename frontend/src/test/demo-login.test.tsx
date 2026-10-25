import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import Login from '../pages/Login'
import { AuthProvider } from '../context/AuthContext'

function Probe() {
  const loc = useLocation()
  return <div data-testid="loc">{loc.pathname}</div>
}

const user = {
  id: 2, email: 'citizen@demo.smartpetition.dev', full_name: 'Demo Citizen',
  role: 'citizen', phone: '', is_active: true, created_at: '2026-01-01T00:00:00Z',
}

describe('one-click demo login', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/v1/health')) {
        return new Response(JSON.stringify({
          status: 'ok', version: '1.0.0', database: 'ok', ai_model: 'x',
          time: '2026-01-01T00:00:00Z', demo_accounts: true,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.endsWith('/api/v1/auth/login')) {
        return new Response(JSON.stringify({ access_token: 'tok', token_type: 'bearer', user }),
          { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('', { status: 404 })
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('offers one-click demo buttons when the backend seeds demo accounts, and signs in', async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<Probe />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    )

    const btn = await screen.findByRole('button', { name: /one-click sign in as demo citizen/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(screen.getByTestId('loc').textContent).toBe('/dashboard')
    })
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit?][]
    const loginCall = calls.find(([u]) => String(u).endsWith('/api/v1/auth/login'))
    expect(loginCall).toBeTruthy()
    expect(JSON.parse(String(loginCall![1]?.body))).toMatchObject({ email: 'citizen@demo.smartpetition.dev' })
    expect(localStorage.getItem('smartpetition_token')).toBe('tok')
  })

  it('hides one-click buttons when demo accounts are not seeded (production)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/api/v1/health')) {
        return new Response(JSON.stringify({
          status: 'ok', version: '1.0.0', database: 'ok', ai_model: 'x',
          time: '2026-01-01T00:00:00Z', demo_accounts: false,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('', { status: 404 })
    }))
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<Login />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    )
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 50))
    expect(screen.queryByRole('button', { name: /one-click/i })).toBeNull()
  })
})
