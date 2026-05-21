import { Hono } from 'hono'
import { auth } from './auth'
import { health } from './health'
import { items } from './items'
import { me } from './me'
import { wallet } from './wallet'

export const routes = new Hono()
routes.route('/', health)
routes.route('/', auth)
routes.route('/', me)
routes.route('/', wallet)
routes.route('/', items)
