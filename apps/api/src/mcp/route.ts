import { Hono } from 'hono'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { verifyToken } from '../services/jwt'
import { createMcpServer } from './server'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * MCP route — uses the Node.js StreamableHTTPServerTransport which
 * accepts (IncomingMessage, ServerResponse) directly, bypassing Hono's
 * body consumption issue.
 *
 * We export a raw handler to be mounted on the Node.js server directly.
 */

export async function handleMcpRequest(req: IncomingMessage, res: ServerResponse) {
  // Authenticate from header
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'unauthenticated' }))
    return
  }

  let accountId: string
  try {
    const payload = await verifyToken(token)
    accountId = payload.accountId
  } catch {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'invalid_token' }))
    return
  }

  // Create a per-request stateless transport + server
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })

  const server = createMcpServer(accountId)
  await server.connect(transport)

  await transport.handleRequest(req, res)

  // Cleanup when response finishes
  res.on('close', () => server.close())
}

// Also export a dummy Hono route that returns 426 telling clients to use the raw endpoint
// (this prevents Hono from swallowing requests if someone mounts it wrong)
export const mcpRoute = new Hono()
mcpRoute.all('/mcp', (c) => {
  // This should never be reached if mounted correctly
  return c.json({ error: 'MCP endpoint is handled at server level' }, 500)
})
