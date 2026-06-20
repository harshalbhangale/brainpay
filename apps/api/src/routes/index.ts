import { Hono } from 'hono'
import { auth } from './auth'
import { chat } from './chat'
import { choresRoutes } from './chores'
import { family } from './family'
import { goalsRoutes } from './goals'
import { health } from './health'
import { invitesRoutes } from './invites'
import { joinRequests } from './join-requests'
import { items } from './items'
import { me } from './me'
import { payments } from './payments'
import { realtime } from './realtime'
import { twilioVoice } from './twilio-voice'
import { voiceAgent } from './voice-agent'
import { voiceOnboarding } from './voice-onboarding'
import { wallet } from './wallet'
import { study } from './study'

export const routes = new Hono()
routes.route('/', health)
routes.route('/', auth)
// Public webhooks must be mounted BEFORE any sub-app that uses
// `.use('*', requireAuth)` (me/wallet/chat/voiceAgent), otherwise their
// catch-all auth middleware leaks onto these routes. Twilio signs its own
// requests; no JWT.
routes.route('/', twilioVoice)
routes.route('/', me)
routes.route('/', family)
routes.route('/', invitesRoutes)
routes.route('/', joinRequests)
routes.route('/', wallet)
routes.route('/', items)
routes.route('/', payments)
routes.route('/', choresRoutes)
routes.route('/', goalsRoutes)
routes.route('/', chat)
routes.route('/', voiceAgent)
routes.route('/', voiceOnboarding)
routes.route('/', realtime)
routes.route('/', study)
