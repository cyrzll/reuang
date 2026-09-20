import React, { useState, useEffect, useMemo } from 'react'
import {
  TrendingUp,
  Package,
  ShoppingCart,
  ArrowUpRight,
  Plus,
  Store,
  Clock,
  AlertCircle,
  RotateCcw,
  Bot,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { useAuth } from '../../context/AuthContext'
import { apiFetch, API_BASE } from '../../lib/api'
import { getAuthToken } from '../../lib/jwt'
import { parseJakartaDate } from '../../lib/date'
import type { NavTab } from '../Sidebar'

interface DashboardViewProps {
  onNavigate: (tab: NavTab) => void
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { user, store, refreshStore } = useAuth()

  // Real-time dashboard data states
  const [orders, setOrders] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)

  const loadDashboardData = async (silent = false) => {
    if (!silent) setIsLoadingData(true)
    try {
      const [ordersRes, productsRes] = await Promise.all([
        apiFetch<any>('/orders'),
        apiFetch<any>('/katalog'),
      ])

      if (ordersRes.success && Array.isArray(ordersRes.data)) {
        setOrders(ordersRes.data)
      } else if (Array.isArray(ordersRes)) {
        setOrders(ordersRes)
      }

      if (productsRes.success && Array.isArray(productsRes.data)) {
        setProducts(productsRes.data)
      } else if (Array.isArray(productsRes)) {
        setProducts(productsRes)
      }
    } catch (err) {
      console.warn('[DashboardView] Failed to load dashboard data:', err)
    } finally {
      setIsLoadingData(false)
    }
  }

  useEffect(() => {
    if (store?.status !== 'approved') return

    loadDashboardData(false)

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
          loadDashboardData(true)
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
        console.warn('[DashboardView] Realtime SSE error:', err)
      }
    }

    connectSSE()

    pollInterval = setInterval(() => {
      if (isMounted) {
        loadDashboardData(true)
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
  }, [store?.status])

  // Real-time calculations for today's metrics
  const { todayOmset, todayCompletedCount, todayOrdersCount, todayWaitingCount, productsCount } = useMemo(() => {
    const now = new Date()
    const todayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)

    let omset = 0
    let completed = 0
    let todayOrders = 0
    let waiting = 0

    orders.forEach((o: any) => {
      const d = parseJakartaDate(o.createdAt)
      const orderDateKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d)

      const isToday = orderDateKey === todayKey
      const st = String(o.orderStatus || '').toLowerCase().trim()

      if (isToday) {
        todayOrders += 1
        if (st === 'selesai' || st === 'completed') {
          omset += Number(o.totalPrice) || 0
          completed += 1
        }
        if (st === 'menunggu disetujui' || st === 'menunggu') {
          waiting += 1
        }
      }
    })

    return {
      todayOmset: omset,
      todayCompletedCount: completed,
      todayOrdersCount: todayOrders,
      todayWaitingCount: waiting,
      productsCount: products.length,
    }
  }, [orders, products])

  // Form states for creating / updating store
  const [storeName, setStoreName] = useState('')
  const [storeLocation, setStoreLocation] = useState('')
  const [storeDescription, setStoreDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isEditingRejected, setIsEditingRejected] = useState(false)

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!storeName.trim()) {
      setErrorMessage('Nama toko wajib diisi.')
      return
    }

    setErrorMessage('')
    setIsSubmitting(true)

    try {
      const res = await apiFetch<any>('/user-store', {
        method: 'POST',
        body: JSON.stringify({
          name: storeName.trim(),
          location: storeLocation.trim() || undefined,
          description: storeDescription.trim() || undefined,
        }),
      })

      if (!res.success) {
        throw new Error(res.error || 'Gagal mendaftarkan toko.')
      }

      await refreshStore()
      setIsEditingRejected(false)
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan saat mendaftarkan toko.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 1. STATE: USER HAS NO STORE YET -> SHOW "BUAT TOKO SAYA"
  if (!store) {
    return (
      <div className="space-y-6">
        <div className="border-b border-zinc-200/80 pb-5">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-950">Dashboard</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Selamat datang, <span className="font-medium text-zinc-900">{user?.name || 'Pengguna'}</span>
          </p>
        </div>

        <div className="max-w-lg mx-auto">
          <Card className="border-zinc-200/80 shadow-xs">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-900 shrink-0">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-zinc-950">Buat Toko Saya</CardTitle>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Lengkapi profil toko Anda untuk mulai mengelola katalog dan bot WhatsApp
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateStore} className="space-y-4">
                {errorMessage && (
                  <div className="p-3 text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg">
                    {errorMessage}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="store-name" className="text-xs font-medium text-zinc-700">
                    Nama Toko <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="store-name"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Contoh: Toko Roti Gembul"
                    required
                    className="text-xs h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="store-location" className="text-xs font-medium text-zinc-700">
                    Lokasi Toko
                  </Label>
                  <Input
                    id="store-location"
                    value={storeLocation}
                    onChange={(e) => setStoreLocation(e.target.value)}
                    placeholder="Contoh: Jakarta Selatan, DKI Jakarta"
                    className="text-xs h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="store-desc" className="text-xs font-medium text-zinc-700">
                    Deskripsi Singkat
                  </Label>
                  <Textarea
                    id="store-desc"
                    value={storeDescription}
                    onChange={(e) => setStoreDescription(e.target.value)}
                    placeholder="Deskripsi produk atau layanan toko Anda..."
                    rows={3}
                    className="text-xs resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full text-xs h-9 bg-zinc-900 text-white hover:bg-zinc-800"
                >
                  {isSubmitting ? 'Mendaftarkan Toko...' : 'Daftarkan Toko Saya'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // 2. STATE: STORE IS PENDING APPROVAL
  if (store.status === 'pending') {
    return (
      <div className="space-y-6">
        <div className="border-b border-zinc-200/80 pb-5">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-950">Dashboard</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Selamat datang, <span className="font-medium text-zinc-900">{user?.name || 'Pengguna'}</span>
          </p>
        </div>

        <div className="max-w-lg mx-auto">
          <Card className="border-zinc-200/80 shadow-xs">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-900 shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold text-zinc-950">{store.name}</CardTitle>
                    <p className="text-xs text-zinc-500 mt-0.5">Toko Anda Sedang Ditinjau Admin</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[11px] font-medium border-zinc-300 text-zinc-700 bg-zinc-50">
                  Menunggu Persetujuan
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-zinc-50 border border-zinc-200/80 rounded-lg p-3.5 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Nama Toko:</span>
                  <span className="font-medium text-zinc-900">{store.name}</span>
                </div>
                {store.location && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Lokasi:</span>
                    <span className="font-medium text-zinc-900">{store.location}</span>
                  </div>
                )}
                {store.description && (
                  <div className="pt-2 border-t border-zinc-200/60">
                    <span className="text-zinc-500 block mb-0.5">Deskripsi:</span>
                    <span className="text-zinc-700 leading-relaxed">{store.description}</span>
                  </div>
                )}
              </div>

              <div className="p-3 bg-zinc-100/70 border border-zinc-200/60 rounded-lg text-xs text-zinc-600 leading-relaxed">
                Menu Katalog, Pesanan, Penjualan, dan Pengaturan Toko akan aktif secara otomatis setelah admin menyetujui toko Anda.
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refreshStore()}
                className="w-full text-xs h-9 cursor-pointer"
              >
                Segarkan Status
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // 3. STATE: STORE IS REJECTED
  if (store.status === 'rejected') {
    return (
      <div className="space-y-6">
        <div className="border-b border-zinc-200/80 pb-5">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-950">Dashboard</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Selamat datang, <span className="font-medium text-zinc-900">{user?.name || 'Pengguna'}</span>
          </p>
        </div>

        <div className="max-w-lg mx-auto">
          {!isEditingRejected ? (
            <Card className="border-zinc-200/80 shadow-xs">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-900 shrink-0">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold text-zinc-950">{store.name}</CardTitle>
                      <p className="text-xs text-zinc-500 mt-0.5">Pengajuan Toko Belum Disetujui</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[11px] font-medium border-zinc-300 text-zinc-700 bg-zinc-50">
                    Ditolak
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Pengajuan toko Anda belum disetujui oleh admin. Anda dapat memperbarui informasi data toko dan mengajukannya kembali untuk ditinjau.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setStoreName(store.name || '')
                      setStoreLocation(store.location || '')
                      setStoreDescription(store.description || '')
                      setIsEditingRejected(true)
                    }}
                    className="w-full text-xs h-9 bg-zinc-900 text-white hover:bg-zinc-800"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Ajukan Ulang Toko
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refreshStore()}
                    className="text-xs h-9"
                  >
                    Cek Status
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-zinc-200/80 shadow-xs">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold text-zinc-950">Perbarui Informasi Toko</CardTitle>
                <p className="text-xs text-zinc-500 mt-0.5">Ajukan kembali data toko Anda untuk persetujuan admin</p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateStore} className="space-y-4">
                  {errorMessage && (
                    <div className="p-3 text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg">
                      {errorMessage}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="edit-store-name" className="text-xs font-medium text-zinc-700">
                      Nama Toko <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="edit-store-name"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      required
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="edit-store-location" className="text-xs font-medium text-zinc-700">
                      Lokasi Toko
                    </Label>
                    <Input
                      id="edit-store-location"
                      value={storeLocation}
                      onChange={(e) => setStoreLocation(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="edit-store-desc" className="text-xs font-medium text-zinc-700">
                      Deskripsi Toko
                    </Label>
                    <Textarea
                      id="edit-store-desc"
                      value={storeDescription}
                      onChange={(e) => setStoreDescription(e.target.value)}
                      rows={3}
                      className="text-xs resize-none"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingRejected(false)}
                      className="w-1/3 text-xs h-9"
                    >
                      Batal
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-2/3 text-xs h-9 bg-zinc-900 text-white hover:bg-zinc-800"
                    >
                      {isSubmitting ? 'Menyimpan...' : 'Kirim Pengajuan Ulang'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    )
  }

  // 4. STATE: STORE IS APPROVED -> FULL DASHBOARD
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-950">Dashboard</h1>
            <Badge variant="outline" className="text-[11px] font-medium border-zinc-300 text-zinc-800 bg-white">
              {store.name}
            </Badge>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Selamat datang kembali, <span className="font-medium text-zinc-900">{user?.name || 'Pengguna'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('catalog')}
            className="text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Produk</span>
          </Button>
          <Button
            size="sm"
            onClick={() => onNavigate('store-settings')}
            className="text-xs bg-zinc-900 text-white hover:bg-zinc-800"
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Pengaturan Bot</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Penjualan Hari Ini */}
        <Card
          onClick={() => onNavigate('sales')}
          className="shadow-xs cursor-pointer hover:border-zinc-300 transition-colors border-zinc-200"
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-500">Total Penjualan Hari Ini</CardTitle>
            <TrendingUp className="w-4 h-4 text-zinc-700" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold font-mono tracking-tight text-zinc-950">
              Rp {todayOmset.toLocaleString('id-ID')}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              {todayCompletedCount} transaksi tuntas hari ini
            </p>
          </CardContent>
        </Card>

        {/* Pesanan Masuk Hari Ini */}
        <Card
          onClick={() => onNavigate('orders')}
          className="shadow-xs cursor-pointer hover:border-zinc-300 transition-colors border-zinc-200"
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-500">Pesanan Masuk Hari Ini</CardTitle>
            <ShoppingCart className="w-4 h-4 text-zinc-700" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold font-mono tracking-tight text-zinc-950">
              {todayOrdersCount} Pesanan
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              {todayWaitingCount > 0 ? `${todayWaitingCount} perlu persetujuan` : 'Semua tertangani'}
            </p>
          </CardContent>
        </Card>

        {/* Total Katalog */}
        <Card
          onClick={() => onNavigate('catalog')}
          className="shadow-xs cursor-pointer hover:border-zinc-300 transition-colors border-zinc-200"
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-500">Katalog Produk</CardTitle>
            <Package className="w-4 h-4 text-zinc-700" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-semibold font-mono tracking-tight text-zinc-950">
              {productsCount} Item
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              {productsCount > 0 ? 'Semua aktif di WhatsApp' : 'Belum ada produk'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Action Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Shortcut: Bot Engine */}
        <Card className="shadow-xs hover:border-zinc-300 transition-colors">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-zinc-100 text-zinc-900">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-zinc-950">Bot Engine Toko</CardTitle>
                  <p className="text-xs text-zinc-500">Koneksi WhatsApp & integrasi Telegram Bot</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate('store-settings')}
                className="h-8 px-2 cursor-pointer"
              >
                <ArrowUpRight className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-zinc-600 leading-relaxed">
              Bot WhatsApp dan Telegram memproses format pesan pesanan otomatis seperti <span className="font-mono bg-zinc-100 px-1 py-0.5 rounded text-zinc-900 font-medium">BELI#Barang#Jumlah#Alamat</span> dan menyimpan transaksi langsung ke database.
            </p>
          </CardContent>
        </Card>

        {/* Shortcut: Katalog & Penjualan */}
        <Card className="shadow-xs hover:border-zinc-300 transition-colors">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-zinc-100 text-zinc-900">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-zinc-950">Penjualan & Pesanan</CardTitle>
                  <p className="text-xs text-zinc-500">Kelola katalog dan riwayat order pelanggan</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate('sales')}
                className="h-8 px-2 cursor-pointer"
              >
                <ArrowUpRight className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-zinc-600 leading-relaxed">
              Semua order yang dikirim pelanggan melalui obrolan WhatsApp secara real-time dicatat ke tabel penjualan untuk mempermudah rekapitulasi.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
