/**
 * MoneyPal UI primitives — the component template.
 * ───────────────────────────────────────────────────────────────────────────
 * Compose every payments screen from these so the product stays perfectly
 * consistent. All of them assume they render inside a `.pv` root (see theme.css).
 *
 *  PressButton   tactile <button> with spring scale
 *  Button        labelled CTA — variants: primary | soft | accent | ghost
 *  IconButton    round icon-only control (light or dark)
 *  Card          white rounded surface (optionally pressable)
 *  ActionTile    big pastel quick-action tile (the mock's Scan/Edit/Convert)
 *  Pill          filter / status chip
 *  IconBadge     rounded square icon chip in a pastel or ink color
 *  Avatar        initials / photo circle with deterministic pastel
 *  SearchBar     "Ask or search for anything" field
 *  SegmentToggle pill segmented control
 *  Fab           floating circular primary action
 *  SectionHeader title + optional trailing action
 *  ListRow       avatar/icon + title/subtitle + trailing value
 *  Stat          compact label / value / sub block
 *  Sparkline     lightweight SVG balance trend
 */
import { useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Camera, ImagePlus, Search, Upload, X } from 'lucide-react'
import { PASTELS, type Pastel } from '../tokens'

/* ─────────────────────────────────────────────────────────────── PressButton */
export function PressButton({
  children,
  className = '',
  spring = 'sm',
  type = 'button',
  disabled,
  onClick,
  style,
  ariaLabel,
  title,
}: {
  children: ReactNode
  className?: string
  spring?: 'sm' | 'lg'
  type?: 'button' | 'submit'
  disabled?: boolean
  onClick?: () => void
  style?: CSSProperties
  ariaLabel?: string
  title?: string
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      style={style}
      className={`${spring === 'lg' ? 'pv-press-lg' : 'pv-press'} ${className}`}
    >
      {children}
    </button>
  )
}

