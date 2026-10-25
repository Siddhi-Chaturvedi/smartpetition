import { LucideIcon } from 'lucide-react'

interface Props {
  label: string
  value: number | string | null | undefined
  icon: LucideIcon
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'primary'
  hint?: string
}

const TONES: Record<string, string> = {
  default: 'bg-ice text-primary',
  primary: 'bg-ice text-primary',
  success: 'bg-emerald-50 text-success',
  warning: 'bg-amber-50 text-warning',
  danger: 'bg-red-50 text-danger',
}

export default function StatCard({ label, value, icon: Icon, tone = 'default', hint }: Props) {
  return (
    <div className="card flex items-start gap-4 p-5 transition-shadow hover:shadow-card-hover">
      <div className={`rounded-lg p-2.5 ${TONES[tone]}`} aria-hidden>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm text-muted">{label}</p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums text-ink">
          {value === null || value === undefined ? '—' : value}
        </p>
        {hint && <p className="mt-0.5 truncate text-xs text-muted">{hint}</p>}
      </div>
    </div>
  )
}
