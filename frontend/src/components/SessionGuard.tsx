import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Listens for global 401 ("session died") events from the API client and
 * redirects to the login page with an explanatory flag, so the user is never
 * stranded on a "Not authenticated" error screen.
 */
export default function SessionGuard() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const onUnauthorized = () => {
      if (location.pathname === '/login' || location.pathname === '/register') return
      navigate('/login?session=expired', { replace: true })
    }
    window.addEventListener('smartpetition:unauthorized', onUnauthorized)
    return () => window.removeEventListener('smartpetition:unauthorized', onUnauthorized)
  }, [navigate, location.pathname])

  return null
}
