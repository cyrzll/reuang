/**
 * Utility functions for handling and formatting Asia/Jakarta (WIB) dates
 */

/**
 * Normalizes any date string or Date object into a valid Date in Asia/Jakarta context.
 */
export function parseJakartaDate(val: any): Date {
  if (!val) return new Date()

  if (val instanceof Date) {
    return val
  }

  const str = String(val).trim()
  if (!str) return new Date()

  // If it's a raw MySQL timestamp format 'YYYY-MM-DD HH:mm:ss' without timezone
  const mysqlMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (mysqlMatch && !str.includes('+') && !str.endsWith('Z')) {
    return new Date(`${mysqlMatch[1]}-${mysqlMatch[2]}-${mysqlMatch[3]}T${mysqlMatch[4]}:${mysqlMatch[5]}:${mysqlMatch[6]}+07:00`)
  }

  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    return parsed
  }

  return new Date()
}

/**
 * Formats a date/timestamp to Indonesian Asia/Jakarta (WIB) representation.
 * Example output: "15 Sep 2026, 17.36"
 */
export function formatJakartaDate(
  val: any,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!val) return '-'

  const d = parseJakartaDate(val)
  if (isNaN(d.getTime())) return '-'

  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...options,
  }

  return d.toLocaleString('id-ID', defaultOptions)
}
