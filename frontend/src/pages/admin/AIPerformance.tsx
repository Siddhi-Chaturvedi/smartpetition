import { useEffect, useState } from 'react'
import { Bot, FlaskConical, RefreshCw, TriangleAlert } from 'lucide-react'
import { api } from '../../lib/api'
import { ErrorState, Spinner } from '../../components/States'

interface ModelInfo {
  available: boolean
  version: string
  method: string
  categories: string[]
  confidence_threshold: number
  dataset_note: string
}

interface Evaluation {
  model_version?: string
  n_test?: number
  accuracy?: number
  macro_f1?: number
  per_class?: Record<string, { precision: number; recall: number; f1: number; support: number }>
  confusion_matrix?: { labels: string[]; matrix: number[][] }
  caveat?: string
  duplicate_detection?: { precision: number; recall: number; f1: number; tp: number; fp: number; fn: number; tn: number; threshold: number }
}

export default function AdminAI() {
  const [info, setInfo] = useState<ModelInfo | null>(null)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [evalError, setEvalError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<ModelInfo>('/ai/model-info').then(setInfo).catch(() => setInfo(null)),
      api.get<Evaluation>('/ai/evaluation').then(d => { setEvaluation(d); setEvalError('') })
        .catch(e => setEvalError(e instanceof Error ? e.message : 'Evaluation unavailable')),
    ]).finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner label="Loading AI report…" />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Bot className="h-6 w-6 text-primary" aria-hidden /> AI Model Performance</h1>
        <p className="mt-1 text-sm text-muted">
          Transparency report for the classification, urgency and duplicate-detection components.
        </p>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Model status</h2>
        {info ? (
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Info label="State" value={info.available ? 'Trained model active' : 'Rule-based FALLBACK (no trained model)'}
                  tone={info.available ? 'ok' : 'warn'} />
            <Info label="Version" value={info.version} mono />
            <Info label="Pipeline" value={info.method} />
            <Info label="Confidence threshold" value={String(info.confidence_threshold)} />
          </div>
        ) : <p className="mt-2 text-sm text-muted">Model info unavailable.</p>}
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs leading-relaxed text-warning">
          <TriangleAlert className="mr-1.5 inline h-4 w-4" aria-hidden />
          <strong>Data provenance:</strong> {info?.dataset_note}
        </div>
      </section>

      {evalError ? (
        <section className="card p-5">
          <p className="text-sm text-muted">
            {evalError}. Generate it from the backend folder: <code className="rounded bg-ice px-1.5 py-0.5 font-mono text-xs">python -m app.ai.evaluate_model</code>
          </p>
        </section>
      ) : evaluation ? (
        <>
          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
              <FlaskConical className="h-4 w-4" aria-hidden /> Classifier evaluation (held-out test split)
            </h2>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <Info label="Accuracy" value={evaluation.accuracy != null ? `${(evaluation.accuracy * 100).toFixed(1)}%` : '—'} />
              <Info label="Macro F1" value={evaluation.macro_f1 != null ? `${(evaluation.macro_f1 * 100).toFixed(1)}%` : '—'} />
              <Info label="Test samples" value={String(evaluation.n_test ?? '—')} />
            </div>

            {evaluation.per_class && (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[520px] divide-y divide-border">
                  <thead className="bg-ice">
                    <tr>
                      <th className="th">Category</th><th className="th">Precision</th>
                      <th className="th">Recall</th><th className="th">F1</th><th className="th">Support</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-white">
                    {Object.entries(evaluation.per_class).map(([cls, m]) => (
                      <tr key={cls}>
                        <td className="td font-medium capitalize">{cls}</td>
                        <td className="td">{(m.precision * 100).toFixed(1)}%</td>
                        <td className="td">{(m.recall * 100).toFixed(1)}%</td>
                        <td className="td">{(m.f1 * 100).toFixed(1)}%</td>
                        <td className="td text-muted">{m.support}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {evaluation.confusion_matrix && <ConfusionMatrix cm={evaluation.confusion_matrix} />}
            {evaluation.caveat && (
              <p className="mt-4 text-xs italic text-muted">{evaluation.caveat}</p>
            )}
          </section>

          {evaluation.duplicate_detection && (
            <section className="card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Duplicate detection (labeled pair set)</h2>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4 lg:grid-cols-7">
                <Info label="Precision" value={`${(evaluation.duplicate_detection.precision * 100).toFixed(0)}%`} />
                <Info label="Recall" value={`${(evaluation.duplicate_detection.recall * 100).toFixed(0)}%`} />
                <Info label="F1" value={evaluation.duplicate_detection.f1.toFixed(2)} />
                <Info label="TP" value={String(evaluation.duplicate_detection.tp)} />
                <Info label="FP" value={String(evaluation.duplicate_detection.fp)} />
                <Info label="FN" value={String(evaluation.duplicate_detection.fn)} />
                <Info label="Threshold" value={String(evaluation.duplicate_detection.threshold)} />
              </div>
              <p className="mt-3 text-xs text-muted">
                Evaluated on a small labeled set of paraphrase/dissimilar pairs (see backend/app/ai/evaluate_model.py).
                Candidates are never auto-rejected; staff confirm or dismiss each match.
              </p>
            </section>
          )}
        </>
      ) : null}
    </div>
  )
}

function Info({ label, value, tone, mono }: { label: string; value: string; tone?: 'ok' | 'warn'; mono?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-border bg-ice/50'}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 font-semibold ${tone === 'warn' ? 'text-warning' : ''} ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
    </div>
  )
}

function ConfusionMatrix({ cm }: { cm: { labels: string[]; matrix: number[][] } }) {
  const max = Math.max(1, ...cm.matrix.flat())
  return (
    <div className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Confusion matrix (rows = true, cols = predicted)</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th />
              {cm.labels.map(l => <th key={l} className="px-1 pb-1 font-semibold capitalize text-muted">{l.split(' ')[0]}</th>)}
            </tr>
          </thead>
          <tbody>
            {cm.matrix.map((row, i) => (
              <tr key={i}>
                <td className="pr-2 text-right font-semibold capitalize text-muted">{cm.labels[i]}</td>
                {row.map((v, j) => (
                  <td key={j}
                      className={`h-9 w-9 rounded text-center font-semibold ${i === j ? 'bg-primary/15 text-primary' : v > 0 ? 'bg-red-50 text-danger' : 'bg-ice/40 text-muted'}`}
                      style={i === j ? { opacity: 0.4 + 0.6 * (v / max) } : undefined}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
