import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge, PriorityBadge, AIBadge, DemoBadge } from '../components/Badges'
import StatCard from '../components/StatCard'
import { EmptyState, ErrorState, Spinner } from '../components/States'
import { ListChecks } from 'lucide-react'

describe('badges', () => {
  it('renders readable status labels', () => {
    render(<StatusBadge status="under_review" />)
    expect(screen.getByText('Under Review')).toBeInTheDocument()
    expect(screen.getByLabelText('Status: Under Review')).toBeInTheDocument()
  })

  it('renders priority labels', () => {
    render(<PriorityBadge priority="critical" />)
    expect(screen.getByText('Critical')).toBeInTheDocument()
  })

  it('distinguishes ML model from rule fallback honestly', () => {
    const { rerender } = render(<AIBadge method="ml_model" />)
    expect(screen.getByText('AI Model')).toBeInTheDocument()
    rerender(<AIBadge method="fallback_rules" />)
    expect(screen.getByText('Rule Fallback')).toBeInTheDocument()
  })

  it('marks demo data', () => {
    render(<DemoBadge />)
    expect(screen.getByText(/demo data/i)).toBeInTheDocument()
  })
})

describe('state components', () => {
  it('StatCard shows label and value', () => {
    render(<StatCard label="Total grievances" value={42} icon={ListChecks} />)
    expect(screen.getByText('Total grievances')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('StatCard shows em dash for null', () => {
    render(<StatCard label="Median" value={null} icon={ListChecks} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('EmptyState shows title and hint', () => {
    render(<EmptyState title="No grievances yet" hint="Submit your first one." />)
    expect(screen.getByText('No grievances yet')).toBeInTheDocument()
    expect(screen.getByText('Submit your first one.')).toBeInTheDocument()
  })

  it('ErrorState is an alert with retry', () => {
    let clicked = false
    render(<ErrorState message="Server down" onRetry={() => { clicked = true }} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Server down')
    screen.getByText('Try again').click()
    expect(clicked).toBe(true)
  })

  it('Spinner has status role', () => {
    render(<Spinner label="Loading data…" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading data…')
  })
})
