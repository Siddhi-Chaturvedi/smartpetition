import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth, homePathFor } from './context/AuthContext'
import AppLayout from './components/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Profile from './pages/Profile'
import CitizenDashboard from './pages/citizen/Dashboard'
import SubmitGrievance from './pages/citizen/SubmitGrievance'
import GrievanceDetailPage from './pages/GrievanceDetailPage'
import GrievanceListPage from './pages/GrievanceListPage'
import OfficerDashboard from './pages/officer/Dashboard'
import AdminDashboard from './pages/admin/Dashboard'
import AdminUsers from './pages/admin/Users'
import AdminDepartments from './pages/admin/Departments'
import AdminAI from './pages/admin/AIPerformance'
import AdminAudit from './pages/admin/AuditLogs'
import AdminSLA from './pages/admin/SLARules'
import AdminTriage from './pages/admin/TriageQueue'
import NotFound from './pages/NotFound'

function HomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-10 text-center text-muted">Loading…</div>
  return <Navigate to={user ? homePathFor(user) : '/'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<AppLayout />}>
        <Route path="/home" element={<HomeRedirect />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/profile" element={<Profile />} />
          <Route path="/grievances" element={<GrievanceListPage />} />
          <Route path="/grievances/:id" element={<GrievanceDetailPage />} />
        </Route>

        <Route element={<ProtectedRoute roles={['citizen']} />}>
          <Route path="/dashboard" element={<CitizenDashboard />} />
          <Route path="/submit" element={<SubmitGrievance />} />
        </Route>

        <Route element={<ProtectedRoute roles={['officer', 'admin']} />}>
          <Route path="/officer" element={<OfficerDashboard />} />
        </Route>

        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/departments" element={<AdminDepartments />} />
          <Route path="/admin/ai" element={<AdminAI />} />
          <Route path="/admin/audit" element={<AdminAudit />} />
          <Route path="/admin/sla" element={<AdminSLA />} />
          <Route path="/admin/triage" element={<AdminTriage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
