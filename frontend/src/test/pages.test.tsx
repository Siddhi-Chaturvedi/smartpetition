import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SubmitGrievance from '../pages/citizen/SubmitGrievance'
import CitizenDashboard from '../pages/citizen/Dashboard'
import { AuthProvider } from '../context/AuthContext'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  localStorage.setItem('smartpetition_token', 'test-token')
})
afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

function renderPage(page: React.ReactElement) {
  return render(<MemoryRouter><AuthProvider>{page}</AuthProvider></MemoryRouter>)
}

describe('grievance submission form validation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/categories')) return jsonResponse([])
      if (String(url).includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'c@example.com', full_name: 'C', role: 'citizen', department_id: null, phone: '', is_active: true, email_verified: true })
      }
      return jsonResponse({ detail: 'not expected' }, 400)
    }))
  })

  it('shows required-field errors and does not submit', async () => {
    const user = userEvent.setup()
    renderPage(<SubmitGrievance />)
    await user.click(screen.getByRole('button', { name: /submit grievance/i }))
    expect(await screen.findByText(/title must be at least 5 characters/i)).toBeInTheDocument()
    expect(screen.getByText(/at least 20 characters/i)).toBeInTheDocument()
    // POST /grievances must never have been attempted
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls.map(c => String(c[0]))
    expect(calls.some(u => u.endsWith('/grievances') )).toBe(false)
  })

  it('shows the AI assistant placeholder before enough text is typed', () => {
    renderPage(<SubmitGrievance />)
    expect(screen.getByText(/keep writing/i)).toBeInTheDocument()
    expect(screen.getByText(/duplicate candidates will appear here/i)).toBeInTheDocument()
  })
})

describe('citizen dashboard states', () => {
  it('shows an error state with retry when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'c@example.com', full_name: 'C', role: 'citizen', department_id: null, phone: '', is_active: true, email_verified: true })
      }
      return jsonResponse({ detail: 'Internal server error' }, 500)
    }))
    renderPage(<CitizenDashboard />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('renders stats and empty state when there are no grievances', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/auth/me')) {
        return jsonResponse({ id: 1, email: 'c@example.com', full_name: 'C', role: 'citizen', department_id: null, phone: '', is_active: true, email_verified: true })
      }
      if (String(url).includes('/analytics/my-stats')) {
        return jsonResponse({ total: 0, pending: 0, in_progress: 0, resolved: 0, closed: 0, rejected: 0, by_status: {} })
      }
      if (String(url).includes('/grievances')) {
        return jsonResponse({ items: [], total: 0, page: 1, page_size: 8 })
      }
      return jsonResponse({}, 404)
    }))
    renderPage(<CitizenDashboard />)
    expect(await screen.findByText('Total grievances')).toBeInTheDocument()
    expect(await screen.findByText('No grievances yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /submit grievance/i })).toBeInTheDocument()
  })
})
