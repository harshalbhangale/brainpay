import { env } from './env'
import { supabase } from './supabase'

/**
 * Thin fetch wrapper for the BrainPal HTTP API.
 * Adds the Supabase JWT as a bearer token automatically.
 */
export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = new Headers(init.headers)
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const res = await fetch(`${env.apiBaseUrl}${path}`, { ...init, headers })
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}
