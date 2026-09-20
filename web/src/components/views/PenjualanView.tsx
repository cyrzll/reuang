import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search,
  TrendingUp,
  CheckCircle2,
  ShoppingBag,
  RefreshCw,
  ChevronRight,
  Calendar,
  Download,
  FileSpreadsheet,
  X,
  Wallet,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { SalesChart } from './SalesChart'
import { apiFetch, API_BASE } from '../../lib/api'
import { getAuthToken } from '../../lib/jwt'
import { formatJakartaDate, parseJakartaDate } from '../../lib/date'

const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]

export interface SaleOrderItem {
  name: string
  qty: number
  price: number
  modal: number
}

export interface SaleOrder {
  id: string
  dbId?: number
  customer: string
  phone: string
  items: SaleOrderItem[]
  itemSummary: string
  qty: number
  total: number
  totalModal: number
  profit: number
  status: 'selesai'
  rawStatus: string
  paymentMethod: string
  date: string
  rawDate: string
}

export interface DateGroup {
  dateKey: string
  label: string
  isCurrentDay: boolean
  isYesterday: boolean
  totalOmset: number
  totalOrders: number
  totalQty: number
  orders: SaleOrder[]
}

export interface MonthGroup {
  monthKey: string
  label: string
  totalOmset: number
  totalOrders: number
  totalQty: number
  dates: DateGroup[]
}

