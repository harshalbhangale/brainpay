import pino from 'pino'
import { loadEnv } from './env'

const env = loadEnv()

export const logger = (pino as any)({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
})
