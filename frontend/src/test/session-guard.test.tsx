import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import SessionGuard from '../components/SessionGuard'
import { api, setToken, getToken } from '../lib/api'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="loc">{location.pathname + location.search}</div>
}

describe('session expiry handling', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: 'Not authenticated' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('clears the token and signals the app on a 401 from a protected endpoint', async () => {
    setToken('stale-token')
    const seen: string[] = []
    const listener = () => seen.push('unauthorized')
    window.addEventListener('smartpetition:unauthorized', listener)

    await expect(api.get('/auth/me')).rejects.toMatchObject({ status: 401 })

    expect(getToken()).toBeNull()
    expect(seen).toEqual(['unauthorized'])
    window.removeEventListener('smartpetition:unauthorized', listener)
  })

  it('does NOT signal on login/register 401 (wrong password is a normal form error)', async () => {
    const seen: string[] = []
    const listener = () => seen.push('unauthorized')
    window.addEventListener('smartpetition:unauthorized', listener)

    await expect(api.post('/auth/login', { email: 'a@b.co', password: 'nope' }))
      .rejects.toMatchObject({ status: 401 })

    expect(seen).toEqual([])
    window.removeEventListener('smartpetition:unauthorized', listener)
  })

  it('SessionGuard redirects stranded users to the login page with an explanation', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <SessionGuard />
        <Routes>
          <Route path="/dashboard" element={<div>dashboard</div>} />
          <Route path="/login" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('dashboard')).toBeTruthy()

    window.dispatchEvent(new CustomEvent('smartpetition:unauthorized'))

    await waitFor(() => {
      expect(screen.getByTestId('loc').textContent).toBe('/login?session=expired')
    })
  })
})

describe('token storage resilience', () => {
  it('keeps the session alive when localStorage is blocked (sandboxed iframe)', async () => {
    // Simulate a sandboxed embed: every localStorage touch throws.
    const broken = {
      getItem: () => { throw new DOMException('blocked', 'SecurityError') },
      setItem: () => { throw new DOMException('blocked', 'SecurityError') },
      removeItem: () => { throw new DOMException('blocked', 'SecurityError') },
    }
    vi.stubGlobal('localStorage', broken)

    setToken('in-memory-token')
    expect(getToken()).toBe('in-memory-token')

    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get('Authorization')
      if (auth === 'Bearer in-memory-token') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      return new Response(JSON.stringify({ detail: 'Not authenticated' }), { status: 401 })
    }))
    await expect(api.get('/auth/me')).resolves.toMatchObject({ ok: true })

    vi.unstubAllGlobals()
    setToken(null)
  })
})
