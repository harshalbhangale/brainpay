import { Hono } from 'hono'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { verifyToken } from '../services/jwt'
import { verifyAccessToken } from './oauth-store'
import { createMcpServer } from './server'
import type { IncomingMessage, ServerResponse } from 'node:http'

const BASE_URL = process.env.API_BASE_URL || 'https://api.brainpal.com.au'

/**
 * MCP route — uses the Node.js StreamableHTTPServerTransport which
 * accepts (IncomingMessage, ServerResponse) directly, bypassing Hono's
 * body consumption issue.
 *
 * Auth: accepts either a BrainPal JWT or an OAuth access token.
 * Returns 401 with WWW-Authenticate + resource_metadata per MCP spec.
 */

export async function handleMcpRequest(req: IncomingMessage, res: ServerResponse) {
  // Authenticate from header
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource", scope="brainpal:read"`,
    })
    res.end(JSON.stringify({ error: 'invalid_token', error_description: 'Authentication required' }))
    return
  }

  // Try OAuth access token first, then fall back to legacy JWT
  let accountId: string | null = null

  const oauthResult = await verifyAccessToken(token)
  if (oauthResult) {
    accountId = oauthResult.accountId
  } else {
    try {
      const jwtResult = await verifyToken(token)
      accountId = jwtResult.accountId
    } catch {
      // Neither worked
    }
  }

  if (!accountId) {
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': `Bearer error="invalid_token", resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource", scope="brainpal:read"`,
    })
    res.end(JSON.stringify({ error: 'invalid_token', error_description: 'Token expired or invalid' }))
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

// Dummy Hono route (unused — /mcp is handled at server level)
export const mcpRoute = new Hono()
mcpRoute.all('/mcp', (c) => c.json({ error: 'MCP endpoint is handled at server level' }, 500))
