import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// BrainPal web client — independent of apps/mobile.
// Talks to the existing Hono API + WebSocket server (see src/lib/env.ts).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // host:true exposes the dev server on the LAN so you can test the
    // camera on a real phone (getUserMedia needs HTTPS or localhost).
    host: true,
  },
})
