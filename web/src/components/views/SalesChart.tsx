import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'
import { TrendingUp, ShoppingBag, Calendar, BarChart3 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import {
  computeSalesChartFromOrders,
  type PeriodChartData,
} from '../../data/salesChartData'
import { parseJakartaDate } from '../../lib/date'

// Register required Chart.js controllers and plugins
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

export type ChartPeriod = '1d' | '1w' | '1m' | '1y' | 'custom'
export type ChartMetric = 'omset' | 'orders'

const monthNames = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

const yearsList = [2024, 2025, 2026]

export interface SalesChartProps {
  orders?: any[]
  onPeriodStats?: (filteredOrders: any[]) => void
}

export const SalesChart: React.FC<SalesChartProps> = ({ orders = [], onPeriodStats }) => {
  const [period, setPeriod] = useState<ChartPeriod>('1w')
  const [metric, setMetric] = useState<ChartMetric>('omset')
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())

  // Retrieve current active data based on real orders
  const currentData: PeriodChartData = useMemo(() => {
    return computeSalesChartFromOrders(orders, period, selectedMonth, selectedYear)
  }, [orders, period, selectedMonth, selectedYear])

  // Filter orders for the active period and notify parent
  useEffect(() => {
    if (!onPeriodStats) return
    const now = new Date()
    const filtered = orders.filter((o) => {
      const d = parseJakartaDate(o.rawDate || o.createdAt || o.date)
      if (isNaN(d.getTime())) return false

      if (period === '1d') {
        return d.toDateString() === now.toDateString()
      }
      if (period === '1w') {
        const weekAgo = new Date(now)
        weekAgo.setDate(now.getDate() - 6)
        weekAgo.setHours(0, 0, 0, 0)
        return d >= weekAgo
      }
      if (period === '1m') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      }
      if (period === '1y') {
        return d.getFullYear() === now.getFullYear()
      }
      // custom
      return d.getMonth() === selectedMonth - 1 && d.getFullYear() === selectedYear
    })
    onPeriodStats(filtered)
  }, [orders, period, selectedMonth, selectedYear, onPeriodStats])

  // Build ChartJS dataset using sleek monochrome palette
  const chartData = useMemo(() => {
    const isOmset = metric === 'omset'

    return {
      labels: currentData.labels,
      datasets: [
        {
          label: isOmset ? 'Omset (Rp)' : 'Jumlah Pesanan',
          data: isOmset ? currentData.omset : currentData.orders,
          borderColor: '#18181b', // Zinc 900
          backgroundColor: (context: any) => {
            const ctx = context.chart.ctx
            if (!ctx) return 'rgba(24, 24, 27, 0.08)'
            const gradient = ctx.createLinearGradient(0, 0, 0, 300)
            gradient.addColorStop(0, isOmset ? 'rgba(24, 24, 27, 0.14)' : 'rgba(24, 24, 27, 0.85)')
            gradient.addColorStop(1, isOmset ? 'rgba(24, 24, 27, 0.00)' : 'rgba(24, 24, 27, 0.65)')
            return gradient
          },
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#18181b',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#18181b',
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2,
          borderWidth: 2,
          borderRadius: 4, // for bar chart
        },
      ],
    }
  }, [currentData, metric])

  // Chart configuration options adhering to B&W Shadcn styling
  const chartOptions: ChartOptions<'line' | 'bar'> = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: '#09090b',
          titleColor: '#ffffff',
          bodyColor: '#f4f4f5',
          titleFont: {
            size: 12,
            weight: 600,
            family: 'Outfit, sans-serif',
          },
          bodyFont: {
            size: 11,
            family: 'Outfit, sans-serif',
          },
          padding: {
            top: 8,
            bottom: 8,
            left: 12,
            right: 12,
          },
          cornerRadius: 8,
          borderColor: '#27272a',
          borderWidth: 1,
          displayColors: false,
          callbacks: {
            label: (item: any) => {
              const val = item.raw
              if (metric === 'omset') {
                return `Omset: Rp ${Number(val).toLocaleString('id-ID')}`
              }
              return `Pesanan: ${val} transaksi`
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: '#71717a',
            font: {
              size: 10,
              family: 'Outfit, sans-serif',
            },
          },
          border: {
            display: false,
          },
        },
        y: {
          grid: {
            color: 'rgba(0, 0, 0, 0.05)',
          },
          ticks: {
            color: '#71717a',
            font: {
              size: 10,
              family: 'Outfit, sans-serif',
            },
            callback: (value: any) => {
              if (metric === 'omset') {
                if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)}M`
                if (value >= 1000000) return `${(value / 1000000).toFixed(0)}jt`
                if (value >= 1000) return `${(value / 1000).toFixed(0)}rb`
                return value
              }
              return value
            },
          },
          border: {
            display: false,
          },
        },
      },
    }
  }, [metric])

  return (
    <Card className="shadow-xs overflow-hidden">
      {/* Chart Header & Controls */}
      <CardHeader className="pb-4 border-b border-zinc-100 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-zinc-800" />
              <CardTitle className="text-sm font-semibold text-zinc-950">
                Grafik Tren Penjualan
              </CardTitle>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Visualisasi transaksi dan omset toko WhatsApp berdasarkan rentang waktu
            </p>
          </div>

          {/* Metric Selector (Omset vs Pesanan) */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto bg-zinc-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setMetric('omset')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                metric === 'omset'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              Omset (Rp)
            </button>
            <button
              type="button"
              onClick={() => setMetric('orders')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                metric === 'orders'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              Jumlah Pesanan
            </button>
          </div>
        </div>

        {/* Period Filter Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPeriod('1d')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                period === '1d'
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              1 Hari
            </button>
            <button
              type="button"
              onClick={() => setPeriod('1w')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                period === '1w'
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              1 Minggu
            </button>
            <button
              type="button"
              onClick={() => setPeriod('1m')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                period === '1m'
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              1 Bulan
            </button>
            <button
              type="button"
              onClick={() => setPeriod('1y')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                period === '1y'
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              1 Tahun
            </button>
            <button
              type="button"
              onClick={() => setPeriod('custom')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                period === 'custom'
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Bulan & Tahun Spesifik</span>
            </button>
          </div>

          {/* Month & Year Selectors (Shown when custom is selected) */}
          {period === 'custom' && (
            <div className="flex items-center gap-2 animate-in fade-in-50 duration-150">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-xs text-zinc-900 font-medium focus:outline-none focus:ring-1 focus:ring-zinc-950 cursor-pointer"
              >
                {monthNames.map((name, idx) => (
                  <option key={name} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-xs text-zinc-900 font-medium focus:outline-none focus:ring-1 focus:ring-zinc-950 cursor-pointer"
              >
                {yearsList.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </CardHeader>

      {/* KPI Stats for Current Active Period */}
      <div className="px-5 py-3.5 bg-zinc-50/70 border-b border-zinc-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <span className="text-zinc-500 text-[11px] block">Total Omset Periode</span>
          <span className="font-mono font-semibold text-zinc-950 text-sm">
            Rp {currentData.totalOmset.toLocaleString('id-ID')}
          </span>
        </div>
        <div>
          <span className="text-zinc-500 text-[11px] block">Jumlah Transaksi</span>
          <span className="font-mono font-semibold text-zinc-950 text-sm">
            {currentData.totalOrders.toLocaleString('id-ID')} Pesanan
          </span>
        </div>
        <div>
          <span className="text-zinc-500 text-[11px] block">Rata-rata Order</span>
          <span className="font-mono font-semibold text-zinc-950 text-sm">
            Rp {currentData.avgOrder.toLocaleString('id-ID')}
          </span>
        </div>
      </div>

      {/* Chart Canvas Area */}
      <CardContent className="p-5">
        <div className="h-[280px] w-full">
          {metric === 'omset' ? (
            <Line data={chartData} options={chartOptions} />
          ) : (
            <Bar data={chartData} options={chartOptions} />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
