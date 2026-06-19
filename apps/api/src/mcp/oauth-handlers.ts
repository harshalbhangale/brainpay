import type { IncomingMessage, ServerResponse } from 'node:http'
import { URL } from 'node:url'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { accounts } from '../db/schema'
import {
  consumeAuthCode,
  consumeRefreshToken,
  createRefreshToken,
  mintAccessToken,
  redirectUriAllowed,
  storeAuthCode,
  validateClientId,
} from './oauth-store'

const BASE_URL = process.env.API_BASE_URL || 'https://api.brainpal.com.au'

// ─── Discovery metadata ───────────────────────────────────────────────

export function handleProtectedResourceMetadata(_req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    resource: `${BASE_URL}/mcp`,
    authorization_servers: [BASE_URL],
    scopes_supported: ['brainpal:read'],
    bearer_methods_supported: ['header'],
  }))
}

export function handleAuthServerMetadata(_req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/oauth/authorize`,
    token_endpoint: `${BASE_URL}/oauth/token`,
    scopes_supported: ['brainpal:read', 'offline_access'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    client_id_metadata_document_supported: true,
  }))
}

// ─── GET /oauth/authorize — show login page ───────────────────────────

export function handleAuthorize(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '', BASE_URL)
  const clientId = url.searchParams.get('client_id') ?? ''
  const redirectUri = url.searchParams.get('redirect_uri') ?? ''
  const state = url.searchParams.get('state') ?? ''
  const codeChallenge = url.searchParams.get('code_challenge') ?? ''
  const codeChallengeMethod = url.searchParams.get('code_challenge_method') ?? ''
  const scope = url.searchParams.get('scope') ?? 'brainpal:read'

  if (!clientId || !redirectUri || !codeChallenge || codeChallengeMethod !== 'S256') {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end('Missing required OAuth parameters (client_id, redirect_uri, code_challenge with S256)')
    return
  }

  // Render a simple phone OTP login form
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BrainPal — Connect</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,sans-serif;background:#f8f9fa;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .card{background:white;border-radius:16px;padding:32px;max-width:380px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
  h1{font-size:20px;margin-bottom:4px}
  p{color:#666;font-size:14px;margin-bottom:24px}
  label{font-size:13px;font-weight:500;display:block;margin-bottom:6px}
  .phone-row{display:flex;gap:8px;margin-bottom:16px}
  select{padding:12px 8px;border:1px solid #ddd;border-radius:8px;font-size:14px;background:#f9f9f9;min-width:90px}
  input{width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;font-size:16px}
  #otp{margin-bottom:16px;letter-spacing:4px;text-align:center;font-size:20px}
  button{width:100%;padding:14px;background:#10b981;color:white;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer}
  button:hover{background:#059669}
  button:disabled{background:#9ca3af;cursor:not-allowed}
  .error{color:#dc2626;font-size:13px;margin-bottom:12px;display:none}
  #step2{display:none}
</style></head><body>
<div class="card">
  <h1>&#129504; BrainPal</h1>
  <p>Allow Claude to read your family's balances, spending, and chores.</p>
  <div id="step1">
    <label>Phone number</label>
    <div class="phone-row">
      <select id="cc"><option value="+91">&#127470;&#127475; +91</option><option value="+61">&#127462;&#127482; +61</option><option value="+1">&#127482;&#127480; +1</option><option value="+44">&#127468;&#127463; +44</option><option value="+65">&#127480;&#127468; +65</option><option value="+971">&#127462;&#127466; +971</option></select>
      <input type="tel" id="phone" placeholder="7028167389" inputmode="numeric" autocomplete="tel-national"/>
    </div>
    <div class="error" id="err1"></div>
    <button id="btn1" onclick="sendOtp()">Send OTP</button>
  </div>
  <div id="step2">
    <label>Enter the 6-digit code</label>
    <input type="text" id="otp" maxlength="6" inputmode="numeric" placeholder="123456" autocomplete="one-time-code"/>
    <div class="error" id="err2"></div>
    <button id="btn2" onclick="verifyOtp()">Connect</button>
  </div>
</div>
<script>
const params=${JSON.stringify({clientId,redirectUri,state,codeChallenge,scope})};
function getPhone(){const cc=document.getElementById('cc').value;const raw=document.getElementById('phone').value.replace(/[^0-9]/g,'').replace(/^0+/,'');return cc+raw;}
async function sendOtp(){const phone=getPhone();if(phone.length<8)return;document.getElementById('btn1').disabled=true;const r=await fetch('/auth/otp/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone})});if(r.ok){document.getElementById('step1').style.display='none';document.getElementById('step2').style.display='block';}else{const d=await r.json().catch(()=>({}));document.getElementById('err1').textContent=d.error||'Failed to send OTP';document.getElementById('err1').style.display='block';document.getElementById('btn1').disabled=false;}}
async function verifyOtp(){const phone=getPhone();const code=document.getElementById('otp').value.replace(/[^0-9]/g,'');if(code.length!==6)return;document.getElementById('btn2').disabled=true;const r=await fetch('/oauth/authorize/callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,code,...params})});const data=await r.json();if(data.redirect){window.location.href=data.redirect;}else{document.getElementById('err2').textContent=data.error||'Verification failed';document.getElementById('err2').style.display='block';document.getElementById('btn2').disabled=false;}}
</script></body></html>`

  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(html)
}

