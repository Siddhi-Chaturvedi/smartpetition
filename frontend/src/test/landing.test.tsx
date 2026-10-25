import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Landing from '../pages/Landing'
import { AuthProvider } from '../context/AuthContext'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
})

function renderLanding() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Landing />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('public landing page', () => {
  it('renders brand, hero and primary CTAs', () => {
    renderLanding()
    expect(screen.getAllByText(/SmartPetition/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/understood/i)
    expect(screen.getByRole('link', { name: /submit a grievance/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /track a grievance/i })).toBeInTheDocument()
  })

  it('renders all six feature cards', () => {
    renderLanding()
    for (const title of [
      'AI Category & Priority Suggestions', 'Duplicate Detection', 'Automatic Department Routing',
      'SLA Deadlines & Escalation', 'Operational Analytics', 'Transparent Tracking',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
  })

  it('renders complaint categories including all civic domains', () => {
    renderLanding()
    for (const cat of ['Roads', 'Water Supply', 'Electricity', 'Sanitation', 'Transport', 'Education', 'Healthcare']) {
      expect(screen.getByRole('heading', { name: cat })).toBeInTheDocument()
    }
  })

  it('FAQ accordion expands on click', async () => {
    const user = userEvent.setup()
    renderLanding()
    // first FAQ is open by default; verify a collapsed one expands on click
    const question = screen.getByRole('button', { name: /is the ai making the final decision/i })
    expect(question).toHaveAttribute('aria-expanded', 'false')
    await user.click(question)
    expect(question).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText(/authorized officers and administrators make all binding decisions/i)).toBeInTheDocument()
  })

  it('includes emergency disclaimer (not a replacement for emergency services)', () => {
    renderLanding()
    expect(screen.getByText(/SmartPetition is not an emergency service/i)).toBeInTheDocument()
  })
})
