/**
 * Theme — the BrainPal web app is dark-only (CRED-inspired).
 * Light mode has been removed. These helpers remain so the rest of the
 * app has a single place to set the document color scheme + browser chrome.
 */

export function applyDarkTheme() {
  const root = document.documentElement
  root.classList.add('dark') // harmless; tokens are dark-only regardless
  root.style.colorScheme = 'dark'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', '#07090e')
}
