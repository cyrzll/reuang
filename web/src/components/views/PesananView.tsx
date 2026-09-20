import React, { useState, useEffect, useMemo } from 'react'
import {
  Search,
  ShoppingCart,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  Plus,
  ExternalLink,
  Eye,
  X,
  Calendar,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Upload,
  RefreshCw,
  Check,
  AlertCircle,
  ArrowRight,
  PackageCheck,
  Send,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { apiFetch, API_BASE } from '../../lib/api'
import { getAuthToken } from '../../lib/jwt'
import { formatJakartaDate, parseJakartaDate } from '../../lib/date'

export type OrderStatus =
  | 'menunggu disetujui'
  | 'disetujui'
  | 'siap'
  | 'selesai'
  | 'dibatalkan'
  | 'menunggu'
  | 'diproses'
  | 'dikirim'

export interface OrderItem {
  id?: string | number
  name: string
  price: number
  qty: number
  subtotal?: number
}

export interface Order {
  id: string
  dbId?: number
  customerName: string
  phone: string
  phoneJid?: string | null
  lidJid?: string | null
  address: string
  items: OrderItem[]
  shippingCost: number
  total: number
  paymentMethod: string
  paymentStatus: 'lunas' | 'belum_lunas'
  status: OrderStatus
  date: string
  rawDate: string
  paymentProofUrl?: string | null
  notes?: string
}

interface ConfirmModalData {
  orderId: string
  orderUid: string
  customerName: string
  currentStatus: OrderStatus
  nextStatus: OrderStatus
  label: string
  confirmMessage: string
  isReadyNotification?: boolean
}

export interface PesananViewProps {
  onNavigate?: (tab: string) => void
}

export const PesananView: React.FC<PesananViewProps> = ({ onNavigate }) => {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('semua')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [previewProofUrl, setPreviewProofUrl] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [isUploadingProof, setIsUploadingProof] = useState(false)
  const [openDates, setOpenDates] = useState<Record<string, boolean>>({})

  // Confirmation modal state for advancing order status
  const [confirmModal, setConfirmModal] = useState<ConfirmModalData | null>(null)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Fetch orders from real database API
  const loadOrders = async (silent = false) => {
    if (silent) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }
    try {
      const res = await apiFetch<any>('/orders')
      if (res.success && Array.isArray(res.data)) {
        const mapped: Order[] = res.data.map((d: any) => {
          const rawDate = d.createdAt ? String(d.createdAt) : new Date().toISOString()
          const dateFormatted = formatJakartaDate(rawDate)

          // Normalize order status
          let status: OrderStatus = 'menunggu disetujui'
          const st = String(d.orderStatus || '').toLowerCase()
          if (st === 'siap') {
            status = 'siap'
          } else if (st === 'disetujui' || st === 'diproses' || st === 'dikirim') {
            status = 'disetujui'
          } else if (st === 'selesai' || st === 'completed') {
            status = 'selesai'
          } else if (st === 'dibatalkan' || st === 'cancelled') {
            status = 'dibatalkan'
          } else {
            status = 'menunggu disetujui'
          }

          // Exclude orders in "menunggu disetujui" if customer hasn't sent both transfer proof photo AND name
          if (status === 'menunggu disetujui') {
            const hasProof = Boolean(d.paymentProofUrl && String(d.paymentProofUrl).trim() !== '')
            const hasName = Boolean(
              d.customerName &&
              String(d.customerName).trim() !== '' &&
              String(d.customerName).trim().toLowerCase() !== 'pelanggan'
            )
            if (!hasProof || !hasName) {
              return null
            }
          }

          let items: OrderItem[] = []
          if (Array.isArray(d.items)) {
            items = d.items
          } else if (typeof d.orderItems === 'string') {
            try {
              items = JSON.parse(d.orderItems)
            } catch {
              items = []
            }
          }

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
            id: d.orderUid || `ORD-${d.id}`,
            dbId: d.id,
            customerName: d.customerName || 'Pelanggan',
            phone: formatCustomerPhone(d.phoneJid, d.lidJid),
            phoneJid: d.phoneJid || null,
            lidJid: d.lidJid || null,
            address: d.shippingAddress || '-',
            items,
            shippingCost: 0,
            total: Number(d.totalPrice) || 0,
            paymentMethod: d.paymentMethod === 'transfer' ? 'Transfer Bank' : d.paymentMethod || 'Transfer Bank',
            paymentStatus: d.paymentStatus === 'paid' ? 'lunas' : 'belum_lunas',
            status,
            date: dateFormatted,
            rawDate,
            paymentProofUrl: d.paymentProofUrl || null,
            notes: d.notes || undefined,
          }
        })
        .filter((o: Order | null): o is Order => o !== null)
        setOrders(mapped)
        setSelectedOrder((prev) => {
          if (!prev) return null
          const fresh = mapped.find((o) => o.id === prev.id || (o.dbId && o.dbId === prev.dbId))
          return fresh || prev
        })
      } else {
        if (!silent) setOrders([])
      }
    } catch (err) {
      console.warn('[PesananView] Could not load API orders:', err)
      if (!silent) setOrders([])
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    loadOrders(false)

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
          loadOrders(true)
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
        console.warn('[PesananView] Realtime SSE error:', err)
      }
    }

    connectSSE()

    // Backup polling fallback every 15s to guarantee fresh state
    pollInterval = setInterval(() => {
      if (isMounted) {
        loadOrders(true)
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

  // Helper date functions
  const getDayKey = (rawDate: string): string => {
    const d = new Date(rawDate)
    if (isNaN(d.getTime())) return 'unknown'
    return d.toISOString().split('T')[0] // 'YYYY-MM-DD'
  }

  const isToday = (rawDate: string): boolean => {
    const d = new Date(rawDate)
    if (isNaN(d.getTime())) return false
    return d.toDateString() === new Date().toDateString()
  }

  const formatDayLabel = (rawDate: string): string => {
    const d = new Date(rawDate)
    if (isNaN(d.getTime())) return 'Tanggal Lainnya'
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)

    const dateFormatted = d.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })

    if (d.toDateString() === today.toDateString()) {
      return `Hari Ini — ${dateFormatted}`
    }
    if (d.toDateString() === yesterday.toDateString()) {
      return `Kemarin — ${dateFormatted}`
    }
    return dateFormatted
  }

  // Strict 1-step forward status transition logic
  const getNextStatusInfo = (
    current: OrderStatus
  ): {
    nextStatus: OrderStatus
    label: string
    confirmMessage: string
    isReadyNotification?: boolean
  } | null => {
    const norm = String(current || '').toLowerCase()
    if (norm === 'menunggu disetujui' || norm === 'menunggu') {
      return {
        nextStatus: 'disetujui',
        label: 'Setujui Pesanan',
        confirmMessage: 'Pesanan akan disetujui dan siap untuk mulai dipersiapkan.',
      }
    }
    if (norm === 'disetujui' || norm === 'diproses' || norm === 'dikirim') {
      return {
        nextStatus: 'siap',
        label: 'Tandai Siap',
        confirmMessage:
          'Pesanan telah selesai dipersiapkan. Bot WhatsApp akan otomatis mengirimkan chat pemberitahuan kepada pemesan bahwa pesanan sudah siap.',
        isReadyNotification: true,
      }
    }
    if (norm === 'siap') {
      return {
        nextStatus: 'selesai',
        label: 'Selesaikan Pesanan',
        confirmMessage: 'Pesanan telah diterima oleh pembeli dan transaksi dinyatakan selesai.',
      }
    }
    // 'selesai' and 'dibatalkan' cannot go forward
    return null
  }

  // Handler untuk navigasi cepat ke menu Penjualan
  const handleGoToSales = () => {
    if (onNavigate) {
      onNavigate('sales')
    } else if (typeof window !== 'undefined') {
      window.location.href = '/penjualan'
    }
  }

  // Helper membatasi hanya menampilkan riwayat pesanan dalam 7 hari terakhir
  const isWithinLast7Days = (rawDate: string): boolean => {
    const d = parseJakartaDate(rawDate)
    if (isNaN(d.getTime())) return true
    const now = new Date()
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
    cutoff.setHours(0, 0, 0, 0)
    return d.getTime() >= cutoff.getTime()
  }

  // Pesanan dalam 7 hari terakhir
  const recentOrders = useMemo(() => {
    return orders.filter((o) => isWithinLast7Days(o.rawDate))
  }, [orders])

  // Filter orders by search query and status tab
  const filteredOrders = useMemo(() => {
    return recentOrders.filter((o) => {
      // Exclude orders in "menunggu disetujui" if customer hasn't sent both transfer proof photo AND name
      const isMenunggu = o.status === 'menunggu disetujui' || o.status === 'menunggu'
      if (isMenunggu) {
        const hasProof = Boolean(o.paymentProofUrl && o.paymentProofUrl.trim() !== '')
        const hasName = Boolean(
          o.customerName &&
          o.customerName.trim() !== '' &&
          o.customerName.trim().toLowerCase() !== 'pelanggan'
        )
        if (!hasProof || !hasName) {
          return false
        }
      }

      const q = search.toLowerCase()
      const matchSearch =
        o.id.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.phone.includes(q) ||
        o.items.some((it) => it.name.toLowerCase().includes(q))

      let matchStatus = true
      if (filterStatus === 'menunggu disetujui') {
        matchStatus = isMenunggu
      } else if (filterStatus === 'disetujui') {
        matchStatus = o.status === 'disetujui' || o.status === 'diproses' || o.status === 'dikirim'
      } else if (filterStatus === 'siap') {
        matchStatus = o.status === 'siap'
      } else if (filterStatus === 'selesai') {
        matchStatus = o.status === 'selesai'
      } else if (filterStatus === 'dibatalkan') {
        matchStatus = o.status === 'dibatalkan'
      }

      return matchSearch && matchStatus
    })
  }, [recentOrders, search, filterStatus])

  // Group orders by date
  const groupedOrders = useMemo(() => {
    const groups: Record<string, { label: string; isCurrentDay: boolean; list: Order[]; totalRev: number }> = {}

    filteredOrders.forEach((o) => {
      const key = getDayKey(o.rawDate)
      if (!groups[key]) {
        groups[key] = {
          label: formatDayLabel(o.rawDate),
          isCurrentDay: isToday(o.rawDate),
          list: [],
          totalRev: 0,
        }
      }
      groups[key].list.push(o)
      groups[key].totalRev += o.total
    })

    const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a))

    return sortedKeys.map((key) => ({
      dayKey: key,
      label: groups[key].label,
      isCurrentDay: groups[key].isCurrentDay,
      orders: groups[key].list,
      totalRevenue: groups[key].totalRev,
    }))
  }, [filteredOrders])

  // Toggle accordion open/close
  const toggleDateAccordion = (dayKey: string) => {
    setOpenDates((prev) => ({
      ...prev,
      [dayKey]: !isAccordionOpen(dayKey),
    }))
  }

  // Check if accordion is open (Default: open if today, closed if not today)
  const isAccordionOpen = (dayKey: string): boolean => {
    if (openDates[dayKey] !== undefined) {
      return openDates[dayKey]
    }
    const todayKey = new Date().toISOString().split('T')[0]
    return dayKey === todayKey
  }

  // Metrics (7 hari terakhir)
  const countTotal = recentOrders.length
  const countMenungguDisetujui = recentOrders.filter((o) => {
    const isMenunggu = o.status === 'menunggu disetujui' || o.status === 'menunggu'
    if (isMenunggu) {
      const hasProof = Boolean(o.paymentProofUrl && o.paymentProofUrl.trim() !== '')
      const hasName = Boolean(
        o.customerName &&
        o.customerName.trim() !== '' &&
        o.customerName.trim().toLowerCase() !== 'pelanggan'
      )
      return hasProof && hasName
    }
    return false
  }).length
  const countDisetujui = recentOrders.filter(
    (o) => o.status === 'disetujui' || o.status === 'diproses' || o.status === 'dikirim'
  ).length
  const countSiap = recentOrders.filter((o) => o.status === 'siap').length
  const countSelesai = recentOrders.filter((o) => o.status === 'selesai').length

  // Trigger Confirmation Modal for next step
  const handleRequestAdvanceStatus = (order: Order) => {
    const nextInfo = getNextStatusInfo(order.status)
    if (!nextInfo) return

    setConfirmModal({
      orderId: order.id,
      orderUid: order.id,
      customerName: order.customerName,
      currentStatus: order.status,
      nextStatus: nextInfo.nextStatus,
      label: nextInfo.label,
      confirmMessage: nextInfo.confirmMessage,
      isReadyNotification: nextInfo.isReadyNotification,
    })
  }

  // Confirm advancing status
  const handleConfirmAdvanceStatus = async () => {
    if (!confirmModal) return
    const { orderId, nextStatus } = confirmModal
    setIsUpdatingStatus(true)

    const isNowLunas = nextStatus === 'selesai'

    // Optimistic state update
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id === orderId) {
          const updated: Order = {
            ...o,
            status: nextStatus,
            paymentStatus: isNowLunas ? 'lunas' : o.paymentStatus,
          }
          if (selectedOrder?.id === orderId) {
            setSelectedOrder(updated)
          }
          return updated
        }
        return o
      })
    )

    try {
      const res = await apiFetch<any>(`/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PUT',
        body: JSON.stringify({
          orderStatus: nextStatus,
          paymentStatus: isNowLunas ? 'paid' : undefined,
        }),
      })
      if (!res.success) {
        console.warn('[PesananView] Gagal memperbarui status order:', res.error)
      }
    } catch (err) {
      console.warn('[PesananView] Failed to update order status via API:', err)
    } finally {
      setIsUpdatingStatus(false)
      setConfirmModal(null)
    }
  }

  // Handle uploading manual payment proof from detail modal
  const handleUploadProofFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedOrder) return

    setIsUploadingProof(true)
    const formData = new FormData()
    formData.append('image', file)

    try {
      const uploadRes = await apiFetch<any>('/upload/payment-proof', {
        method: 'POST',
        body: formData,
      })

      if (uploadRes.success && uploadRes.url) {
        const proofUrl = uploadRes.url

        // Update database
        await apiFetch(`/orders/${encodeURIComponent(selectedOrder.id)}/status`, {
          method: 'PUT',
          body: JSON.stringify({
            paymentProofUrl: proofUrl,
          }),
        })

        // Update local state
        setOrders((prev) =>
          prev.map((o) => (o.id === selectedOrder.id ? { ...o, paymentProofUrl: proofUrl } : o))
        )
        setSelectedOrder((prev) => (prev ? { ...prev, paymentProofUrl: proofUrl } : null))
      }
    } catch (err) {
      console.error('[PesananView] Failed to upload payment proof:', err)
    } finally {
      setIsUploadingProof(false)
    }
  }

  // Add order form states
  const [newCustomer, setNewCustomer] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newItemName, setNewItemName] = useState('')
  const [newItemPrice, setNewItemPrice] = useState('')
  const [newItemQty, setNewItemQty] = useState('1')
  const [newShippingCost, setNewShippingCost] = useState('0')
  const [newPaymentMethod, setNewPaymentMethod] = useState('Transfer BCA')
  const [newNotes, setNewNotes] = useState('')

  const handleAddOrder = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCustomer || !newPhone || !newItemName) return

    const price = Number(newItemPrice) || 0
    const qty = Number(newItemQty) || 1
    const shipping = Number(newShippingCost) || 0
    const subtotal = price * qty
    const grandTotal = subtotal + shipping

    const now = new Date()
    const randomId = `ORD-${Date.now().toString(36).toUpperCase()}`

    const newOrder: Order = {
      id: randomId,
      customerName: newCustomer,
      phone: newPhone,
      address: newAddress || 'Ambil di Toko',
      items: [{ id: String(Date.now()), name: newItemName, price, qty, subtotal }],
      shippingCost: shipping,
      total: grandTotal,
      paymentMethod: newPaymentMethod,
      paymentStatus: 'belum_lunas',
      status: 'menunggu disetujui',
      date: formatJakartaDate(now),
      rawDate: now.toISOString(),
      notes: newNotes,
    }

    setOrders([newOrder, ...orders])
    setShowAddModal(false)

    // Reset Form
    setNewCustomer('')
    setNewPhone('')
    setNewAddress('')
    setNewItemName('')
    setNewItemPrice('')
    setNewItemQty('1')
    setNewShippingCost('0')
    setNewNotes('')
  }

  const getStatusBadge = (status: OrderStatus) => {
    const norm = String(status || '').toLowerCase()
    switch (norm) {
      case 'menunggu disetujui':
      case 'menunggu':
        return (
          <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-zinc-300 text-zinc-800 bg-zinc-50 font-medium">
            Menunggu Disetujui
          </Badge>
        )
      case 'disetujui':
      case 'diproses':
      case 'dikirim':
        return (
          <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-zinc-100 text-zinc-900 border border-zinc-300 font-medium">
            Disetujui
          </Badge>
        )
      case 'siap':
        return (
          <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-zinc-800 text-zinc-50 border border-zinc-700 font-medium">
            Siap
          </Badge>
        )
      case 'selesai':
        return (
          <Badge variant="default" className="text-[10px] px-2 py-0.5 bg-zinc-950 text-white font-medium">
            Selesai
          </Badge>
        )
      case 'dibatalkan':
        return (
          <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-zinc-300 text-zinc-400 line-through">
            Dibatalkan
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-zinc-300 text-zinc-700">
            {status}
          </Badge>
        )
    }
  }

  const formatPhoneForWA = (phone: string) => {
    let clean = phone.replace(/\D/g, '')
    if (clean.startsWith('0')) {
      clean = '62' + clean.slice(1)
    }
    return clean
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/80 pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-950">Daftar Pesanan</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Kelola proses pemesanan yang masuk melalui interaksi WhatsApp pelanggan
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadOrders(false)}
            disabled={isLoading || isRefreshing}
            className="text-xs border-zinc-200 text-zinc-700 hover:bg-zinc-100"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading || isRefreshing ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="shadow-xs border-zinc-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-500">Total Pesanan</CardTitle>
            <ShoppingCart className="w-4 h-4 text-zinc-700" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold font-mono tracking-tight text-zinc-950">{countTotal}</div>
            <p className="text-[11px] text-zinc-500 mt-1">Semua transaksi</p>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-zinc-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-500">Menunggu</CardTitle>
            <Clock className="w-4 h-4 text-zinc-700" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold font-mono tracking-tight text-zinc-950">{countMenungguDisetujui}</div>
            <p className="text-[11px] text-zinc-500 mt-1">Perlu persetujuan</p>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-zinc-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-500">Disetujui</CardTitle>
            <Truck className="w-4 h-4 text-zinc-700" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold font-mono tracking-tight text-zinc-950">{countDisetujui}</div>
            <p className="text-[11px] text-zinc-500 mt-1">Sedang disiapkan</p>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-zinc-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-500">Pesanan Siap</CardTitle>
            <PackageCheck className="w-4 h-4 text-zinc-700" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold font-mono tracking-tight text-zinc-950">{countSiap}</div>
            <p className="text-[11px] text-zinc-500 mt-1">Siap diambil / kirim</p>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-zinc-200 col-span-2 sm:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-500">Selesai</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-zinc-700" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold font-mono tracking-tight text-zinc-950">{countSelesai}</div>
            <p className="text-[11px] text-zinc-500 mt-1">Transaksi selesai</p>
          </CardContent>
        </Card>
      </div>

      {/* 7-Day Window Info Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-600">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-zinc-700 shrink-0" />
          <span>
            Menampilkan riwayat pesanan <strong className="text-zinc-900 font-medium">7 hari terakhir</strong>. Riwayat transaksi selengkapnya dapat dilihat pada menu Penjualan.
          </span>
        </div>
        <button
          type="button"
          onClick={handleGoToSales}
          className="inline-flex items-center gap-1.5 font-medium text-zinc-950 hover:text-zinc-700 underline underline-offset-2 shrink-0 cursor-pointer text-xs self-start sm:self-auto"
        >
          <span>Buka Menu Penjualan</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Container */}
      <div className="space-y-4">
        {/* Filter Controls Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-zinc-200 shadow-xs">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {[
              { id: 'semua', label: 'Semua' },
              { id: 'menunggu disetujui', label: 'Menunggu Disetujui' },
              { id: 'disetujui', label: 'Disetujui' },
              { id: 'siap', label: 'Siap' },
              { id: 'selesai', label: 'Selesai' },
              { id: 'dibatalkan', label: 'Dibatalkan' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterStatus(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors shrink-0 ${
                  filterStatus === tab.id
                    ? 'bg-zinc-900 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari ID, nama pembeli, nomor WA..."
              className="pl-8 h-8 text-xs w-full bg-zinc-50/60 border-zinc-200 focus:bg-white"
            />
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-16 text-center text-xs text-zinc-500 bg-white rounded-xl border border-zinc-200">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-zinc-400 mb-2" />
            Memuat daftar pesanan dari database...
          </div>
        )}

        {/* Empty State */}
        {!isLoading && groupedOrders.length === 0 && (
          <div className="py-16 text-center bg-white rounded-xl border border-zinc-200 p-6 space-y-2">
            <ShoppingCart className="w-8 h-8 mx-auto text-zinc-300" />
            <h3 className="text-sm font-semibold text-zinc-900">Belum Ada Pesanan</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Pesanan pelanggan yang masuk melalui bot WhatsApp akan otomatis tercatat dan muncul di sini.
            </p>
          </div>
        )}

        {/* Accordions Grouped by Date */}
        {!isLoading && groupedOrders.length > 0 && (
          <div className="space-y-3">
            {groupedOrders.map((group) => {
              const isOpen = isAccordionOpen(group.dayKey)

              return (
                <div
                  key={group.dayKey}
                  className="bg-white rounded-xl border border-zinc-200 shadow-xs overflow-hidden transition-all"
                >
                  {/* Accordion Header */}
                  <button
                    type="button"
                    onClick={() => toggleDateAccordion(group.dayKey)}
                    className={`w-full px-4 py-3.5 flex items-center justify-between text-left transition-colors cursor-pointer border-b border-zinc-200/80 ${
                      group.isCurrentDay
                        ? 'bg-zinc-50 hover:bg-zinc-100/80'
                        : isOpen
                        ? 'bg-zinc-50/70 hover:bg-zinc-100/70'
                        : 'hover:bg-zinc-50 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <ChevronRight
                        className={`w-4 h-4 text-zinc-600 transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                          isOpen ? 'rotate-90 text-zinc-950' : 'rotate-0 text-zinc-400'
                        }`}
                      />

                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-zinc-700" />
                        <span className="text-xs font-semibold text-zinc-950">{group.label}</span>
                        {group.isCurrentDay && (
                          <Badge variant="default" className="text-[10px] px-2 py-0.5 bg-zinc-900 text-white border-0">
                            Hari Ini
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-zinc-500">
                        {group.orders.length} pesanan
                      </span>
                      <span className="text-xs font-semibold font-mono text-zinc-950">
                        Rp {group.totalRevenue.toLocaleString('id-ID')}
                      </span>
                    </div>
                  </button>

                  {/* Accordion Content (Table of Orders) with Smooth Open/Close Animation */}
                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                      isOpen
                        ? 'grid-rows-[1fr] opacity-100'
                        : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-zinc-100 text-zinc-500 bg-zinc-50/40">
                              <th className="px-4 py-3 font-medium">ID Pesanan</th>
                              <th className="px-4 py-3 font-medium">Pelanggan</th>
                              <th className="px-4 py-3 font-medium">Rincian Barang</th>
                              <th className="px-4 py-3 font-medium text-right">Total</th>
                              <th className="px-4 py-3 font-medium text-center">Bukti Transfer</th>
                              <th className="px-4 py-3 font-medium text-center">Status</th>
                              <th className="px-4 py-3 font-medium text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {group.orders.map((o) => {
                              const nextInfo = getNextStatusInfo(o.status)

                              return (
                                <tr key={o.id} className="hover:bg-zinc-50/50 transition-colors">
                                  {/* Order ID & Time */}
                                  <td className="px-4 py-3 font-mono font-medium text-zinc-900">
                                    <div className="text-xs font-semibold">{o.id}</div>
                                    <div className="text-[11px] text-zinc-400 font-normal">{o.date}</div>
                                  </td>

                                  {/* Customer Info */}
                                  <td className="px-4 py-3">
                                    <div className="font-semibold text-zinc-900">{o.customerName}</div>
                                    <div className="font-mono text-zinc-500 text-[11px]">{o.phone}</div>
                                  </td>

                                  {/* Ordered Items */}
                                  <td className="px-4 py-3 text-zinc-700">
                                    <div className="space-y-0.5">
                                      {o.items.map((it, idx) => (
                                        <div key={idx} className="flex items-center gap-1.5">
                                          <span className="font-medium text-zinc-900">{it.name}</span>
                                          <span className="text-zinc-500 font-mono text-[11px]">x{it.qty}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </td>

                                  {/* Total & Payment Method */}
                                  <td className="px-4 py-3 text-right">
                                    <div className="font-mono font-semibold text-zinc-950">
                                      Rp {o.total.toLocaleString('id-ID')}
                                    </div>
                                    <div className="text-[10px] text-zinc-400 font-medium">
                                      {o.paymentMethod}
                                    </div>
                                  </td>

                                  {/* Payment Proof Preview Button */}
                                  <td className="px-4 py-3 text-center">
                                    {o.paymentProofUrl ? (
                                      <button
                                        type="button"
                                        onClick={() => setPreviewProofUrl(o.paymentProofUrl || null)}
                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-900 hover:text-zinc-600 underline underline-offset-2 cursor-pointer"
                                      >
                                        <ImageIcon className="w-3.5 h-3.5" />
                                        <span>Lihat Bukti</span>
                                      </button>
                                    ) : (
                                      <span className="text-zinc-400 text-[11px] italic">Belum Ada</span>
                                    )}
                                  </td>

                                  {/* Current Order Status */}
                                  <td className="px-4 py-3 text-center">
                                    {getStatusBadge(o.status)}
                                  </td>

                                  {/* Action Buttons */}
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      {nextInfo && (
                                        <Button
                                          size="sm"
                                          onClick={() => handleRequestAdvanceStatus(o)}
                                          className={`h-7 text-[11px] px-2.5 font-medium cursor-pointer shadow-xs ${
                                            nextInfo.nextStatus === 'siap'
                                              ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                                              : 'bg-zinc-900 text-white hover:bg-zinc-800'
                                          }`}
                                        >
                                          <span>{nextInfo.label}</span>
                                          <ArrowRight className="w-3 h-3 ml-0.5" />
                                        </Button>
                                      )}
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setSelectedOrder(o)}
                                        className="h-7 text-[11px] px-2.5 border-zinc-200 text-zinc-800 hover:bg-zinc-100 hover:text-zinc-950 cursor-pointer"
                                      >
                                        <Eye className="w-3 h-3" />
                                        <span>Detail</span>
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl max-w-lg w-full border border-zinc-200 shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 bg-zinc-50/50">
              <div>
                <h3 className="text-sm font-semibold text-zinc-950 flex items-center gap-2">
                  <span>Detail Pesanan</span>
                  <span className="font-mono text-zinc-500 font-normal">#{selectedOrder.id}</span>
                </h3>
                <p className="text-[11px] text-zinc-400 mt-0.5">{selectedOrder.date}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="p-1 text-zinc-400 hover:text-zinc-700 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              {/* Status Flow Stepper */}
              <div className="bg-zinc-50/80 p-3.5 rounded-xl border border-zinc-200 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 mb-1">
                  <span>Alur Status Pesanan</span>
                  <span className="text-zinc-900 font-semibold">{getStatusBadge(selectedOrder.status)}</span>
                </div>

                {/* Visual Step Indicator */}
                <div className="grid grid-cols-4 gap-1 relative pt-1">
                  {[
                    { id: 'menunggu disetujui', label: '1. Menunggu' },
                    { id: 'disetujui', label: '2. Disetujui' },
                    { id: 'siap', label: '3. Siap' },
                    { id: 'selesai', label: '4. Selesai' },
                  ].map((step, idx) => {
                    const stepOrder = ['menunggu disetujui', 'disetujui', 'siap', 'selesai']
                    const currentIdx = stepOrder.indexOf(
                      selectedOrder.status === 'menunggu' ? 'menunggu disetujui' : selectedOrder.status
                    )
                    const isDone = currentIdx > idx
                    const isCurrent = currentIdx === idx

                    return (
                      <div key={step.id} className="text-center">
                        <div
                          className={`h-1.5 rounded-full mb-1.5 transition-colors ${
                            isDone || isCurrent ? 'bg-zinc-900' : 'bg-zinc-200'
                          }`}
                        />
                        <span
                          className={`text-[10px] block leading-tight ${
                            isCurrent
                              ? 'font-semibold text-zinc-950'
                              : isDone
                              ? 'text-zinc-700 font-medium'
                              : 'text-zinc-400'
                          }`}
                        >
                          {step.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Customer Box */}
              <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-200/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-950 text-sm">{selectedOrder.customerName}</span>
                  <a
                    href={`https://wa.me/${formatPhoneForWA(selectedOrder.phone)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-900 bg-white border border-zinc-200 px-2 py-0.5 rounded hover:bg-zinc-100 transition-colors"
                  >
                    <span>Chat WhatsApp</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="font-mono text-zinc-500">{selectedOrder.phone}</div>
                <div className="text-zinc-600 text-[11px] pt-1.5 border-t border-zinc-200/60">
                  <span className="font-medium text-zinc-700">Alamat: </span>
                  {selectedOrder.address || 'Tidak ada alamat khusus (Ambil di Toko)'}
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <h4 className="font-medium text-zinc-900 text-[11px] uppercase tracking-wider">Item Dipesan</h4>
                <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl overflow-hidden bg-white">
                  {selectedOrder.items.length > 0 ? (
                    selectedOrder.items.map((it, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium text-zinc-900">{it.name}</p>
                          <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                            {it.qty} x Rp {it.price.toLocaleString('id-ID')}
                          </p>
                        </div>
                        <span className="font-mono font-semibold text-zinc-950">
                          Rp {(it.qty * it.price).toLocaleString('id-ID')}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-zinc-500 text-center">Rincian produk tidak tersedia</div>
                  )}
                </div>
              </div>

              {/* Billing Summary */}
              <div className="space-y-1.5 pt-2 border-t border-zinc-100 text-zinc-600">
                <div className="flex justify-between">
                  <span>Metode Pembayaran</span>
                  <span className="font-medium text-zinc-900">{selectedOrder.paymentMethod}</span>
                </div>
                <div className="flex justify-between text-zinc-950 font-semibold text-sm pt-2 border-t border-zinc-200">
                  <span>Total Tagihan</span>
                  <span className="font-mono text-base">Rp {selectedOrder.total.toLocaleString('id-ID')}</span>
                </div>
              </div>

              {/* Bukti Transfer / Pembayaran Section */}
              <div className="space-y-2 pt-2 border-t border-zinc-100">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-zinc-900 text-[11px] uppercase tracking-wider">
                    Bukti Transfer / Pembayaran
                  </h4>
                  {selectedOrder.paymentProofUrl && (
                    <span className="text-[10px] text-zinc-500">Tersedia</span>
                  )}
                </div>

                {selectedOrder.paymentProofUrl ? (
                  <div className="space-y-2">
                    <div
                      onClick={() => setPreviewProofUrl(selectedOrder.paymentProofUrl || null)}
                      className="group relative rounded-xl border border-zinc-200 overflow-hidden bg-zinc-100 cursor-pointer flex items-center justify-center max-h-56 hover:border-zinc-400 transition-colors"
                    >
                      <img
                        src={selectedOrder.paymentProofUrl}
                        alt="Bukti Transfer"
                        className="max-h-56 w-auto object-contain transition-transform group-hover:scale-102"
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-medium gap-1.5">
                        <Eye className="w-4 h-4" />
                        <span>Klik untuk Perbesar</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <a
                        href={selectedOrder.paymentProofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-zinc-600 hover:text-zinc-950 underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Buka Gambar di Tab Baru</span>
                      </a>

                      <label className="text-zinc-500 hover:text-zinc-950 cursor-pointer underline inline-flex items-center gap-1">
                        <Upload className="w-3 h-3" />
                        <span>{isUploadingProof ? 'Mengunggah...' : 'Ganti Foto Bukti'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleUploadProofFile}
                          disabled={isUploadingProof}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 text-center space-y-2">
                    <ImageIcon className="w-6 h-6 mx-auto text-zinc-300" />
                    <div>
                      <p className="font-medium text-zinc-700">Belum Ada Bukti Transfer</p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Pelanggan belum mengirimkan foto bukti transfer via WhatsApp.
                      </p>
                    </div>
                    <div>
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-800 rounded-lg text-xs font-medium cursor-pointer shadow-xs transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isUploadingProof ? 'Mengunggah...' : 'Unggah Bukti Manual'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleUploadProofFile}
                          disabled={isUploadingProof}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Step Forward Action Box */}
              <div className="pt-3 border-t border-zinc-100">
                {(() => {
                  const nextInfo = getNextStatusInfo(selectedOrder.status)
                  if (nextInfo) {
                    return (
                      <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold text-zinc-950">Langkah Berikutnya:</p>
                          <p className="text-[11px] text-zinc-500 mt-0.5">
                            Ubah status menjadi <span className="font-medium text-zinc-900">{nextInfo.nextStatus}</span>
                            {nextInfo.isReadyNotification && ' (Bot akan otomatis chat pelanggan)'}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleRequestAdvanceStatus(selectedOrder)}
                          className="text-xs bg-zinc-900 hover:bg-zinc-800 text-white cursor-pointer shrink-0"
                        >
                          <span>{nextInfo.label}</span>
                          <ArrowRight className="w-3.5 h-3.5 ml-1" />
                        </Button>
                      </div>
                    )
                  }

                  if (selectedOrder.status === 'selesai') {
                    return (
                      <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 text-center text-[11px] text-zinc-600 font-medium">
                        ✓ Pesanan ini telah selesai (Tahap Akhir).
                      </div>
                    )
                  }

                  return null
                })()}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedOrder(null)}
                className="text-xs border-zinc-200 text-zinc-700 hover:bg-zinc-100"
              >
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Advancing Order Status */}
      {confirmModal && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl max-w-sm w-full border border-zinc-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 space-y-3.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center shrink-0 text-zinc-900">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-950">Konfirmasi Ubah Status</h3>
                  <p className="text-[11px] text-zinc-500 font-mono">#{confirmModal.orderUid}</p>
                </div>
              </div>

              {/* Status Transition Badges */}
              <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-200 flex items-center justify-center gap-2.5">
                {getStatusBadge(confirmModal.currentStatus)}
                <ArrowRight className="w-4 h-4 text-zinc-400" />
                {getStatusBadge(confirmModal.nextStatus)}
              </div>

              <div className="text-xs text-zinc-600 space-y-2">
                <p>{confirmModal.confirmMessage}</p>

                {confirmModal.isReadyNotification && (
                  <div className="p-2.5 bg-zinc-100/80 rounded-md border border-zinc-200 text-[11px] text-zinc-900 flex items-start gap-2">
                    <Send className="w-3.5 h-3.5 shrink-0 mt-0.5 text-zinc-800" />
                    <span>
                      Bot WhatsApp akan otomatis mengirimkan pesan konfirmasi ke nomor <b>{confirmModal.customerName}</b>.
                    </span>
                  </div>
                )}

                <p className="text-[11px] text-zinc-500 italic">
                  Catatan: Status hanya dapat melangkah maju dan tidak dapat dikembalikan ke status sebelumnya.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-100">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmModal(null)}
                  disabled={isUpdatingStatus}
                  className="text-xs border-zinc-200 text-zinc-700"
                >
                  Batal
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirmAdvanceStatus}
                  disabled={isUpdatingStatus}
                  className="text-xs bg-zinc-900 hover:bg-zinc-800 text-white cursor-pointer"
                >
                  {isUpdatingStatus ? 'Memperbarui...' : confirmModal.label}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal for Full-Size Payment Proof Image */}
      {previewProofUrl && (
        <div
          onClick={() => setPreviewProofUrl(null)}
          className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="relative max-w-2xl w-full max-h-[90vh] flex flex-col items-center">
            <button
              type="button"
              onClick={() => setPreviewProofUrl(null)}
              className="absolute -top-10 right-0 text-white hover:text-zinc-300 p-1 cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewProofUrl}
              alt="Bukti Transfer Layar Penuh"
              className="rounded-xl max-h-[85vh] w-auto object-contain shadow-2xl border border-white/10"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Modal Buat Pesanan Baru */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl max-w-md w-full border border-zinc-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 bg-zinc-50/50">
              <h3 className="text-sm font-semibold text-zinc-950">Buat Pesanan Baru</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 text-zinc-400 hover:text-zinc-700 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddOrder} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-zinc-700 mb-1 font-medium">Nama Pelanggan</label>
                <Input
                  type="text"
                  value={newCustomer}
                  onChange={(e) => setNewCustomer(e.target.value)}
                  placeholder="Contoh: Budi Santoso"
                  required
                  className="text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 mb-1 font-medium">Nomor WhatsApp</label>
                  <Input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="081234567890"
                    required
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="block text-zinc-700 mb-1 font-medium">Metode Pembayaran</label>
                  <select
                    value={newPaymentMethod}
                    onChange={(e) => setNewPaymentMethod(e.target.value)}
                    className="w-full h-8 px-2.5 rounded-lg border border-zinc-200 text-xs bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-950"
                  >
                    <option value="Transfer BCA">Transfer BCA</option>
                    <option value="Transfer Mandiri">Transfer Mandiri</option>
                    <option value="Transfer BRI">Transfer BRI</option>
                    <option value="QRIS">QRIS</option>
                    <option value="Tunai / COD">Tunai / COD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-zinc-700 mb-1 font-medium">Alamat Pengiriman</label>
                <Input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="Jl. Contoh No. 123 (Kosongkan jika ambil di toko)"
                  className="text-xs"
                />
              </div>

              <div className="pt-2 border-t border-zinc-100">
                <h4 className="font-medium text-zinc-800 mb-2">Item Produk</h4>
                <div className="space-y-2">
                  <div>
                    <Input
                      type="text"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      placeholder="Nama produk yang dipesan"
                      required
                      className="text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      value={newItemPrice}
                      onChange={(e) => setNewItemPrice(e.target.value)}
                      placeholder="Harga Satuan (Rp)"
                      required
                      className="text-xs"
                    />
                    <Input
                      type="number"
                      value={newItemQty}
                      onChange={(e) => setNewItemQty(e.target.value)}
                      placeholder="Jumlah (Qty)"
                      min="1"
                      required
                      className="text-xs"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-zinc-700 mb-1 font-medium">Catatan (Opsional)</label>
                <Input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Catatan pesanan..."
                  className="text-xs"
                />
              </div>

              <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddModal(false)}
                  className="text-xs border-zinc-200"
                >
                  Batal
                </Button>
                <Button type="submit" size="sm" className="text-xs bg-zinc-900 text-white hover:bg-zinc-800">
                  Simpan Pesanan
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
