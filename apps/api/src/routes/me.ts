import { Hono } from 'hono'

/**
 * GET /me, PATCH /me — Detailed Spec § 1.5
 * Auth via Supabase JWT (middleware/auth.ts). Implemented day 3.
 */
export const me = new Hono()

me.get('/me', (c) => c.json({ error: 'not_implemented', day: 3 }, 501))
me.patch('/me', (c) => c.json({ error: 'not_implemented', day: 3 }, 501))
