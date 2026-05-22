import { env } from './env'
import { getStoredToken } from '@/stores/auth'

/**
 * Thin fetch wrapper for the BrainPal HTTP API.
 * Adds the BrainPal-issued JWT (from SecureStore) as a bearer token.
 */
export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getStoredToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const res = await fetch(`${env.apiBaseUrl}${path}`, { ...init, headers })
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}
