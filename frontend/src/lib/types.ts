export type Role = 'citizen' | 'officer' | 'admin'

export interface User {
  id: number
  email: string
  full_name: string
  role: Role
  department_id: number | null
  phone: string
  is_active: boolean
  email_verified: boolean
  created_at?: string
}

export interface Attachment {
  id: number
  original_filename: string
  content_type: string
  size_bytes: number
  created_at?: string
}

export interface Comment {
  id: number
  author_id: number
  author_name: string
  author_role: string
  body: string
  is_internal: boolean
  created_at?: string
}

export interface StatusHistoryEntry {
  id: number
  from_status: string
  to_status: string
  actor_id: number | null
  actor_name: string
  note: string
  created_at?: string
}

export interface AssignmentEntry {
  id: number
  department_id: number | null
  department_name: string
  officer_id: number | null
  officer_name: string
  reason: string
  is_active: boolean
  created_at?: string
}

export interface AIPrediction {
  id: number
  model_version: string
  method: 'ml_model' | 'fallback_rules'
  predicted_category: string
  confidence: number
  top_categories_json: string
  urgency_score: number
  urgency_level: string
  urgency_factors_json: string
  recommended_department: string
  created_at?: string
}

export interface DuplicateCandidate {
  id: number
  candidate_grievance_id: number
  candidate_tracking_id: string
  candidate_title: string
  candidate_status: string
  candidate_location: string
  candidate_submitted_at?: string
  score: number
  method: string
  matched_terms: string
  review_status: 'pending' | 'confirmed_duplicate' | 'dismissed'
}

export interface Feedback {
  id: number
  rating: number
  comments: string
  created_at?: string
}

export interface Grievance {
  id: number
  tracking_id: string
  title: string
  description: string
  status: string
  priority: string
  priority_override_reason: string
  location: string
  jurisdiction: string
  address: string
  latitude: number | null
  longitude: number | null
  category_id: number | null
  category_name: string
  selected_category_id: number | null
  department_id: number | null
  department_name: string
  assignee_id: number | null
  assignee_name: string
  citizen_id: number
  citizen_name: string
  ai_analysis_status: string
  needs_triage: boolean
  is_demo_data: boolean
  submitted_at?: string
  assigned_at?: string
  due_at?: string
  resolved_at?: string
  closed_at?: string
  resolution_summary: string
  rejection_reason: string
  reopen_count: number
  attachments: Attachment[]
  is_overdue: boolean
}

export interface GrievanceDetail extends Grievance {
  comments: Comment[]
  history: StatusHistoryEntry[]
  assignments: AssignmentEntry[]
  ai_predictions: AIPrediction[]
  duplicate_candidates: DuplicateCandidate[]
  feedback: Feedback | null
}

export interface GrievanceList {
  items: Grievance[]
  total: number
  page: number
  page_size: number
}

export interface Department {
  id: number
  name: string
  description: string
  jurisdictions: string
  is_active: boolean
}

export interface Category {
  id: number
  name: string
  department_id: number | null
  sla_resolution_hours: number
  is_active: boolean
}

export interface AppNotification {
  id: number
  type: string
  title: string
  body: string
  grievance_id: number | null
  grievance_tracking_id: string
  is_read: boolean
  created_at?: string
}

export interface ClassifyResult {
  category: string
  confidence: number
  top_categories: { category: string; confidence: number }[]
  method: 'ml_model' | 'fallback_rules'
  model_version: string
  priority: string
  urgency_score: number
  urgency_factors: string[]
  recommended_department: string
}

export interface DuplicatePreviewItem {
  tracking_id: string
  title: string
  status: string
  location: string
  submitted_at?: string
  score: number
  method: string
  matched_terms: string[]
}

export interface SummaryStats {
  total: number
  pending: number
  in_progress: number
  resolved: number
  closed: number
  rejected: number
  critical_open: number
  overdue: number
  reopened: number
  needs_triage: number
  avg_resolution_hours: number | null
  median_resolution_hours: number | null
  sla_compliance_pct: number | null
  feedback_count: number
  feedback_avg_rating: number | null
  by_status: Record<string, number>
}

export interface CitizenStats {
  total: number
  pending: number
  in_progress: number
  resolved: number
  closed: number
  rejected: number
  by_status: Record<string, number>
}

export interface AuditLogEntry {
  id: number
  actor_id: number | null
  actor_name: string
  action: string
  entity_type: string
  entity_id: number | null
  detail: string
  ip_address: string
  created_at?: string
}

export interface SLARule {
  id: number
  scope: string
  scope_value: string
  resolution_hours: number
  escalation_hours: number
  is_active: boolean
}