/* ──────────────────────────────────────────────────────────────────── Button */
type ButtonVariant = 'primary' | 'soft' | 'accent' | 'ghost'
export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  full,
  disabled,
  type = 'button',
  leadingIcon: Lead,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  full?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  leadingIcon?: LucideIcon
  className?: string
}) {
  const sizes = {
    sm: 'h-10 px-4 text-sm gap-1.5',
    md: 'h-12 px-5 text-[0.95rem] gap-2',
    lg: 'h-14 px-6 text-base gap-2.5',
  }[size]

  const variants: Record<ButtonVariant, CSSProperties> = {
    primary: { background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-md)' },
    accent: { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' },
    soft: { background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' },
    ghost: { background: 'transparent', color: 'var(--pv-ink-2)' },
  }
  const sheen = variant === 'primary' || variant === 'accent' ? 'pv-sheen' : ''

  return (
    <PressButton
      type={type}
      spring="lg"
      onClick={onClick}
      disabled={disabled}
      style={variants[variant]}
      className={`${sheen} inline-flex items-center justify-center rounded-full font-bold tracking-tight disabled:opacity-40 disabled:saturate-50 ${sizes} ${full ? 'w-full' : ''} ${className}`}
    >
      {Lead && <Lead size={size === 'lg' ? 20 : 18} strokeWidth={2.4} />}
      {children}
    </PressButton>
  )
}

/* ────────────────────────────────────────────────────────────────── IconButton */
export function IconButton({
  Icon,
  onClick,
  tone = 'light',
  size = 44,
  ariaLabel,
  badge,
  className = '',
}: {
  Icon: LucideIcon
  onClick?: () => void
  tone?: 'light' | 'dark' | 'accent'
  size?: number
  ariaLabel: string
  badge?: number
  className?: string
}) {
  const tones: Record<string, CSSProperties> = {
    light: { background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-sm)' },
    dark: { background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-md)' },
    accent: { backgroundImage: 'var(--pv-grad-accent)', color: 'var(--pv-on-accent)', boxShadow: 'var(--pv-shadow-pop)' },
  }
  return (
    <PressButton
      spring="lg"
      onClick={onClick}
      ariaLabel={ariaLabel}
      style={{ width: size, height: size, ...tones[tone] }}
      className={`relative inline-flex items-center justify-center rounded-full ${className}`}
    >
      <Icon size={Math.round(size * 0.42)} strokeWidth={2.2} />
      {badge != null && badge > 0 && (
        <span
          className="pv-amount absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.625rem] font-extrabold"
          style={{ background: 'var(--pv-neg)', color: '#fff', boxShadow: '0 0 0 2px var(--pv-bg)' }}
        >
          {badge}
        </span>
      )}
    </PressButton>
  )
}

/* ──────────────────────────────────────────────────────────────────────── Card */
export function Card({
  children,
  className = '',
  onClick,
  style,
  flat,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
  style?: CSSProperties
  flat?: boolean
}) {
  const base = flat ? 'pv-card-flat' : 'pv-card'
  if (onClick) {
    return (
      <PressButton onClick={onClick} style={style} className={`${base} block w-full text-left ${className}`}>
        {children}
      </PressButton>
    )
  }
  return (
    <div style={style} className={`${base} ${className}`}>
      {children}
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────── ActionTile */
/** The hero pastel quick-action tile from the mock (Scan / Edit / Convert / Ask AI). */
export function ActionTile({
  Icon,
  label,
  tile,
  active,
  onClick,
  className = '',
}: {
  Icon: LucideIcon
  label: string
  tile: Pastel
  active?: boolean
  onClick?: () => void
  className?: string
}) {
  const p = PASTELS[tile]
  return (
    <PressButton
      spring="lg"
      onClick={onClick}
      style={{
        background: p.bg,
        color: p.ink,
        boxShadow: active ? 'var(--pv-shadow-md)' : 'var(--pv-shadow-xs)',
        outline: active ? '2px solid var(--pv-primary)' : 'none',
        outlineOffset: active ? '2px' : '0',
      }}
      className={`relative flex aspect-[4/3.4] flex-col justify-between overflow-hidden rounded-[var(--pv-r-lg)] p-4 ${className}`}
    >
      <span
        className="flex h-11 w-11 items-center justify-center rounded-full"
        style={{ background: 'rgba(255,255,255,0.65)', color: p.ink }}
      >
        <Icon size={20} strokeWidth={2.2} />
      </span>
      <span className="pv-title text-left">{label}</span>
    </PressButton>
  )
}

/* ──────────────────────────────────────────────────────────────────────── Pill */
export function Pill({
  children,
  active,
  onClick,
  leadingIcon: Lead,
  className = '',
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  leadingIcon?: LucideIcon
  className?: string
}) {
  return (
    <PressButton
      onClick={onClick}
      style={
        active
          ? { background: 'var(--pv-primary)', color: 'var(--pv-on-primary)' }
          : { background: 'var(--pv-surface)', color: 'var(--pv-ink-2)', boxShadow: 'var(--pv-shadow-xs)' }
      }
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold ${className}`}
    >
      {Lead && <Lead size={15} strokeWidth={2.4} />}
      {children}
    </PressButton>
  )
}

/* ─────────────────────────────────────────────────────────────────── IconBadge */
export function IconBadge({
  Icon,
  tile,
  ink,
  size = 44,
}: {
  Icon: LucideIcon
  tile?: Pastel
  ink?: boolean
  size?: number
}) {
  const style: CSSProperties = ink
    ? { background: 'var(--pv-primary)', color: 'var(--pv-on-primary)' }
    : tile
      ? { background: PASTELS[tile].bg, color: PASTELS[tile].ink }
      : { background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-2xl"
      style={{ width: size, height: size, ...style }}
    >
      <Icon size={Math.round(size * 0.45)} strokeWidth={2.2} />
    </span>
  )
}

/* ────────────────────────────────────────────────────────────────────── Avatar */
const AVATAR_TILES: Pastel[] = ['sky', 'mint', 'butter', 'lilac', 'peach', 'blush']
// Vibrant, premium gradient discs + playful characters for image-less avatars.
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#60a5fa,#4f46e5)',
  'linear-gradient(135deg,#34d399,#059669)',
  'linear-gradient(135deg,#fbbf24,#f97316)',
  'linear-gradient(135deg,#a78bfa,#7c3aed)',
  'linear-gradient(135deg,#fb7185,#e11d48)',
  'linear-gradient(135deg,#22d3ee,#0891b2)',
  'linear-gradient(135deg,#f472b6,#db2777)',
  'linear-gradient(135deg,#4ade80,#16a34a)',
]
const AVATAR_CHARS = ['🦊', '🐼', '🐵', '🦁', '🐯', '🐨', '🐸', '🐧', '🐙', '🦉', '🐰', '🐻', '🦄', '🐲', '🐳', '🦖']
function seedIndex(seed: string, mod: number): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h % mod
}
export function Avatar({
  name,
  initials,
  tile,
  size = 44,
  src,
  fun,
}: {
  name?: string
  initials?: string
  tile?: Pastel
  size?: number
  src?: string
  /** When there's no photo, show a playful character instead of initials. */
  fun?: boolean
}) {
  // A real image only when src is a URL/data-URI; otherwise treat src as an
  // emoji/glyph (onboarding stores avatars as emoji) and render it as text.
  const isImage = !!src && /^(data:|https?:|blob:|\/)/.test(src)
  if (isImage) {
    return <img src={src} alt={name ?? ''} className="rounded-full object-cover" style={{ width: size, height: size }} />
  }
  const isEmoji = !!src && !isImage
  const seed = name ?? initials ?? '?'
  const gi = tile ? AVATAR_TILES.indexOf(tile) : -1
  const gradient = AVATAR_GRADIENTS[(gi >= 0 ? gi : seedIndex(seed, AVATAR_GRADIENTS.length)) % AVATAR_GRADIENTS.length]
  const content = isEmoji
    ? (src as string)
    : fun
      ? AVATAR_CHARS[seedIndex(`${seed}~`, AVATAR_CHARS.length)]
      : (initials ?? (name?.trim()[0] ?? '?')).slice(0, 2).toUpperCase()
  const glyph = isEmoji || fun
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-extrabold"
      style={{
        width: size,
        height: size,
        backgroundImage: gradient,
        color: '#fff',
        fontSize: glyph ? size * 0.5 : size * 0.38,
        letterSpacing: glyph ? 0 : '-0.02em',
        boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.45), inset 0 -3px 8px rgba(0,0,0,0.14)',
      }}
    >
      {content}
    </span>
  )
}

/* ─────────────────────────────────────────────────────────────────── SearchBar */
export function SearchBar({
  placeholder = 'Ask or search for anything',
  value,
  onChange,
  trailing,
  onClick,
}: {
  placeholder?: string
  value?: string
  onChange?: (v: string) => void
  trailing?: ReactNode
  onClick?: () => void
}) {
  return (
    <div
      className="flex h-14 items-center gap-3 rounded-full px-5"
      style={{ background: 'var(--pv-surface)', boxShadow: 'var(--pv-shadow-sm)' }}
      onClick={onClick}
    >
      <Search size={20} strokeWidth={2.4} style={{ color: 'var(--pv-ink-3)' }} />
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[0.95rem] font-medium outline-none placeholder:font-medium"
        style={{ color: 'var(--pv-ink)' }}
      />
      {trailing}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────── SegmentToggle */
export function SegmentToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-full p-1" style={{ background: 'var(--pv-surface-2)' }}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="pv-press rounded-full px-4 py-1.5 text-sm font-bold tracking-tight"
            style={active ? { background: 'var(--pv-surface)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-sm)' } : { color: 'var(--pv-ink-3)' }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────────────── Fab */
export function Fab({ Icon, onClick, ariaLabel }: { Icon: LucideIcon; onClick?: () => void; ariaLabel: string }) {
  return (
    <PressButton
      spring="lg"
      onClick={onClick}
      ariaLabel={ariaLabel}
      style={{ background: 'var(--pv-primary)', color: 'var(--pv-on-primary)', boxShadow: 'var(--pv-shadow-lg)' }}
      className="pv-sheen flex h-14 w-14 items-center justify-center rounded-full"
    >
      <Icon size={26} strokeWidth={2.4} />
    </PressButton>
  )
}

/* ─────────────────────────────────────────────────────────────── SectionHeader */
export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="pv-h2">{title}</h3>
      {action}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────── ListRow */
export function ListRow({
  leading,
  title,
  subtitle,
  value,
  valueColor,
  sub,
  onClick,
  className = '',
}: {
  leading: ReactNode
  title: string
  subtitle?: string
  value?: string
  valueColor?: string
  sub?: string
  onClick?: () => void
  className?: string
}) {
  const inner = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="pv-title truncate">{title}</div>
        {subtitle && (
          <div className="truncate text-sm font-medium" style={{ color: 'var(--pv-ink-3)' }}>
            {subtitle}
          </div>
        )}
      </div>
      {(value || sub) && (
        <div className="text-right">
          {value && <div className="pv-amount text-[0.95rem]" style={{ color: valueColor ?? 'var(--pv-ink)' }}>{value}</div>}
          {sub && <div className="text-xs font-semibold" style={{ color: 'var(--pv-ink-3)' }}>{sub}</div>}
        </div>
      )}
    </>
  )
  if (onClick) {
    return (
      <PressButton onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl py-2 text-left ${className}`}>
        {inner}
      </PressButton>
    )
  }
  return <div className={`flex items-center gap-3 py-2 ${className}`}>{inner}</div>
}

/* ────────────────────────────────────────────────────────────────────────── Stat */
export function Stat({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div>
      <div className="pv-label">{label}</div>
      <div className="pv-amount mt-1 text-2xl">{value}</div>
      {sub && <div className="mt-0.5 text-xs font-semibold" style={{ color: subColor ?? 'var(--pv-ink-3)' }}>{sub}</div>}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────── Sparkline */
export function Sparkline({
  data,
  width = 280,
  height = 64,
  stroke = 'currentColor',
  fill = true,
}: {
  data: number[]
  width?: number
  height?: number
  stroke?: string
  fill?: boolean
}) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const pad = 4
  const stepX = (width - pad * 2) / (data.length - 1)
  const pts = data.map((d, i) => {
    const x = pad + i * stepX
    const y = pad + (height - pad * 2) * (1 - (d - min) / span)
    return [x, y] as const
  })
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`
  const gid = `pv-spark-${Math.round(width)}-${data.length}`
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ color: stroke as string }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gid})`} />}
      <path d={line} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={3.5} fill="currentColor" />
    </svg>
  )
}


