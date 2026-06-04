import { supabase } from '@/lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

async function getAuthHeaders(studioId = null) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return {}
  const headers = { Authorization: `Bearer ${session.access_token}` }

  // Add studio ID if provided
  if (studioId) {
    headers['X-Studio-ID'] = studioId
  } else {
    // Try to get from localStorage as fallback
    const savedStudioId = localStorage.getItem('selectedStudioId')
    if (savedStudioId) {
      headers['X-Studio-ID'] = savedStudioId
    }
  }

  return headers
}

export async function apiGet(path, studioId = null) {
  const headers = await getAuthHeaders(studioId)
  const res = await fetch(`${API_URL}${path}`, { headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

export async function apiPost(path, body, studioId = null) {
  const headers = await getAuthHeaders(studioId)
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  if (res.status === 204) return null
  return res.json()
}

export async function apiPut(path, body, studioId = null) {
  const headers = await getAuthHeaders(studioId)
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

export async function apiPatch(path, body, studioId = null) {
  const headers = await getAuthHeaders(studioId)
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

export async function apiDelete(path, body, studioId = null) {
  const headers = await getAuthHeaders(studioId)
  const res = await fetch(`${API_URL}${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return null
}
