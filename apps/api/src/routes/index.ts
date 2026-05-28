import { Hono } from 'hono'
import { auth } from './auth'
import { chat } from './chat'
import { choresRoutes } from './chores'
import { family } from './family'
import { goalsRoutes } from './goals'
import { health } from './health'
import { invitesRoutes } from './invites'
import { items } from './items'
import { me } from './me'
import { payments } from './payments'
import { voiceAgent } from './voice-agent'
import { voiceOnboarding } from './voice-onboarding'
import { wallet } from './wallet'

export const routes = new Hono()
routes.route('/', health)
routes.route('/', auth)
routes.route('/', me)
routes.route('/', family)
routes.route('/', invitesRoutes)
routes.route('/', wallet)
routes.route('/', items)
routes.route('/', payments)
routes.route('/', choresRoutes)
routes.route('/', goalsRoutes)
routes.route('/', chat)
routes.route('/', voiceAgent)
routes.route('/', voiceOnboarding)
