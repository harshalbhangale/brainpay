/**
 * Web client env. Only VITE_* vars are bundled into the browser build.
 * Defaults point at the deployed prototype API, mirroring the mobile app.
 */
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'https://api.zapfan.com',
  wsUrl: import.meta.env.VITE_WS_URL ?? 'wss://api.zapfan.com/live',
}
