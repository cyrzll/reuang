/**
 * Date and timezone utilities for Asia/Jakarta (WIB, UTC+7)
 */

/**
 * Normalizes MySQL timestamp to true UTC ISO string.
 * MySQL stores order timestamps in Asia/Jakarta time (WIB, UTC+7).
 * When Drizzle reads it with mode: 'date', it tags it with +0000 UTC,
 * causing a +7h shift when converted to Asia/Jakarta.
 * This function extracts the true YMD-HMS components and returns a proper ISO string.
 */
export function normalizeOrderCreatedAt(val: any): string {
  if (!val) return new Date().toISOString()
  if (val instanceof Date) {
    const y = val.getUTCFullYear()
    const m = String(val.getUTCMonth() + 1).padStart(2, '0')
    const d = String(val.getUTCDate()).padStart(2, '0')
    const h = String(val.getUTCHours()).padStart(2, '0')
    const min = String(val.getUTCMinutes()).padStart(2, '0')
    const s = String(val.getUTCSeconds()).padStart(2, '0')
    const trueDate = new Date(`${y}-${m}-${d}T${h}:${min}:${s}+07:00`)
    return trueDate.toISOString()
  }
  if (typeof val === 'string') {
    const trimmed = val.trim()
    const mysqlMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
    if (mysqlMatch && !trimmed.includes('+') && !trimmed.endsWith('Z')) {
      const trueDate = new Date(`${mysqlMatch[1]}-${mysqlMatch[2]}-${mysqlMatch[3]}T${mysqlMatch[4]}:${mysqlMatch[5]}:${mysqlMatch[6]}+07:00`)
      return trueDate.toISOString()
    }
    const d = new Date(trimmed)
    if (!isNaN(d.getTime())) return d.toISOString()
  }
  return new Date().toISOString()
}

/**
 * Formats a Date/timestamp into Indonesian Asia/Jakarta (WIB) representation.
 * Example: '15 Sep 2026, 17.36'
 */
export function formatJakartaDate(val: any): string {
  if (!val) return '-'
  const isoStr = normalizeOrderCreatedAt(val)
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
}
