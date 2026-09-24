import { xinyueLocale } from '@/locales/xinyue'

export function formatDateTime(value?: string | number | Date | null, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime())
    ? fallback
    : new Intl.DateTimeFormat(xinyueLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(
        date
      )
}

export function formatMoneyCents(
  value: number | null | undefined,
  currency = 'CNY',
  fallback = '—'
) {
  if (!Number.isFinite(Number(value))) return fallback
  return new Intl.NumberFormat(xinyueLocale(), { style: 'currency', currency }).format(
    Number(value) / 100
  )
}

export function formatCompactNumber(value: number | null | undefined, fallback = '0') {
  if (!Number.isFinite(Number(value))) return fallback
  return new Intl.NumberFormat(xinyueLocale(), {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(Number(value))
}

export function formatMicrosCny(value: number | null | undefined, fallback = '—') {
  if (!Number.isFinite(Number(value))) return fallback
  return `¥${(Number(value) / 1_000_000).toFixed(2)}`
}
