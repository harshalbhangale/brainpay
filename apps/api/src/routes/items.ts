import { Hono } from 'hono'

/**
 * GET /items/:id — Detailed Spec § 1.5, § 4.6 (detail card).
 */
export const items = new Hono()

items.get('/items/:id', (c) => c.json({ error: 'not_implemented', day: 10 }, 501))
