/**
 * 全站日期展示的唯一来源。此前 9 个页面各自写了一遍 `Intl.DateTimeFormat`，
 * 格式互相漂移（有的带年、有的用 `short` 月份、有的不挡 Invalid Date）。
 *
 * 命名按「展示到哪一级」而不是按调用方，避免再出现「某页专用」的格式。
 */
export type DateInput = string | number | Date | null | undefined

const formatters = {
  /** 09/17 18:30 —— 列表与卡片的默认粒度 */
  dayTime: { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false },
  /** 09/17 */
  day: { month: '2-digit', day: '2-digit' },
  /** 9月17日 */
  shortDay: { month: 'short', day: 'numeric' },
  /** 9月17日 18:30 */
  shortDayTime: { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false },
  /** 2026/09/17 */
  fullDay: { year: 'numeric', month: '2-digit', day: '2-digit' },
  /** 2026年9月17日 —— 法律条款、分享页等正式文案 */
  longDay: { year: 'numeric', month: 'long', day: 'numeric' },
} satisfies Record<string, Intl.DateTimeFormatOptions>

export type DateStyle = keyof typeof formatters

const cache = new Map<DateStyle, Intl.DateTimeFormat>()

function formatter(style: DateStyle) {
  const existing = cache.get(style)
  if (existing) return existing
  const created = new Intl.DateTimeFormat('zh-CN', formatters[style])
  cache.set(style, created)
  return created
}

/** 无效或缺失的时间返回 `fallback`，绝不把 `Invalid Date` 呈现给用户。 */
export function formatDate(value: DateInput, style: DateStyle = 'dayTime', fallback = '') {
  if (value === null || value === undefined || value === '') return fallback
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : formatter(style).format(date)
}

export const formatDayTime = (value: DateInput, fallback = '') => formatDate(value, 'dayTime', fallback)
export const formatDay = (value: DateInput, fallback = '') => formatDate(value, 'day', fallback)
export const formatShortDay = (value: DateInput, fallback = '') => formatDate(value, 'shortDay', fallback)
export const formatShortDayTime = (value: DateInput, fallback = '') => formatDate(value, 'shortDayTime', fallback)
export const formatFullDay = (value: DateInput, fallback = '') => formatDate(value, 'fullDay', fallback)
export const formatLongDay = (value: DateInput, fallback = '') => formatDate(value, 'longDay', fallback)
