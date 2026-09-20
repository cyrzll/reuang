/**
 * Real Dataset Generator for Sales Charts
 * Computes charts dynamically from active database orders
 */

import { parseJakartaDate } from '../lib/date'

export interface PeriodChartData {
  labels: string[]
  omset: number[]
  orders: number[]
  totalOmset: number
  totalOrders: number
  avgOrder: number
}

/**
 * Compute real sales and order counts based on actual order_history data
 */
export function computeSalesChartFromOrders(
  ordersList: any[],
  period: '1d' | '1w' | '1m' | '1y' | 'custom',
  selectedMonth: number = new Date().getMonth() + 1,
  selectedYear: number = new Date().getFullYear()
): PeriodChartData {
  const now = new Date()

  if (period === '1d') {
    // 1 Hari: hourly slots (00:00, 03:00, ..., 21:00) for today
    const labels = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00']
    const omset = [0, 0, 0, 0, 0, 0, 0, 0]
    const orders = [0, 0, 0, 0, 0, 0, 0, 0]

    ordersList.forEach((o) => {
      const d = parseJakartaDate(o.rawDate || o.createdAt || o.date)
      if (isNaN(d.getTime())) return
      if (d.toDateString() === now.toDateString()) {
        const slot = Math.min(Math.floor(d.getHours() / 3), 7)
        const total = Number(o.total || o.totalPrice) || 0
        omset[slot] += total
        orders[slot] += 1
      }
    })

    const totalOmset = omset.reduce((a, b) => a + b, 0)
    const totalOrders = orders.reduce((a, b) => a + b, 0)
    const avgOrder = totalOrders > 0 ? Math.round(totalOmset / totalOrders) : 0

    return { labels, omset, orders, totalOmset, totalOrders, avgOrder }
  }

  if (period === '1w') {
    // 1 Minggu: Last 7 days
    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
    const labels: string[] = []
    const dateKeys: string[] = []
    const omset = [0, 0, 0, 0, 0, 0, 0]
    const orders = [0, 0, 0, 0, 0, 0, 0]

    for (let i = 6; i >= 0; i--) {
      const targetDate = new Date(now)
      targetDate.setDate(now.getDate() - i)
      const dayName = dayNames[targetDate.getDay()]
      const dateNum = targetDate.getDate()
      labels.push(`${dayName} (${dateNum})`)
      dateKeys.push(targetDate.toDateString())
    }

    ordersList.forEach((o) => {
      const d = parseJakartaDate(o.rawDate || o.createdAt || o.date)
      if (isNaN(d.getTime())) return
      const idx = dateKeys.indexOf(d.toDateString())
      if (idx !== -1) {
        const total = Number(o.total || o.totalPrice) || 0
        omset[idx] += total
        orders[idx] += 1
      }
    })

    const totalOmset = omset.reduce((a, b) => a + b, 0)
    const totalOrders = orders.reduce((a, b) => a + b, 0)
    const avgOrder = totalOrders > 0 ? Math.round(totalOmset / totalOrders) : 0

    return { labels, omset, orders, totalOmset, totalOrders, avgOrder }
  }

  if (period === '1m') {
    // 1 Bulan: 6 intervals of 5 days
    const monthShort = now.toLocaleDateString('id-ID', { month: 'short' })
    const labels = [
      `1-5 ${monthShort}`,
      `6-10 ${monthShort}`,
      `11-15 ${monthShort}`,
      `16-20 ${monthShort}`,
      `21-25 ${monthShort}`,
      `26-31 ${monthShort}`,
    ]
    const omset = [0, 0, 0, 0, 0, 0]
    const orders = [0, 0, 0, 0, 0, 0]

    ordersList.forEach((o) => {
      const d = parseJakartaDate(o.rawDate || o.createdAt || o.date)
      if (isNaN(d.getTime())) return
      if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
        const dateNum = d.getDate()
        const slot = Math.min(Math.floor((dateNum - 1) / 5), 5)
        const total = Number(o.total || o.totalPrice) || 0
        omset[slot] += total
        orders[slot] += 1
      }
    })

    const totalOmset = omset.reduce((a, b) => a + b, 0)
    const totalOrders = orders.reduce((a, b) => a + b, 0)
    const avgOrder = totalOrders > 0 ? Math.round(totalOmset / totalOrders) : 0

    return { labels, omset, orders, totalOmset, totalOrders, avgOrder }
  }

  if (period === '1y') {
    // 1 Tahun: 12 months for current year
    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
    const omset = new Array(12).fill(0)
    const orders = new Array(12).fill(0)

    ordersList.forEach((o) => {
      const d = parseJakartaDate(o.rawDate || o.createdAt || o.date)
      if (isNaN(d.getTime())) return
      if (d.getFullYear() === now.getFullYear()) {
        const m = d.getMonth()
        const total = Number(o.total || o.totalPrice) || 0
        omset[m] += total
        orders[m] += 1
      }
    })

    const totalOmset = omset.reduce((a, b) => a + b, 0)
    const totalOrders = orders.reduce((a, b) => a + b, 0)
    const avgOrder = totalOrders > 0 ? Math.round(totalOmset / totalOrders) : 0

    return { labels, omset, orders, totalOmset, totalOrders, avgOrder }
  }

  // Custom period: Selected Month and Year
  const labels = ['Minggu 1', 'Minggu 2', 'Minggu 3', 'Minggu 4', 'Minggu 5']
  const omset = [0, 0, 0, 0, 0]
  const orders = [0, 0, 0, 0, 0]

  ordersList.forEach((o) => {
    const d = parseJakartaDate(o.rawDate || o.createdAt || o.date)
    if (isNaN(d.getTime())) return
    if (d.getMonth() === selectedMonth - 1 && d.getFullYear() === selectedYear) {
      const slot = Math.min(Math.floor((d.getDate() - 1) / 7), 4)
      const total = Number(o.total || o.totalPrice) || 0
      omset[slot] += total
      orders[slot] += 1
    }
  })

  const totalOmset = omset.reduce((a, b) => a + b, 0)
  const totalOrders = orders.reduce((a, b) => a + b, 0)
  const avgOrder = totalOrders > 0 ? Math.round(totalOmset / totalOrders) : 0

  return { labels, omset, orders, totalOmset, totalOrders, avgOrder }
}

// Backward compatibility fallback export
export const salesPeriodData: Record<string, PeriodChartData> = {
  '1d': computeSalesChartFromOrders([], '1d'),
  '1w': computeSalesChartFromOrders([], '1w'),
  '1m': computeSalesChartFromOrders([], '1m'),
  '1y': computeSalesChartFromOrders([], '1y'),
}

export function getSpecificMonthYearData(month: number, year: number): PeriodChartData {
  return computeSalesChartFromOrders([], 'custom', month, year)
}
