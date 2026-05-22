import { Hono } from 'hono'
import { auth } from './auth'
import { family } from './family'
import { health } from './health'
import { invitesRoutes } from './invites'
import { items } from './items'
import { me } from './me'
import { wallet } from './wallet'

export const routes = new Hono()
routes.route('/', health)
routes.route('/', auth)
routes.route('/', me)
routes.route('/', family)
routes.route('/', invitesRoutes)
routes.route('/', wallet)
routes.route('/', items)