/* ──────────────────────────────────────────────────────────────────── ProgressBar */
export function ProgressBar({ value, max, color }: { value: number; max: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100))
  return (
    <div className="pv-progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%`, ...(color ? { backgroundImage: 'none', background: color } : null) }} />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────── ImageUpload */
/**
 * Reusable image upload with drag-drop, file picker, and camera capture.
 * Reads the file to a data URL and reports it back via onChange (no backend needed).
 *  - shape="circle" → avatar uploader; shape="square" → receipt/document tile.
 */
export function ImageUpload({
  value,
  onChange,
  label = 'Upload image',
  hint = 'Drag & drop, or tap to choose',
  shape = 'square',
  size = 96,
  className = '',
}: {
  value?: string
  onChange?: (dataUrl: string, file: File) => void
  label?: string
  hint?: string
  shape?: 'square' | 'circle'
  size?: number
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const camRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)

  function ingest(files: FileList | null) {
    const f = files?.[0]
    if (!f || !f.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') onChange?.(reader.result, f)
    }
    reader.readAsDataURL(f)
  }

  const radius = shape === 'circle' ? '9999px' : 'var(--pv-r-lg)'

  // Filled preview state
  if (value) {
    return (
      <div className={`relative inline-block ${className}`} style={{ width: shape === 'circle' ? size : '100%' }}>
        <img
          src={value}
          alt={label}
          className="block w-full object-cover"
          style={{ height: shape === 'circle' ? size : 160, borderRadius: radius, boxShadow: 'var(--pv-shadow-sm)' }}
        />
        <div className="absolute right-2 top-2 flex gap-1.5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-label="Change image"
            className="pv-press flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: 'rgba(255,255,255,0.92)', color: 'var(--pv-ink)', boxShadow: 'var(--pv-shadow-sm)' }}
          >
            <ImagePlus size={15} strokeWidth={2.4} />
          </button>
          <button
            type="button"
            onClick={() => onChange?.('', new File([], ''))}
            aria-label="Remove image"
            className="pv-press flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: 'rgba(255,255,255,0.92)', color: 'var(--pv-neg)', boxShadow: 'var(--pv-shadow-sm)' }}
          >
            <X size={15} strokeWidth={2.6} />
          </button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => ingest(e.target.files)} />
      </div>
    )
  }

  // Empty dropzone state
  return (
    <div className={className} style={{ width: shape === 'circle' ? size : '100%' }}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          ingest(e.dataTransfer.files)
        }}
        data-drag={drag}
        aria-label={label}
        className="pv-dropzone pv-press flex w-full flex-col items-center justify-center gap-2 text-center"
        style={{
          height: shape === 'circle' ? size : 160,
          width: shape === 'circle' ? size : '100%',
          borderRadius: radius,
          padding: shape === 'circle' ? 0 : '1rem',
        }}
      >
        <span
          className="flex items-center justify-center rounded-full"
          style={{
            width: shape === 'circle' ? 32 : 44,
            height: shape === 'circle' ? 32 : 44,
            background: 'var(--pv-surface)',
            color: 'var(--pv-accent)',
            boxShadow: 'var(--pv-shadow-xs)',
          }}
        >
          <Upload size={shape === 'circle' ? 15 : 20} strokeWidth={2.4} />
        </span>
        {shape === 'square' && (
          <>
            <span className="pv-title text-sm">{label}</span>
            <span className="text-xs font-medium" style={{ color: 'var(--pv-ink-3)' }}>
              {hint}
            </span>
          </>
        )}
      </button>

      {shape === 'square' && (
        <button
          type="button"
          onClick={() => camRef.current?.click()}
          className="pv-press mt-2 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-bold"
          style={{ background: 'var(--pv-surface-2)', color: 'var(--pv-ink)' }}
        >
          <Camera size={16} strokeWidth={2.4} /> Take a photo
        </button>
      )}

      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => ingest(e.target.files)} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => ingest(e.target.files)} />
    </div>
  )
}
