import { Hono } from 'hono'

/**
 * Wallet endpoints — Detailed Spec § 1.5, § 3.4.
 *   GET  /wallet            balance + last 50 entries     (day 4)
 *   POST /wallet/topup      fake +50/+100/+500            (day 5)
 *   POST /wallet/purchase   confirm a buy from camera     (day 10)
 */
export const wallet = new Hono()

wallet.get('/wallet', (c) => c.json({ error: 'not_implemented', day: 4 }, 501))
wallet.post('/wallet/topup', (c) => c.json({ error: 'not_implemented', day: 5 }, 501))
wallet.post('/wallet/purchase', (c) => c.json({ error: 'not_implemented', day: 10 }, 501))
