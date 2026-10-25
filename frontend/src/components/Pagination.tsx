import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}

export default function Pagination({ page, pageSize, total, onChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  return (
    <nav className="flex items-center justify-between border-t border-border px-4 py-3" aria-label="Pagination">
      <p className="text-xs text-muted">
        Showing <span className="font-semibold text-ink">{Math.min((page - 1) * pageSize + 1, total)}</span>
        –<span className="font-semibold text-ink">{Math.min(page * pageSize, total)}</span> of{' '}
        <span className="font-semibold text-ink">{total}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="btn-secondary !px-2.5 !py-1.5"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-2 text-xs font-medium text-muted">
          Page {page} / {pages}
        </span>
        <button
          type="button"
          className="btn-secondary !px-2.5 !py-1.5"
          onClick={() => onChange(page + 1)}
          disabled={page >= pages}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  )
}
