import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react'
import { api, getToken, setToken } from '../lib/api'
import type { User } from '../lib/types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  register: (email: string, fullName: string, password: string, phone?: string) => Promise<User>
  logout: () => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const me = await api.get<User>('/auth/me')
      setUser(me)
    } catch {
      setToken(null)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ access_token: string; user: User }>('/auth/login', { email, password })
    setToken(res.access_token)
    setUser(res.user)
    return res.user
  }, [])

  const register = useCallback(async (email: string, fullName: string, password: string, phone?: string) => {
    const res = await api.post<{ access_token: string; user: User }>('/auth/register', {
      email, full_name: fullName, password, phone: phone || '',
    })
    setToken(res.access_token)
    setUser(res.user)
    return res.user
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh }),
    [user, loading, login, register, logout, refresh],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function homePathFor(user: User | null): string {
  if (!user) return '/'
  switch (user.role) {
    case 'admin': return '/admin'
    case 'officer': return '/officer'
    default: return '/dashboard'
  }
}
