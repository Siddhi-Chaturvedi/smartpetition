import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <Compass className="h-12 w-12 text-border" aria-hidden />
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="max-w-sm text-sm text-muted">
        The page you are looking for does not exist or may have been moved.
      </p>
      <Link to="/" className="btn-primary mt-2">Back to home</Link>
    </div>
  )
}
