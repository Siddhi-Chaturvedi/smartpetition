import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Bell, ChevronDown, LayoutDashboard, ListChecks, LogOut, Menu, PlusCircle,
  Scale, Search, Settings2, ShieldCheck, User as UserIcon, Users, X, Bot, History, Timer, ClipboardList,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type { AppNotification } from '../lib/types'
import { timeAgo } from '../lib/format'
import Logo from './Logo'

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const notifRef = useRef<HTMLDivElement>(null)

  const loadNotifications = async () => {
    if (!user) return
    try {
      const res = await api.get<{ items: AppNotification[]; unread_count: number }>('/notifications?limit=12')
      setNotifications(res.items)
      setUnread(res.unread_count)
    } catch { /* header badge is best-effort */ }
  }

  useEffect(() => {
    void loadNotifications()
    const t = setInterval(loadNotifications, 45_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (!user) return <Outlet />

  const citizenLinks = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/submit', label: 'Submit Grievance', icon: PlusCircle },
    { to: '/grievances', label: 'My Grievances', icon: ListChecks },
  ]
  const officerLinks = [
    { to: '/officer', label: 'My Queue', icon: LayoutDashboard },
    { to: '/grievances', label: 'All Cases', icon: ListChecks },
  ]
  const adminLinks = [
    { to: '/admin', label: 'Analytics', icon: LayoutDashboard },
    { to: '/grievances', label: 'Grievances', icon: ListChecks },
    { to: '/admin/triage', label: 'Triage Queue', icon: ClipboardList },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/departments', label: 'Departments', icon: Settings2 },
    { to: '/admin/ai', label: 'AI Performance', icon: Bot },
    { to: '/admin/sla', label: 'SLA Rules', icon: Timer },
    { to: '/admin/audit', label: 'Audit Logs', icon: History },
  ]
  const links = user.role === 'admin' ? adminLinks : user.role === 'officer' ? officerLinks : citizenLinks
  const home = user.role === 'admin' ? '/admin' : user.role === 'officer' ? '/officer' : '/dashboard'

  const markRead = async (n: AppNotification) => {
    try {
      await api.post(`/notifications/${n.id}/read`)
      setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, is_read: true } : x)))
      setUnread(u => Math.max(0, u - 1))
      if (n.grievance_id) navigate(`/grievances/${n.grievance_id}`)
    } catch { /* ignore */ }
  }

  const markAll = async () => {
    try {
      await api.post('/notifications/read-all')
      setNotifications(prev => prev.map(x => ({ ...x, is_read: true })))
      setUnread(0)
    } catch { /* ignore */ }
  }

  return (
    <div className="min-h-screen bg-page">
      <header className="sticky top-0 z-40 bg-obsidian text-white shadow-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link to={home} className="flex items-center gap-2.5" aria-label="SmartPetition home">
            <Logo className="h-9 w-9" />
            <span className="hidden text-lg font-bold tracking-tight sm:block">
              Smart<span className="text-[#5B9BFF]">Petition</span>
            </span>
          </Link>

          <nav className="ml-4 hidden flex-1 items-center gap-1 lg:flex" aria-label="Main">
            {links.map(l => (
              <NavLink
                key={l.to}
                to={l.to}
                end
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
              >
                <l.icon className="h-4 w-4" aria-hidden />
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            {/* notifications */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifOpen(o => !o)}
                className="relative rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white"
                aria-label={`Notifications (${unread} unread)`}
                aria-expanded={notifOpen}
              >
                <Bell className="h-5 w-5" aria-hidden />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-card border border-border bg-white text-ink shadow-lg sm:w-96">
                  <div className="flex items-center justify-between border-b border-border bg-ice px-4 py-2.5">
                    <p className="text-sm font-semibold">Notifications</p>
                    {unread > 0 && (
                      <button type="button" onClick={markAll} className="text-xs font-medium text-primary hover:underline">
                        Mark all read
                      </button>
                    )}
                  </div>
                  <ul className="max-h-96 divide-y divide-border overflow-y-auto">
                    {notifications.length === 0 && (
                      <li className="px-4 py-8 text-center text-sm text-muted">No notifications yet</li>
                    )}
                    {notifications.map(n => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => markRead(n)}
                          className={`block w-full px-4 py-3 text-left hover:bg-ice ${n.is_read ? 'opacity-60' : ''}`}
                        >
                          <p className="text-sm font-semibold leading-snug">{n.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p>
                          <p className="mt-1 text-[11px] text-muted">{timeAgo(n.created_at)}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* user menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenu(o => !o)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/10"
                aria-label="Account menu"
                aria-expanded={userMenu}
              >
                <span className="hidden max-w-[120px] truncate font-medium sm:block">{user.full_name}</span>
                <ChevronDown className="h-4 w-4 text-slate-300" aria-hidden />
              </button>
              {userMenu && (
                <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-card border border-border bg-white text-ink shadow-lg">
                  <div className="border-b border-border px-4 py-3">
                    <p className="truncate text-sm font-semibold">{user.full_name}</p>
                    <p className="truncate text-xs text-muted">{user.email}</p>
                    <p className="mt-1 inline-flex rounded-full bg-ice px-2 py-0.5 text-[11px] font-semibold uppercase text-primary">
                      {user.role}
                    </p>
                  </div>
                  <Link to="/profile" onClick={() => setUserMenu(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-ice">
                    <UserIcon className="h-4 w-4 text-muted" aria-hidden /> My Profile
                  </Link>
                  <button
                    type="button"
                    onClick={() => { logout(); navigate('/') }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-danger hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" aria-hidden /> Sign out
                  </button>
                </div>
              )}
            </div>

            {/* mobile menu button */}
            <button
              type="button"
              className="rounded-lg p-2 text-slate-300 hover:bg-white/10 lg:hidden"
              onClick={() => setMobileOpen(o => !o)}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="border-t border-white/10 px-4 pb-4 pt-2 lg:hidden" aria-label="Mobile">
            {links.map(l => (
              <NavLink
                key={l.to}
                to={l.to}
                end
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
                    isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5'
                  }`}
              >
                <l.icon className="h-4 w-4" aria-hidden /> {l.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="border-t border-border bg-white py-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 text-xs text-muted sm:flex-row sm:px-6">
          <p className="flex items-center gap-1.5">
            <Scale className="h-3.5 w-3.5" aria-hidden />
            SmartPetition — Automated Grievance Management System
          </p>
          <p className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            AI recommendations are advisory; decisions are made by authorized officers.
          </p>
        </div>
      </footer>
    </div>
  )
}
