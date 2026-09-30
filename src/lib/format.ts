export const formatNumber = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US') : '0'

/** 1_234 -> "1.2k", 2_500_000 -> "2.5M" (used in tight spaces like badges). */
export const formatCompactNumber = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0'
  if (Math.abs(value) < 1000) return String(value)

  const units = [
    { limit: 1_000_000_000, suffix: 'B' },
    { limit: 1_000_000, suffix: 'M' },
    { limit: 1_000, suffix: 'k' },
  ]

  for (const unit of units) {
    if (Math.abs(value) >= unit.limit) {
      const scaled = value / unit.limit
      const rounded = scaled >= 10 ? Math.round(scaled) : Math.round(scaled * 10) / 10
      return `${rounded}${unit.suffix}`
    }
  }

  return String(value)
}

export const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`

export const normaliseUrl = (value: string | null | undefined) => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}
