import { Hono } from 'hono'

/**
 * Auth surface on the API server.
 * OTP start/check live in Supabase Edge Functions (supabase/functions/otp-*).
 * This file holds the post-auth surface only.
 */
export const auth = new Hono()

auth.post('/auth/logout', (c) => c.json({ error: 'not_implemented', day: 2 }, 501))
