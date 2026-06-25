/**
 * Mock data for the MoneyPal payments experience.
 * Self-contained so the /pay route renders instantly with no backend.
 */
import type { Pastel } from './tokens'

export const USER = {
  name: 'Peter',
  fullName: 'Peter Marshall',
  handle: '@petermarshall',
  avatar: '',
}

export type Money = number // minor units → we just use whole-currency numbers here

export const ACCOUNT = {
  currency: 'USD',
  symbol: '$',
  balance: 48250.74,
  changePct: 4.8, // vs last month
  available: 41980.0,
}

export type TxnDirection = 'in' | 'out'
export type Txn = {
  id: string
  name: string
  detail: string
  amount: Money
  dir: TxnDirection
  category: string
  tile: Pastel
  initials: string
  when: string // ISO
  status?: 'pending' | 'done'
}

export const TRANSACTIONS: Txn[] = [
  { id: 't1', name: 'Spotify', detail: 'Premium · Subscription', amount: 11.99, dir: 'out', category: 'Entertainment', tile: 'mint', initials: 'S', when: '2026-06-24T08:12:00Z', status: 'done' },
  { id: 't2', name: 'Salary — Northwind', detail: 'Monthly payroll', amount: 6200.0, dir: 'in', category: 'Income', tile: 'sky', initials: 'N', when: '2026-06-24T06:00:00Z', status: 'done' },
  { id: 't3', name: 'Olivia Bennett', detail: 'Dinner split', amount: 42.5, dir: 'out', category: 'Friends', tile: 'blush', initials: 'OB', when: '2026-06-23T20:41:00Z', status: 'done' },
  { id: 't4', name: 'Apple', detail: 'iCloud+ 2TB', amount: 9.99, dir: 'out', category: 'Software', tile: 'lilac', initials: 'A', when: '2026-06-23T11:05:00Z', status: 'done' },
  { id: 't5', name: 'Whole Foods', detail: 'Groceries', amount: 86.34, dir: 'out', category: 'Shopping', tile: 'butter', initials: 'WF', when: '2026-06-22T18:22:00Z', status: 'done' },
  { id: 't6', name: 'Marcus Lee', detail: 'Requested', amount: 120.0, dir: 'in', category: 'Friends', tile: 'peach', initials: 'ML', when: '2026-06-22T09:14:00Z', status: 'pending' },
  { id: 't7', name: 'Uber', detail: '3 trips', amount: 38.7, dir: 'out', category: 'Transport', tile: 'sky', initials: 'U', when: '2026-06-21T22:02:00Z', status: 'done' },
]

export type Contact = { id: string; name: string; initials: string; tile: Pastel; handle: string }
export const CONTACTS: Contact[] = [
  { id: 'c1', name: 'Olivia', initials: 'OB', tile: 'blush', handle: '@olivia' },
  { id: 'c2', name: 'Marcus', initials: 'ML', tile: 'sky', handle: '@marcus' },
  { id: 'c3', name: 'Sofia', initials: 'SR', tile: 'mint', handle: '@sofia' },
  { id: 'c4', name: 'Daniel', initials: 'DK', tile: 'butter', handle: '@daniel' },
  { id: 'c5', name: 'Aisha', initials: 'AH', tile: 'lilac', handle: '@aisha' },
  { id: 'c6', name: 'Liam', initials: 'LC', tile: 'peach', handle: '@liam' },
]

export type Card = {
  id: string
  label: string
  last4: string
  scheme: 'visa' | 'mastercard'
  balance: Money
  gradient: 'ink' | 'accent' | 'aurora'
  frozen?: boolean
}
export const CARDS: Card[] = [
  { id: 'k1', label: 'Everyday', last4: '4921', scheme: 'visa', balance: 41980.0, gradient: 'ink' },
  { id: 'k2', label: 'Travel', last4: '0078', scheme: 'mastercard', balance: 2310.5, gradient: 'accent' },
  { id: 'k3', label: 'Savings vault', last4: '5563', scheme: 'visa', balance: 12450.0, gradient: 'aurora', frozen: true },
]

/** 14-point balance trend for the hero sparkline (oldest → newest). */
export const BALANCE_TREND = [
  38_400, 39_120, 38_900, 41_300, 40_750, 42_980, 43_510, 42_200, 44_900, 45_600, 46_120, 45_300, 47_800, 48_250,
]

export type Insight = { id: string; label: string; value: string; sub: string; tile: Pastel }
export const INSIGHTS: Insight[] = [
  { id: 'i1', label: 'Spending', value: '$1,284', sub: 'this month · -12%', tile: 'sky' },
  { id: 'i2', label: 'Saved', value: '$640', sub: 'auto-vault · +8%', tile: 'mint' },
  { id: 'i3', label: 'Subscriptions', value: '$58', sub: '6 active', tile: 'lilac' },
  { id: 'i4', label: 'Cashback', value: '$23.40', sub: 'rewards earned', tile: 'butter' },
]

/* ── Family (the core of the family-bank vision) ─────────────────────────── */
export type Cadence = 'weekly' | 'monthly'
export type Goal = { title: string; target: Money; saved: Money; tile: Pastel }
export type Kid = {
  id: string
  name: string
  age: number
  initials: string
  tile: Pastel
  avatar?: string // data URL once a photo is uploaded
  balance: Money
  allowance: { amount: Money; cadence: Cadence }
  goal: Goal
  tasksDue: number // chores awaiting approval
}

export const KIDS: Kid[] = [
  {
    id: 'kid1',
    name: 'Mila',
    age: 9,
    initials: 'MI',
    tile: 'blush',
    balance: 64.5,
    allowance: { amount: 10, cadence: 'weekly' },
    goal: { title: 'Nintendo Switch', target: 320, saved: 145, tile: 'sky' },
    tasksDue: 2,
  },
  {
    id: 'kid2',
    name: 'Leo',
    age: 13,
    initials: 'LE',
    tile: 'mint',
    balance: 128.0,
    allowance: { amount: 25, cadence: 'monthly' },
    goal: { title: 'Mountain bike', target: 450, saved: 290, tile: 'butter' },
    tasksDue: 0,
  },
]

/** Signed, formatted money for a transaction direction (single source of truth). */
export function signed(amount: number, dir: TxnDirection): string {
  return `${dir === 'in' ? '+' : '−'}${fmt(Math.abs(amount))}`
}

/** Currency formatter shared across the experience. */
export function fmt(amount: number, opts: { sign?: boolean; cents?: boolean } = {}): string {
  const { sign = false, cents = true } = opts
  const s = ACCOUNT.symbol
  const abs = Math.abs(amount)
  const str = abs.toLocaleString('en-US', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })
  const prefix = sign ? (amount < 0 ? '−' : '+') : amount < 0 ? '−' : ''
  return `${prefix}${s}${str}`
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.max(0, now - then)
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const d = Math.floor(hr / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
