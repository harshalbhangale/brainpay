import { env } from './env'
import { getStoredToken } from '../stores/auth'

export class ApiError extends Error {
  status: number
  body: string
  constructor(status: number, body: string) {
    super(`API ${status}: ${body}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/**
 * Thin fetch wrapper for the BrainPal HTTP API.
 * Adds the BrainPal-issued JWT (from the auth store) as a bearer token.
 * Mirrors apps/mobile/lib/api.ts so the contract stays identical.
 */
export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const res = await fetch(`${env.apiBaseUrl}${path}`, { ...init, headers })
  if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => ''))
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
