import { Hono } from 'hono'

export const health = new Hono()

health.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

// ALB readiness probe; deeper than /health (could check DB later).
health.get('/ready', (c) => c.json({ status: 'ready', timestamp: new Date().toISOString() }))
