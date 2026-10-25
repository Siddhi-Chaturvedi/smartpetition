/**
 * API client — talks to the FastAPI backend through the Vite dev-server proxy
 * (relative URLs only; never hard-codes localhost so it works behind proxies).
 */
const BASE = '/api/v1'
const TOKEN_KEY = 'smartpetition_token'

// In-memory token mirror: the primary store. localStorage is only a
// best-effort persistence layer because some embed contexts (sandboxed
// iframes, locked-down browsers) block or partition it — without this,
// login succeeds but every next request goes out unauthenticated.
let memoryToken: string | null = null
try {
  memoryToken = localStorage.getItem(TOKEN_KEY)
} catch {
  memoryToken = null
}

export class ApiError extends Error {
  status: number
  errors?: { field: string; message: string }[]
  constructor(status: number, message: string, errors?: { field: string; message: string }[]) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

export function getToken(): string | null {
  if (memoryToken) return memoryToken
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null // storage blocked (e.g. sandboxed iframe) — memory-only session
  }
}
export function setToken(token: string | null) {
  memoryToken = token
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // localStorage unavailable (sandboxed iframe / private mode): keep the
    // session in memory so login still works for this page load.
  }
}

async function request<T>(method: string, path: string, body?: unknown, isForm = false): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: isForm ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the SmartPetition server. Is the backend running?')
  }

  if (res.status === 204) return undefined as T

  let data: unknown = null
  const text = await res.text()
  if (text) {
    try { data = JSON.parse(text) } catch { data = text }
  }

  if (!res.ok) {
    const d = data as { detail?: string | Record<string, unknown>; errors?: { field: string; message: string }[] } | null
    let message = `Request failed (${res.status})`
    if (d && typeof d.detail === 'string') message = d.detail
    else if (res.status === 422 && d?.errors?.length) message = d.errors.map(e => `${e.field}: ${e.message}`).join('; ')
    if (res.status === 401) {
      setToken(null)
      // Wrong password on the login/register form is a normal 401 — stay put.
      // Any other 401 means the session died (server restart, DB reseed,
      // token expiry): tell the app to sign out and bounce to /login instead
      // of leaving the user stranded on an error screen.
      if (!path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
        window.dispatchEvent(new CustomEvent('smartpetition:unauthorized'))
      }
    }
    throw new ApiError(res.status, message, d?.errors)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form, true),
  download: async (path: string) => {
    const token = getToken()
    const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!res.ok) throw new ApiError(res.status, 'Download failed')
    return res.blob()
  },
}

export function buildQuery(params: Record<string, unknown>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}