export const PenjualanView: React.FC = () => {
  const [sales, setSales] = useState<SaleOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({})
  const [openDates, setOpenDates] = useState<Record<string, boolean>>({})

  // Period-filtered sales from chart
  const [periodSales, setPeriodSales] = useState<SaleOrder[] | null>(null)

  // Export to Excel States
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportType, setExportType] = useState<'hari' | 'minggu' | 'bulan'>('hari')

  const now = new Date()
  const todayKeyWib = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  const [exportDate, setExportDate] = useState(todayKeyWib)
  const [exportMonth, setExportMonth] = useState<number>(() => {
    const m = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', month: 'numeric' }).format(now))
    return m || 9
  })
  const [exportYear, setExportYear] = useState<number>(() => {
    const y = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric' }).format(now))
    return y || 2026
  })
  const [exportWeekNumber, setExportWeekNumber] = useState<number>(1)

  const loadSalesOrders = async (silent = false) => {
    if (silent) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }
    try {
      const res = await apiFetch<any>('/orders')
      if (res.success && Array.isArray(res.data)) {
        // Hanya masukkan pesanan yang masuk dan dicatat dari pelanggan WhatsApp jika status = selesai
        const completedData = res.data.filter((d: any) => {
          const st = String(d.orderStatus || '').toLowerCase().trim()
          return st === 'selesai' || st === 'completed'
        })

        const mapped: SaleOrder[] = completedData.map((d: any) => {
          const rawDate = d.createdAt ? String(d.createdAt) : new Date().toISOString()
          const dateFormatted = formatJakartaDate(rawDate)

          // Parse items
          let items: SaleOrderItem[] = []
          if (Array.isArray(d.items)) {
            items = d.items.map((it: any) => ({
              name: it.name || 'Produk',
              qty: Number(it.qty) || 1,
              price: Number(it.price) || 0,
              modal: Number(it.modal) || 0,
            }))
          } else if (typeof d.orderItems === 'string') {
            try {
              const parsed = JSON.parse(d.orderItems)
              if (Array.isArray(parsed)) {
                items = parsed.map((it: any) => ({
                  name: it.name || 'Produk',
                  qty: Number(it.qty) || 1,
                  price: Number(it.price) || 0,
                  modal: Number(it.modal) || 0,
                }))
              }
            } catch {
              items = []
            }
          }

          const totalQty = items.reduce((acc, it) => acc + (it.qty || 1), 0)
          const totalModal = items.reduce((acc, it) => acc + (it.modal || 0) * (it.qty || 1), 0)
          const itemSummary =
            items.length > 0
              ? items.map((it) => `${it.name} (${it.qty}x)`).join(', ')
              : d.orderItems && typeof d.orderItems === 'string'
              ? d.orderItems
              : 'Pesanan WhatsApp'

          const formatCustomerPhone = (phoneJid?: string | null, lidJid?: string | null): string => {
            if (phoneJid) {
              const raw = phoneJid.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '')
              if (raw.startsWith('62')) {
                return `+62 ${raw.slice(2, 5)}-${raw.slice(5, 9)}-${raw.slice(9)}`
              }
              return raw ? `+${raw}` : phoneJid
            }
            if (lidJid) {
              return lidJid.replace('@lid', '')
            }
            return '-'
          }

          return {
            id: d.orderUid || (d.id ? `ORD-${d.id}` : '-'),
            dbId: d.id,
            customer: d.customerName || 'Pelanggan WhatsApp',
            phone: formatCustomerPhone(d.phoneJid, d.lidJid),
            items,
            itemSummary,
            qty: totalQty || 1,
            total: Number(d.totalPrice) || 0,
            totalModal,
            profit: (Number(d.totalPrice) || 0) - totalModal,
            status: 'selesai',
            rawStatus: d.orderStatus || 'selesai',
            paymentMethod: d.paymentMethod === 'transfer' ? 'Transfer Bank' : d.paymentMethod || 'Transfer Bank',
            date: dateFormatted,
            rawDate,
          }
        })
        setSales(mapped)
      } else {
        if (!silent) setSales([])
      }
    } catch (err) {
      console.warn('[PenjualanView] Failed to load completed orders from API:', err)
      if (!silent) setSales([])
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    loadSalesOrders(false)

    // Setup real-time listener for newly completed orders
    let eventSource: EventSource | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let pollInterval: ReturnType<typeof setInterval> | null = null
    let isMounted = true

    const connectSSE = () => {
      const token = getAuthToken()
      if (!token) return

      try {
        const sseUrl = `${API_BASE}/orders/events?token=${encodeURIComponent(token)}`
        eventSource = new EventSource(sseUrl)

        eventSource.addEventListener('order_update', () => {
          if (!isMounted) return
          loadSalesOrders(true)
        })

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close()
            eventSource = null
          }
          if (isMounted) {
            reconnectTimeout = setTimeout(connectSSE, 5000)
          }
        }
      } catch (err) {
        console.warn('[PenjualanView] Realtime SSE error:', err)
      }
    }

    connectSSE()

    pollInterval = setInterval(() => {
      if (isMounted) {
        loadSalesOrders(true)
      }
    }, 15000)

    return () => {
      isMounted = false
      if (eventSource) {
        eventSource.close()
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
      if (pollInterval) {
        clearInterval(pollInterval)
      }
    }
  }, [])

  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      const q = search.toLowerCase()
      const matchQuery =
        s.customer.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.phone.includes(q) ||
        s.itemSummary.toLowerCase().includes(q)

      return matchQuery
    })
  }, [sales, search])

  // Real aggregations — based on chart period
  const statsSales = periodSales ?? sales
  const totalOmset = useMemo(() => statsSales.reduce((acc, curr) => acc + curr.total, 0), [statsSales])
  const countSelesai = statsSales.length
  const totalQtySold = useMemo(() => statsSales.reduce((acc, curr) => acc + curr.qty, 0), [statsSales])
  const totalModalAll = useMemo(() => statsSales.reduce((acc, curr) => acc + curr.totalModal, 0), [statsSales])
  const totalProfit = useMemo(() => totalOmset - totalModalAll, [totalOmset, totalModalAll])

  // Callback from SalesChart when period changes
  const handlePeriodStats = useCallback((filteredOrders: any[]) => {
    // Map the raw filtered orders back to SaleOrder format by matching IDs
    const idSet = new Set(filteredOrders.map((o: any) => o.id || o.dbId))
    const matched = sales.filter((s) => {
      // Match by id string or dbId
      return idSet.has(s.id) || idSet.has(s.dbId)
    })
    // If matching by ID doesn't work well, fall back to rawDate-based matching
    if (matched.length === 0 && filteredOrders.length > 0) {
      const rawDates = new Set(filteredOrders.map((o: any) => o.rawDate || o.createdAt || o.date))
      const byDate = sales.filter((s) => rawDates.has(s.rawDate))
      setPeriodSales(byDate)
    } else {
      setPeriodSales(matched)
    }
  }, [sales])

  // Hierarchical grouping: Month -> Date -> Orders
  const groupedSales = useMemo<MonthGroup[]>(() => {
    const monthMap: Record<
      string,
      {
        monthKey: string
        label: string
        totalOmset: number
        totalOrders: number
        totalQty: number
        dateMap: Record<
          string,
          {
            dateKey: string
            label: string
            isCurrentDay: boolean
            isYesterday: boolean
            totalOmset: number
            totalQty: number
            orders: SaleOrder[]
          }
        >
      }
    > = {}

    const now = new Date()
    const todayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)

    const yesterdayDate = new Date(now)
    yesterdayDate.setDate(yesterdayDate.getDate() - 1)
    const yesterdayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(yesterdayDate)

    filteredSales.forEach((s) => {
      const d = parseJakartaDate(s.rawDate)

      // Month Key: 'YYYY-MM'
      const monthKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
      }).format(d)

      // Month Label: e.g. 'September 2026'
      const monthLabel = d.toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        month: 'long',
        year: 'numeric',
      })

      // Date Key: 'YYYY-MM-DD'
      const dateKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d)

      // Date Label: e.g. 'Rabu, 16 September 2026'
      const dateLabel = d.toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })

      if (!monthMap[monthKey]) {
        monthMap[monthKey] = {
          monthKey,
          label: monthLabel,
          totalOmset: 0,
          totalOrders: 0,
          totalQty: 0,
          dateMap: {},
        }
      }

      monthMap[monthKey].totalOmset += s.total
      monthMap[monthKey].totalOrders += 1
      monthMap[monthKey].totalQty += s.qty

      if (!monthMap[monthKey].dateMap[dateKey]) {
        monthMap[monthKey].dateMap[dateKey] = {
          dateKey,
          label: dateLabel,
          isCurrentDay: dateKey === todayKey,
          isYesterday: dateKey === yesterdayKey,
          totalOmset: 0,
          totalQty: 0,
          orders: [],
        }
      }

      monthMap[monthKey].dateMap[dateKey].totalOmset += s.total
      monthMap[monthKey].dateMap[dateKey].totalQty += s.qty
      monthMap[monthKey].dateMap[dateKey].orders.push(s)
    })

    // Sort months descending (newest month first)
    const sortedMonthKeys = Object.keys(monthMap).sort((a, b) => b.localeCompare(a))

    return sortedMonthKeys.map((mKey) => {
      const m = monthMap[mKey]
      // Sort dates descending (newest date first)
      const sortedDateKeys = Object.keys(m.dateMap).sort((a, b) => b.localeCompare(a))
      const dates: DateGroup[] = sortedDateKeys.map((dKey) => {
        const dg = m.dateMap[dKey]
        // Sort orders inside date descending by rawDate / id
        const sortedOrders = [...dg.orders].sort((a, b) => {
          const timeA = new Date(a.rawDate).getTime()
          const timeB = new Date(b.rawDate).getTime()
          return timeB - timeA
        })
        return {
          ...dg,
          totalOrders: sortedOrders.length,
          orders: sortedOrders,
        }
      })

      return {
        monthKey: m.monthKey,
        label: m.label,
        totalOmset: m.totalOmset,
        totalOrders: m.totalOrders,
        totalQty: m.totalQty,
        dates,
      }
    })
  }, [filteredSales])

  // Accordion open/close logic
  const isMonthOpen = (monthKey: string, isFirstMonth: boolean): boolean => {
    if (search.trim() !== '') return true
    if (openMonths[monthKey] !== undefined) {
      return openMonths[monthKey]
    }
    return isFirstMonth
  }

  const toggleMonth = (monthKey: string, isFirstMonth: boolean) => {
    setOpenMonths((prev) => ({
      ...prev,
      [monthKey]: !isMonthOpen(monthKey, isFirstMonth),
    }))
  }

  const isDateOpen = (dateKey: string, isFirstDate: boolean): boolean => {
    if (search.trim() !== '') return true
    if (openDates[dateKey] !== undefined) {
      return openDates[dateKey]
    }
    return isFirstDate
  }

  const toggleDate = (dateKey: string, isFirstDate: boolean) => {
    setOpenDates((prev) => ({
      ...prev,
      [dateKey]: !isDateOpen(dateKey, isFirstDate),
    }))
  }

  // Years available for selection in export
  const availableYears = useMemo(() => {
    const setYears = new Set<number>()
    setYears.add(exportYear)
    setYears.add(2025)
    setYears.add(2026)
    setYears.add(2027)
    sales.forEach((s) => {
      const d = parseJakartaDate(s.rawDate)
      setYears.add(d.getFullYear())
    })
    return Array.from(setYears).sort((a, b) => b - a)
  }, [sales, exportYear])

  // Compute weeks of the selected month
  const availableWeeks = useMemo(() => {
    const totalDays = new Date(exportYear, exportMonth, 0).getDate()
    const monthName = MONTH_NAMES[exportMonth - 1] || ''
    const weeks = [
      { week: 1, startDay: 1, endDay: 7, label: `Minggu 1 (1 - 7 ${monthName} ${exportYear})` },
      { week: 2, startDay: 8, endDay: 14, label: `Minggu 2 (8 - 14 ${monthName} ${exportYear})` },
      { week: 3, startDay: 15, endDay: 21, label: `Minggu 3 (15 - 21 ${monthName} ${exportYear})` },
      { week: 4, startDay: 22, endDay: 28, label: `Minggu 4 (22 - 28 ${monthName} ${exportYear})` },
    ]
    if (totalDays >= 29) {
      weeks.push({
        week: 5,
        startDay: 29,
        endDay: totalDays,
        label: `Minggu 5 (29 - ${totalDays} ${monthName} ${exportYear})`,
      })
    }
    return weeks
  }, [exportYear, exportMonth])

  // Reset exportWeekNumber if it exceeds available weeks
  useEffect(() => {
    if (exportWeekNumber > availableWeeks.length) {
      setExportWeekNumber(1)
    }
  }, [availableWeeks, exportWeekNumber])

  // Filter sales based on selected export period
  const { filteredExportSales, exportPeriodTitle, exportFilename } = useMemo(() => {
    if (exportType === 'hari') {
      const selected = sales.filter((s) => {
        const d = parseJakartaDate(s.rawDate)
        const dateKey = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Jakarta',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(d)
        return dateKey === exportDate
      })

      const dateParts = exportDate ? exportDate.split('-') : []
      let dateLabel = exportDate || '-'
      if (dateParts.length === 3) {
        const dObj = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]))
        dateLabel = dObj.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      }

      const title = `Harian: ${dateLabel}`
      const filename = `Laporan_Penjualan_Harian_${exportDate}`

      return { filteredExportSales: selected, exportPeriodTitle: title, exportFilename: filename }
    }

    if (exportType === 'minggu') {
      const currentWeekObj = availableWeeks.find((w) => w.week === exportWeekNumber) || availableWeeks[0]
      const selected = sales.filter((s) => {
        const d = parseJakartaDate(s.rawDate)
        const year = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric' }).format(d))
        const month = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', month: 'numeric' }).format(d))
        const day = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', day: 'numeric' }).format(d))

        return (
          year === exportYear &&
          month === exportMonth &&
          day >= currentWeekObj.startDay &&
          day <= currentWeekObj.endDay
        )
      })

      const title = `Mingguan: ${currentWeekObj.label}`
      const filename = `Laporan_Penjualan_Minggu${currentWeekObj.week}_${MONTH_NAMES[exportMonth - 1]}_${exportYear}`

      return { filteredExportSales: selected, exportPeriodTitle: title, exportFilename: filename }
    }

    // exportType === 'bulan'
    const targetMonthKey = `${exportYear}-${String(exportMonth).padStart(2, '0')}`
    const selected = sales.filter((s) => {
      const d = parseJakartaDate(s.rawDate)
      const monthKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
      }).format(d)
      return monthKey === targetMonthKey
    })

    const title = `Bulanan: ${MONTH_NAMES[exportMonth - 1]} ${exportYear}`
    const filename = `Laporan_Penjualan_Bulanan_${MONTH_NAMES[exportMonth - 1]}_${exportYear}`

    return { filteredExportSales: selected, exportPeriodTitle: title, exportFilename: filename }
  }, [sales, exportType, exportDate, exportYear, exportMonth, exportWeekNumber, availableWeeks])

  const exportTotalOmset = useMemo(
    () => filteredExportSales.reduce((acc, curr) => acc + curr.total, 0),
    [filteredExportSales]
  )
  const exportTotalQty = useMemo(
    () => filteredExportSales.reduce((acc, curr) => acc + curr.qty, 0),
    [filteredExportSales]
  )
  const exportTotalModal = useMemo(
    () => filteredExportSales.reduce((acc, curr) => acc + curr.totalModal, 0),
    [filteredExportSales]
  )
  const exportTotalProfit = useMemo(
    () => exportTotalOmset - exportTotalModal,
    [exportTotalOmset, exportTotalModal]
  )

  const handleDownloadExcel = () => {
    if (filteredExportSales.length === 0) return

    const nowFormatted = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'full',
      timeStyle: 'medium',
    }).format(new Date())

    const rowsHtml = filteredExportSales
      .map((s, idx) => {
        const itemDesc =
          s.items.length > 0
            ? s.items.map((it) => `${it.name} (${it.qty}x)`).join(', ')
            : s.itemSummary

        return `
          <tr>
            <td style="text-align: center; border: 1px solid #d4d4d8; padding: 6px 8px;">${idx + 1}</td>
            <td style="border: 1px solid #d4d4d8; padding: 6px 8px; font-family: monospace;">${s.id}</td>
            <td style="border: 1px solid #d4d4d8; padding: 6px 8px;">${s.date}</td>
            <td style="border: 1px solid #d4d4d8; padding: 6px 8px;">${s.customer}</td>
            <td style="border: 1px solid #d4d4d8; padding: 6px 8px; font-family: monospace;">${s.phone}</td>
            <td style="border: 1px solid #d4d4d8; padding: 6px 8px;">${itemDesc}</td>
            <td style="text-align: center; border: 1px solid #d4d4d8; padding: 6px 8px; font-family: monospace;">${s.qty}</td>
            <td style="text-align: center; border: 1px solid #d4d4d8; padding: 6px 8px;">${s.paymentMethod}</td>
            <td style="text-align: right; border: 1px solid #d4d4d8; padding: 6px 8px; font-family: monospace;">Rp ${s.total.toLocaleString('id-ID')}</td>
            <td style="text-align: right; border: 1px solid #d4d4d8; padding: 6px 8px; font-family: monospace;">Rp ${s.totalModal.toLocaleString('id-ID')}</td>
            <td style="text-align: right; border: 1px solid #d4d4d8; padding: 6px 8px; font-family: monospace; ${s.profit >= 0 ? 'color: #166534;' : 'color: #991b1b;'}">Rp ${s.profit.toLocaleString('id-ID')}</td>
            <td style="text-align: center; border: 1px solid #d4d4d8; padding: 6px 8px; font-weight: 500;">Selesai</td>
          </tr>
        `
      })
      .join('')

    const excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8"/>
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Laporan Penjualan</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #18181b; }
          .title { font-size: 15pt; font-weight: bold; color: #09090b; }
          .subtitle { font-size: 11pt; color: #52525b; margin-bottom: 8px; }
          th { background-color: #18181b; color: #ffffff; font-weight: bold; border: 1px solid #3f3f46; padding: 8px 10px; font-size: 10pt; }
          td { border: 1px solid #e4e4e7; padding: 6px 8px; font-size: 10pt; }
          .total-row { background-color: #f4f4f5; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="title">LAPORAN PENJUALAN</div>
        <div class="subtitle">${exportPeriodTitle}</div>
        <div style="font-size: 9pt; color: #71717a; margin-bottom: 12px;">Waktu Ekspor: ${nowFormatted} WIB | Total Transaksi: ${filteredExportSales.length} | Omset: Rp ${exportTotalOmset.toLocaleString('id-ID')} | Modal: Rp ${exportTotalModal.toLocaleString('id-ID')} | Untung Bersih: Rp ${exportTotalProfit.toLocaleString('id-ID')}</div>
        <br/>
        <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
          <thead>
            <tr>
              <th style="background-color: #18181b; color: #ffffff; text-align: center;">No</th>
              <th style="background-color: #18181b; color: #ffffff; text-align: left;">No. Order</th>
              <th style="background-color: #18181b; color: #ffffff; text-align: left;">Waktu (WIB)</th>
              <th style="background-color: #18181b; color: #ffffff; text-align: left;">Pelanggan</th>
              <th style="background-color: #18181b; color: #ffffff; text-align: left;">No. WhatsApp</th>
              <th style="background-color: #18181b; color: #ffffff; text-align: left;">Produk Dipesan</th>
              <th style="background-color: #18181b; color: #ffffff; text-align: center;">Total Qty</th>
              <th style="background-color: #18181b; color: #ffffff; text-align: center;">Metode Bayar</th>
              <th style="background-color: #18181b; color: #ffffff; text-align: right;">Total Penjualan</th>
              <th style="background-color: #18181b; color: #ffffff; text-align: right;">Total Modal</th>
              <th style="background-color: #18181b; color: #ffffff; text-align: right;">Untung Bersih</th>
              <th style="background-color: #18181b; color: #ffffff; text-align: center;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="total-row" style="background-color: #f4f4f5; font-weight: bold;">
              <td colspan="6" style="text-align: right; border: 1px solid #a1a1aa; padding: 8px; font-weight: bold;">TOTAL KESELURUHAN:</td>
              <td style="text-align: center; border: 1px solid #a1a1aa; padding: 8px; font-family: monospace; font-weight: bold;">${exportTotalQty} pcs</td>
              <td style="border: 1px solid #a1a1aa; padding: 8px;"></td>
              <td style="text-align: right; border: 1px solid #a1a1aa; padding: 8px; font-family: monospace; font-weight: bold;">Rp ${exportTotalOmset.toLocaleString('id-ID')}</td>
              <td style="text-align: right; border: 1px solid #a1a1aa; padding: 8px; font-family: monospace; font-weight: bold;">Rp ${exportTotalModal.toLocaleString('id-ID')}</td>
              <td style="text-align: right; border: 1px solid #a1a1aa; padding: 8px; font-family: monospace; font-weight: bold; ${exportTotalProfit >= 0 ? 'color: #166534;' : 'color: #991b1b;'}">Rp ${exportTotalProfit.toLocaleString('id-ID')}</td>
              <td style="border: 1px solid #a1a1aa; padding: 8px;"></td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `

    const blob = new Blob(['\ufeff' + excelHtml], {
      type: 'application/vnd.ms-excel;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${exportFilename}.xls`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    setShowExportModal(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/80 pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-950">Data Penjualan</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Riwayat pemesanan selesai dari pelanggan WhatsApp
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowExportModal(true)}
            className="text-xs"
          >
            <Download className="w-3.5 h-3.5 text-zinc-700" />
            <span>Ekspor ke Excel</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadSalesOrders(false)}
            disabled={isLoading || isRefreshing}
            className="text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading || isRefreshing ? 'animate-spin' : ''}`} />
            <span>Muat Ulang</span>
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-xs border-zinc-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-500">Total Omset</CardTitle>
            <TrendingUp className="w-4 h-4 text-zinc-700" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold font-mono tracking-tight text-zinc-950">
              Rp {totalOmset.toLocaleString('id-ID')}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1 font-mono">{countSelesai} transaksi tuntas</p>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-zinc-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-500">Pesanan Selesai</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-zinc-700" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold font-mono tracking-tight text-zinc-950">
              {countSelesai} Pesanan
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Pembayaran & pengiriman tuntas</p>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-zinc-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-500">Produk Terjual</CardTitle>
            <ShoppingBag className="w-4 h-4 text-zinc-700" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold font-mono tracking-tight text-zinc-950">
              {totalQtySold} Pcs
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Total unit produk terjual</p>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-zinc-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-500">Untung Bersih</CardTitle>
            <Wallet className="w-4 h-4 text-zinc-700" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold font-mono tracking-tight text-zinc-950">
              Rp {totalProfit.toLocaleString('id-ID')}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1 font-mono">Modal: Rp {totalModalAll.toLocaleString('id-ID')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Sales Trend Chart connected to completed orders */}
      <SalesChart orders={sales} onPeriodStats={handlePeriodStats} />

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nomor order, nama pelanggan, produk..."
            className="pl-8 text-xs border-zinc-200"
          />
        </div>
        <div className="text-xs text-zinc-500 font-mono">
          {filteredSales.length} transaksi selesai
        </div>
      </div>

      {/* Month & Date Accordions */}
      <div className="space-y-4">
        {isLoading && sales.length === 0 ? (
          <Card className="p-8 text-center text-zinc-500 border-zinc-200">
            <div className="inline-flex items-center gap-2 text-xs">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-400" />
              <span>Memuat data penjualan...</span>
            </div>
          </Card>
        ) : groupedSales.length === 0 ? (
          <Card className="p-8 text-center text-zinc-500 border-zinc-200">
            <p className="text-xs">
              {search
                ? 'Tidak ada pesanan selesai yang sesuai dengan filter pencarian.'
                : 'Belum ada transaksi dengan status selesai dari pelanggan WhatsApp.'}
            </p>
          </Card>
        ) : (
          groupedSales.map((m, mIdx) => {
            const monthIsOpen = isMonthOpen(m.monthKey, mIdx === 0)
            return (
              <Card key={m.monthKey} className="border-zinc-200 overflow-hidden shadow-xs">
                {/* Month Accordion Header */}
                <button
                  type="button"
                  onClick={() => toggleMonth(m.monthKey, mIdx === 0)}
                  className="w-full px-4 py-3.5 flex items-center justify-between bg-zinc-50 hover:bg-zinc-100/70 transition-colors text-left select-none cursor-pointer border-b border-zinc-200/80"
                >
                  <div className="flex items-center gap-2.5">
                    <ChevronRight
                      className={`w-4 h-4 text-zinc-600 transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                        monthIsOpen ? 'rotate-90 text-zinc-950' : 'rotate-0 text-zinc-400'
                      }`}
                    />
                    <Calendar className="w-4 h-4 text-zinc-800" />
                    <span className="font-semibold text-zinc-950 text-sm">{m.label}</span>
                    <Badge
                      variant="outline"
                      className="text-[11px] font-normal border-zinc-300 text-zinc-700 bg-white"
                    >
                      {m.totalOrders} Transaksi
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <span className="text-xs font-mono text-zinc-500 hidden sm:inline">
                      {m.totalQty} pcs
                    </span>
                    <span className="text-sm font-semibold font-mono text-zinc-950">
                      Rp {m.totalOmset.toLocaleString('id-ID')}
                    </span>
                  </div>
                </button>

                {/* Month Accordion Content: Dates with Smooth Grid Transition */}
                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                    monthIsOpen
                      ? 'grid-rows-[1fr] opacity-100'
                      : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="p-3.5 space-y-3 bg-white">
                      {m.dates.map((d, dIdx) => {
                        const dateIsOpen = isDateOpen(d.dateKey, dIdx === 0)
                        return (
                          <div
                            key={d.dateKey}
                            className="border border-zinc-200 rounded-lg overflow-hidden bg-white"
                          >
                            {/* Date Accordion Header */}
                            <button
                              type="button"
                              onClick={() => toggleDate(d.dateKey, dIdx === 0)}
                              className="w-full px-3.5 py-2.5 flex items-center justify-between bg-zinc-50/70 hover:bg-zinc-100/70 transition-colors text-left select-none cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <ChevronRight
                                  className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                                    dateIsOpen ? 'rotate-90 text-zinc-950' : 'rotate-0 text-zinc-400'
                                  }`}
                                />
                                <span className="text-xs font-medium text-zinc-900">{d.label}</span>
                                {d.isCurrentDay && (
                                  <Badge className="bg-zinc-900 text-white text-[10px] px-1.5 py-0 border-0">
                                    Hari Ini
                                  </Badge>
                                )}
                                {d.isYesterday && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0 border-zinc-300 text-zinc-600"
                                  >
                                    Kemarin
                                  </Badge>
                                )}
                                <span className="text-[11px] font-mono text-zinc-500">
                                  ({d.orders.length} pesanan)
                                </span>
                              </div>
                              <div className="flex items-center gap-2.5 text-right">
                                <span className="text-[11px] font-mono text-zinc-500 hidden sm:inline">
                                  {d.totalQty} pcs
                                </span>
                                <span className="text-xs font-semibold font-mono text-zinc-900">
                                  Rp {d.totalOmset.toLocaleString('id-ID')}
                                </span>
                              </div>
                            </button>

                            {/* Date Accordion Content: Table of orders with Smooth Grid Transition */}
                            <div
                              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                                dateIsOpen
                                  ? 'grid-rows-[1fr] opacity-100'
                                  : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                              }`}
                            >
                              <div className="overflow-hidden">
                                <div className="border-t border-zinc-200/80 overflow-x-auto">
                                  <table className="w-full text-xs text-left">
                                    <thead className="bg-zinc-50/50 border-b border-zinc-200/60 text-zinc-500 font-medium uppercase tracking-wider text-[10px]">
                                      <tr>
                                        <th className="px-4 py-2.5 font-mono">No. Order</th>
                                        <th className="px-4 py-2.5">Pelanggan</th>
                                        <th className="px-4 py-2.5">Produk Dipesan</th>
                                        <th className="px-4 py-2.5 text-center">Jumlah</th>
                                        <th className="px-4 py-2.5 text-right">Total</th>
                                        <th className="px-4 py-2.5 text-center">Status</th>
                                        <th className="px-4 py-2.5">Waktu</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-200/60">
                                      {d.orders.map((s) => (
                                        <tr
                                          key={s.id}
                                          className="hover:bg-zinc-50/50 transition-colors"
                                        >
                                          <td className="px-4 py-3 font-mono font-medium text-zinc-900 text-[11px] whitespace-nowrap">
                                            {s.id}
                                          </td>
                                          <td className="px-4 py-3">
                                            <div className="font-medium text-zinc-900">{s.customer}</div>
                                            <div className="font-mono text-[11px] text-zinc-500">
                                              {s.phone}
                                            </div>
                                          </td>
                                          <td className="px-4 py-3 text-zinc-700">
                                            {s.items && s.items.length > 0 ? (
                                              <div className="space-y-0.5">
                                                {s.items.map((it, idx) => (
                                                  <div key={idx} className="text-zinc-800">
                                                    {it.name}{' '}
                                                    <span className="font-mono text-zinc-500 text-[11px]">
                                                      x{it.qty}
                                                    </span>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : (
                                              <span>{s.itemSummary}</span>
                                            )}
                                          </td>
                                          <td className="px-4 py-3 text-center font-mono text-zinc-700 whitespace-nowrap">
                                            {s.qty} pcs
                                          </td>
                                          <td className="px-4 py-3 text-right whitespace-nowrap">
                                            <div className="font-mono font-medium text-zinc-900">
                                              Rp {s.total.toLocaleString('id-ID')}
                                            </div>
                                            <div className="text-[10px] text-zinc-400 font-normal">
                                              {s.paymentMethod}
                                            </div>
                                          </td>
                                          <td className="px-4 py-3 text-center whitespace-nowrap">
                                            <Badge className="bg-zinc-900 text-white hover:bg-zinc-800 text-[10px] px-2 py-0.5 font-medium border-0">
                                              Selesai
                                            </Badge>
                                          </td>
                                          <td className="px-4 py-3 text-zinc-500 text-[11px] whitespace-nowrap">
                                            {s.date}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </Card>
            )
          })
        )}
      </div>

      {/* Export to Excel Modal */}
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
          showExportModal
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
        style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
        onClick={() => setShowExportModal(false)}
      />
      {/* Modal Panel */}
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
          showExportModal
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          className={`bg-white border border-zinc-200 rounded-xl shadow-xl w-full max-w-md transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
            showExportModal ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-zinc-700" />
              <h2 className="text-sm font-semibold text-zinc-950">Ekspor ke Excel</h2>
            </div>
            <button
              onClick={() => setShowExportModal(false)}
              className="p-1 rounded-md hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4 text-zinc-500" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="px-5 py-4 space-y-4">
            {/* Period Type Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-700">Periode</label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-100 rounded-lg">
                {(['hari', 'minggu', 'bulan'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setExportType(t)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 cursor-pointer ${
                      exportType === t
                        ? 'bg-zinc-900 text-white shadow-sm'
                        : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60'
                    }`}
                  >
                    {t === 'hari' ? 'Per Hari' : t === 'minggu' ? 'Per Minggu' : 'Per Bulan'}
                  </button>
                ))}
              </div>
            </div>

            {/* Per Hari: Date Picker */}
            {exportType === 'hari' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700">Pilih Tanggal</label>
                <Input
                  type="date"
                  value={exportDate}
                  onChange={(e) => setExportDate(e.target.value)}
                  className="text-xs border-zinc-200"
                />
              </div>
            )}

            {/* Per Minggu: Year, Month, Week selection */}
            {exportType === 'minggu' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-700">Tahun</label>
                    <select
                      value={exportYear}
                      onChange={(e) => setExportYear(Number(e.target.value))}
                      className="w-full h-9 px-3 text-xs border border-zinc-200 rounded-md bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 transition-colors"
                    >
                      {availableYears.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-700">Bulan</label>
                    <select
                      value={exportMonth}
                      onChange={(e) => setExportMonth(Number(e.target.value))}
                      className="w-full h-9 px-3 text-xs border border-zinc-200 rounded-md bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 transition-colors"
                    >
                      {MONTH_NAMES.map((name, idx) => (
                        <option key={idx} value={idx + 1}>{name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-700">Pilih Minggu</label>
                  <select
                    value={exportWeekNumber}
                    onChange={(e) => setExportWeekNumber(Number(e.target.value))}
                    className="w-full h-9 px-3 text-xs border border-zinc-200 rounded-md bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 transition-colors"
                  >
                    {availableWeeks.map((w) => (
                      <option key={w.week} value={w.week}>{w.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Per Bulan: Year & Month selection */}
            {exportType === 'bulan' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-700">Tahun</label>
                  <select
                    value={exportYear}
                    onChange={(e) => setExportYear(Number(e.target.value))}
                    className="w-full h-9 px-3 text-xs border border-zinc-200 rounded-md bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 transition-colors"
                  >
                    {availableYears.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-700">Bulan</label>
                  <select
                    value={exportMonth}
                    onChange={(e) => setExportMonth(Number(e.target.value))}
                    className="w-full h-9 px-3 text-xs border border-zinc-200 rounded-md bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 transition-colors"
                  >
                    {MONTH_NAMES.map((name, idx) => (
                      <option key={idx} value={idx + 1}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Preview Info */}
            <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-50 rounded-lg border border-zinc-200/80">
              <span className="text-xs text-zinc-600">{exportPeriodTitle}</span>
              <span className="text-xs font-semibold font-mono text-zinc-900">
                {filteredExportSales.length} transaksi
              </span>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-zinc-200 bg-zinc-50/50 rounded-b-xl">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExportModal(false)}
              className="text-xs"
            >
              Batal
            </Button>
            <Button
              size="sm"
              onClick={handleDownloadExcel}
              disabled={filteredExportSales.length === 0}
              className="text-xs bg-zinc-900 text-white hover:bg-zinc-800"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh ({filteredExportSales.length})</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
