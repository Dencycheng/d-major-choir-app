export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export function getToken() { return localStorage.getItem('choir_token') || '' }
export function setToken(token: string) { localStorage.setItem('choir_token', token) }
export function clearToken() { localStorage.removeItem('choir_token') }

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  const body = options.body
  if (!(body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function apiBlob(path: string): Promise<Blob> {
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${API_BASE}${path}`, { headers })
  if (!res.ok) throw new Error(await res.text())
  return res.blob()
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function sendLoginCode(mobile: string) {
  return api<{ message: string; expires_in: number; debug_code?: string | null }>('/api/auth/send-code', { method: 'POST', body: JSON.stringify({ mobile, purpose: 'login' }) })
}

export async function loginMobile(mobile: string, code: string, name?: string) {
  return api<any>('/api/auth/login-mobile', { method: 'POST', body: JSON.stringify({ mobile, code, name }) })
}

export async function uploadFile(file: File, formData: Record<string, string> = {}) {
  const form = new FormData()
  form.append('file', file)
  Object.entries(formData).forEach(([key, value]) => form.append(key, value))
  return api<{asset_id:string; file_url:string; signed_url:string; filename:string; content_type:string; size:number}>('/api/files/upload', { method: 'POST', body: form })
}
