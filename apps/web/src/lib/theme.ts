import { create } from 'zustand'

export type Theme = 'light' | 'dark'

const KEY = 'brainpal.theme'

function systemPref(): Theme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Read the saved theme, falling back to the OS preference (defaulting light). */
export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY) as Theme | null
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* ignore */
  }
  return systemPref()
}

/** Apply the theme to <html> + the browser UI colour. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0a120e' : '#f3f7f4')
}

type ThemeState = {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: initialTheme(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* ignore */
    }
    applyTheme(theme)
    set({ theme })
  },
  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}))