// ─── POST /oauth/authorize/callback — verify OTP, issue code ──────────

export async function handleAuthorizeCallback(req: IncomingMessage, res: ServerResponse) {
  const body = await readBody(req)
  const { phone, code, clientId, redirectUri, state, codeChallenge, scope } = body

  // Validate CIMD client
  const clientMeta = await validateClientId(clientId)
  if (!clientMeta) {
    json(res, 400, { error: 'invalid_client_id' })
    return
  }
  if (!redirectUriAllowed(redirectUri, clientMeta.redirectUris)) {
    json(res, 400, { error: 'invalid_redirect_uri' })
    return
  }

  // Verify OTP via existing Twilio Verify
  const verifyOk = await verifyOtpCode(phone, code)
  if (!verifyOk) {
    json(res, 401, { error: 'Invalid OTP code' })
    return
  }

  // Find or error on account
  const [acct] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.phone, phone))
    .limit(1)

  if (!acct) {
    json(res, 404, { error: 'No BrainPal account for this phone number' })
    return
  }

  // Issue auth code
  const authCode = storeAuthCode({
    accountId: acct.id,
    clientId,
    redirectUri,
    codeChallenge,
    scope: scope || 'brainpal:read',
  })

  const redirect = `${redirectUri}?code=${authCode}&state=${encodeURIComponent(state)}`
  json(res, 200, { redirect })
}

// ─── POST /oauth/token ────────────────────────────────────────────────

export async function handleToken(req: IncomingMessage, res: ServerResponse) {
  // Accept application/x-www-form-urlencoded (required by RFC 6749) or JSON
  const contentType = req.headers['content-type'] ?? ''
  let params: Record<string, string>

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const raw = await readRawBody(req)
    params = Object.fromEntries(new URLSearchParams(raw))
  } else {
    params = await readBody(req)
  }

  const grantType = params.grant_type

  if (grantType === 'authorization_code') {
    const code = params.code
    const codeVerifier = params.code_verifier
    const redirectUri = params.redirect_uri

    if (!code || !codeVerifier) {
      json(res, 400, { error: 'invalid_request', error_description: 'Missing code or code_verifier' })
      return
    }

    const entry = consumeAuthCode(code, codeVerifier)
    if (!entry) {
      json(res, 400, { error: 'invalid_grant', error_description: 'Invalid or expired authorization code' })
      return
    }

    if (entry.redirectUri !== redirectUri) {
      json(res, 400, { error: 'invalid_grant', error_description: 'redirect_uri mismatch' })
      return
    }

    const { token, expiresIn } = await mintAccessToken(entry.accountId, entry.scope)
    const refreshToken = createRefreshToken(entry.accountId, entry.clientId, entry.scope)

    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({
      access_token: token,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: entry.scope,
    }))
    return
  }

  if (grantType === 'refresh_token') {
    const oldToken = params.refresh_token
    if (!oldToken) {
      json(res, 400, { error: 'invalid_request' })
      return
    }

    const entry = consumeRefreshToken(oldToken)
    if (!entry) {
      json(res, 400, { error: 'invalid_grant', error_description: 'Invalid refresh token' })
      return
    }

    const { token, expiresIn } = await mintAccessToken(entry.accountId, entry.scope)
    const newRefreshToken = createRefreshToken(entry.accountId, entry.clientId, entry.scope)

    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({
      access_token: token,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: newRefreshToken,
      scope: entry.scope,
    }))
    return
  }

  json(res, 400, { error: 'unsupported_grant_type' })
}

// ─── Helpers ──────────────────────────────────────────────────────────

async function verifyOtpCode(phone: string, code: string): Promise<boolean> {
  // Dev bypass — same logic as twilio-verify.ts
  const bypassEnabled = process.env.DEV_BYPASS_OTP === 'true'
  const bypassCode = process.env.DEV_BYPASS_CODE ?? '123456'
  if (bypassEnabled && code === bypassCode) return true

  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID
  if (!sid || !token || !verifySid) return false

  const r = await fetch(
    `https://verify.twilio.com/v2/Services/${verifySid}/VerificationChecks`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      },
      body: new URLSearchParams({ To: phone, Code: code }),
    },
  )
  if (!r.ok) return false
  const data = await r.json() as { status?: string }
  return data.status === 'approved'
}

function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk: Buffer) => { data += chunk.toString() })
    req.on('end', () => resolve(data))
  })
}

function readBody(req: IncomingMessage): Promise<Record<string, string>> {
  return readRawBody(req).then((raw) => {
    try { return JSON.parse(raw) } catch { return Object.fromEntries(new URLSearchParams(raw)) }
  })
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}
