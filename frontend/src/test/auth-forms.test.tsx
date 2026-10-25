import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Register from '../pages/Register'
import Login from '../pages/Login'
import { AuthProvider } from '../context/AuthContext'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderPage(page: React.ReactElement) {
  return render(<MemoryRouter><AuthProvider>{page}</AuthProvider></MemoryRouter>)
}

describe('registration form validation (client-side, zod)', () => {
  it('blocks submit and shows all field errors when empty', async () => {
    const user = userEvent.setup()
    renderPage(<Register />)
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByText('Full name is required')).toBeInTheDocument()
    expect(screen.getByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
    // fetch must NOT have been called for registration
    expect(fetch).not.toHaveBeenCalledWith('/api/v1/auth/register', expect.anything())
  })

  it('rejects weak passwords before hitting the server', async () => {
    const user = userEvent.setup()
    renderPage(<Register />)
    await user.type(screen.getByLabelText(/full name/i), 'Test User')
    await user.type(screen.getByLabelText(/^email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'abcdefgh')
    await user.type(screen.getByLabelText(/confirm password/i), 'abcdefgh')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByText(/must contain numbers/i)).toBeInTheDocument()
  })

  it('rejects mismatched confirmation', async () => {
    const user = userEvent.setup()
    renderPage(<Register />)
    await user.type(screen.getByLabelText(/full name/i), 'Test User')
    await user.type(screen.getByLabelText(/^email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'Passw0rd123')
    await user.type(screen.getByLabelText(/confirm password/i), 'Passw0rd124')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument()
  })

  it('shows the demo account hint box', () => {
    renderPage(<Login />)
    expect(screen.getByText(/development demo accounts/i)).toBeInTheDocument()
    expect(screen.getByText(/citizen@demo\.smartpetition\.dev/i)).toBeInTheDocument()
  })
})

describe('login form', () => {
  it('surfaces backend error messages', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/v1/auth/me') return new Response('', { status: 401 })
      return new Response(JSON.stringify({ detail: 'Incorrect email or password' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      })
    }))
    renderPage(<Login />)
    await user.type(screen.getByLabelText(/email address/i), 'someone@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'WrongPass1')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/incorrect email or password/i)
    })
  })

  it('validates required fields client-side', async () => {
    const user = userEvent.setup()
    renderPage(<Login />)
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
  })
})
