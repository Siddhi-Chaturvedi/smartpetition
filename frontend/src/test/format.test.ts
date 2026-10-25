import { describe, expect, it } from 'vitest'
import { formatDate, hoursLeft, timeAgo, fileSize, STATUS_LABELS } from '../lib/format'

describe('format helpers', () => {
  it('formatDate handles null/invalid gracefully', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('not-a-date')).toBe('—')
    expect(formatDate('2026-01-15T10:30:00Z')).not.toBe('—')
  })

  it('timeAgo renders relative times', () => {
    const now = Date.now()
    expect(timeAgo(new Date(now - 30_000).toISOString())).toMatch(/s ago/)
    expect(timeAgo(new Date(now - 5 * 60_000).toISOString())).toMatch(/m ago/)
    expect(timeAgo(new Date(now - 3 * 3_600_000).toISOString())).toMatch(/h ago/)
    expect(timeAgo(new Date(now - 5 * 86_400_000).toISOString())).toMatch(/d ago/)
  })

  it('hoursLeft detects overdue vs remaining', () => {
    const future = new Date(Date.now() + 5 * 3_600_000).toISOString()
    const past = new Date(Date.now() - 5 * 3_600_000).toISOString()
    expect(hoursLeft(future)).toMatchObject({ overdue: false, text: '5h left' })
    expect(hoursLeft(past)).toMatchObject({ overdue: true, text: '5h overdue' })
    expect(hoursLeft(null)).toBeNull()
  })

  it('fileSize formats bytes', () => {
    expect(fileSize(512)).toBe('512 B')
    expect(fileSize(2048)).toBe('2.0 KB')
    expect(fileSize(3 * 1024 * 1024)).toBe('3.0 MB')
  })

  it('status labels cover every workflow state', () => {
    for (const s of ['submitted', 'under_review', 'in_progress', 'escalated', 'resolved', 'closed', 'reopened', 'rejected']) {
      expect(STATUS_LABELS[s]).toBeTruthy()
    }
  })
})
