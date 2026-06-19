/**
 * Web client env. Only VITE_* vars are bundled into the browser build.
 * Defaults point at the deployed prototype API, mirroring the mobile app.
 */
const API_FALLBACK = 'https://api.zapfan.com'
const WS_FALLBACK = 'wss://api.zapfan.com/live'

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || API_FALLBACK,
  wsUrl: import.meta.env.VITE_WS_URL || WS_FALLBACK,
}
