import React, { useState, useEffect, useMemo } from 'react'
import {
  Users,
  Store,
  Clock,
  CheckCircle,
  XCircle,
  Search,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Building,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { AuthProvider, useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'

interface AdminStats {
  totalStores: number
  pendingStores: number
  approvedStores: number
  rejectedStores: number
  totalUsers: number
}

interface StoreOwner {
  id: number
  uid: string
  name: string
  username: string
  email: string
  profileUrl?: string | null
}

interface AdminStoreItem {
  id: number
  storeUseruid: string
  name: string
  location?: string | null
  description?: string | null
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  updatedAt: string
  owner?: StoreOwner | null
}

interface AdminUserItem {
  id: number
  uid: string
  name: string
  username: string
  email: string
  role: 'admin' | 'user'
  storeName?: string | null
  profileUrl?: string | null
  createdAt: string
  store?: {
    id: number
    name: string
    status: 'pending' | 'approved' | 'rejected'
  } | null
}

const AdminDashboardContent: React.FC = () => {
  const { user, isAuthenticated, isLoading, logout } = useAuth()

  const [activeTab, setActiveTab] = useState<'stores' | 'users'>('stores')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [stores, setStores] = useState<AdminStoreItem[]>([])
  const [users, setUsers] = useState<AdminUserItem[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [storeStatusFilter, setStoreStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  // Redirect if not admin
  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated || user?.role !== 'admin') {
        window.location.replace('/dashboard')
      }
    }
  }, [isLoading, isAuthenticated, user])

  // Fetch all admin data
  const fetchData = async () => {
    setLoadingData(true)
    try {
      const [statsRes, storesRes, usersRes] = await Promise.all([
        apiFetch<{ totalStores: number; pendingStores: number; approvedStores: number; rejectedStores: number; totalUsers: number }>('/admin/stats'),
        apiFetch<AdminStoreItem[]>('/admin/stores'),
        apiFetch<AdminUserItem[]>('/admin/users'),
      ])

      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data)
      }
      if (storesRes.success && storesRes.data) {
        setStores(storesRes.data)
      }
      if (usersRes.success && usersRes.data) {
        setUsers(usersRes.data)
      }
    } catch {
      // Ignore network errors on data fetch
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated && user?.role === 'admin') {
      fetchData()
    }
  }, [isAuthenticated, user])

  // Handle store status update
  const handleUpdateStoreStatus = async (storeId: number, status: 'approved' | 'rejected') => {
    setActionLoadingId(storeId)
    setActionMessage(null)
    try {
      const res = await apiFetch<any>(`/admin/stores/${storeId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      })

      if (res.success) {
        setActionMessage(res.message || `Status toko berhasil diubah menjadi ${status}.`)
        await fetchData()
      } else {
        alert(res.error || 'Gagal mengubah status toko.')
      }
    } catch (err: any) {
      alert(err.message || 'Terjadi kesalahan sistem.')
    } finally {
      setActionLoadingId(null)
    }
  }

  // Handle user role update
  const handleUpdateUserRole = async (userId: number, currentRole: 'admin' | 'user') => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin'
    const confirmChange = window.confirm(
      `Apakah Anda yakin ingin mengubah role pengguna ini menjadi "${newRole.toUpperCase()}"?`
    )
    if (!confirmChange) return

    setActionLoadingId(userId)
    try {
      const res = await apiFetch<any>(`/admin/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole }),
      })

      if (res.success) {
        await fetchData()
      } else {
        alert(res.error || 'Gagal mengubah role pengguna.')
      }
    } catch (err: any) {
      alert(err.message || 'Terjadi kesalahan sistem.')
    } finally {
      setActionLoadingId(null)
    }
  }

  // Filtered stores
  const filteredStores = useMemo(() => {
    return stores.filter((s) => {
      const matchStatus = storeStatusFilter === 'all' || s.status === storeStatusFilter
      const q = searchQuery.toLowerCase().trim()
      if (!q) return matchStatus

      const matchName = s.name.toLowerCase().includes(q)
      const matchOwnerName = s.owner?.name?.toLowerCase().includes(q) || false
      const matchOwnerUsername = s.owner?.username?.toLowerCase().includes(q) || false
      const matchLocation = s.location?.toLowerCase().includes(q) || false

      return matchStatus && (matchName || matchOwnerName || matchOwnerUsername || matchLocation)
    })
  }, [stores, storeStatusFilter, searchQuery])

  // Filtered users
  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return users
    return users.filter((u) => {
      return (
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.storeName && u.storeName.toLowerCase().includes(q))
      )
    })
  }, [users, searchQuery])

  if (isLoading || !isAuthenticated || user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#fafafa] text-zinc-950 flex items-center justify-center p-4">
        <div className="bg-white border border-zinc-200/80 rounded-xl px-4 py-2.5 text-xs text-zinc-600 font-medium shadow-xs">
          Memeriksa hak akses admin...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-950 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="h-16 bg-white border-b border-zinc-200/80 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30 select-none">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="REUANG" className="h-6 w-auto object-contain" />
          <div className="h-4 w-px bg-zinc-200" />
          <Badge variant="outline" className="text-[10px] font-mono tracking-wider uppercase border-zinc-300 text-zinc-800 bg-zinc-50">
            Admin Panel
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-zinc-900">{user.name}</span>
            <Badge className="text-[10px] bg-zinc-900 text-white hover:bg-zinc-800">
              Admin
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={logout}
            className="text-xs h-8 text-zinc-600 hover:text-zinc-950"
          >
            <LogOut className="w-3.5 h-3.5 mr-1" />
            Keluar
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-6">
        {/* Banner Alert */}
        {actionMessage && (
          <div className="p-3 bg-zinc-900 text-white rounded-lg text-xs flex items-center justify-between shadow-xs">
            <span>{actionMessage}</span>
            <button
              type="button"
              onClick={() => setActionMessage(null)}
              className="text-zinc-400 hover:text-white text-xs cursor-pointer ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/80 pb-5">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-950">Panel Administrasi</h1>
            <p className="text-xs text-zinc-500 mt-0.5">Kelola verifikasi toko mitra dan data akun pengguna</p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loadingData}
            className="text-xs h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loadingData ? 'animate-spin' : ''}`} />
            Segarkan Data
          </Button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="shadow-xs border-zinc-200/80">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-zinc-500">Total Pengguna</CardTitle>
              <Users className="w-4 h-4 text-zinc-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold font-mono tracking-tight text-zinc-950">
                {stats ? stats.totalUsers : '-'}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">Akun terdaftar di sistem</p>
            </CardContent>
          </Card>

          <Card className="shadow-xs border-zinc-200/80">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-zinc-500">Total Toko</CardTitle>
              <Building className="w-4 h-4 text-zinc-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold font-mono tracking-tight text-zinc-950">
                {stats ? stats.totalStores : '-'}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">Toko dibuat oleh mitra</p>
            </CardContent>
          </Card>

          <Card className="shadow-xs border-zinc-200/80">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-zinc-500">Menunggu Persetujuan</CardTitle>
              <Clock className="w-4 h-4 text-zinc-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold font-mono tracking-tight text-zinc-950">
                {stats ? stats.pendingStores : '-'}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">Memerlukan verifikasi admin</p>
            </CardContent>
          </Card>

          <Card className="shadow-xs border-zinc-200/80">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-zinc-500">Toko Disetujui</CardTitle>
              <CheckCircle className="w-4 h-4 text-zinc-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold font-mono tracking-tight text-zinc-950">
                {stats ? stats.approvedStores : '-'}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">Aktif beroperasi</p>
            </CardContent>
          </Card>
        </div>

        {/* Tab Switcher & Search Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 border border-zinc-200/80 rounded-lg p-1 bg-white shadow-xs">
            <button
              type="button"
              onClick={() => {
                setActiveTab('stores')
                setSearchQuery('')
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'stores'
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              Persetujuan Toko ({stores.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('users')
                setSearchQuery('')
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'users'
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              Daftar Pengguna ({users.length})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={activeTab === 'stores' ? 'Cari nama toko, pemilik...' : 'Cari pengguna, email...'}
              className="pl-8 text-xs h-9 bg-white"
            />
          </div>
        </div>

        {/* ================= TAB 1: PERSETUJUAN TOKO ================= */}
        {activeTab === 'stores' && (
          <div className="space-y-4">
            {/* Status Filter Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                variant={storeStatusFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStoreStatusFilter('all')}
                className={`text-xs h-7 px-2.5 ${storeStatusFilter === 'all' ? 'bg-zinc-900 text-white' : ''}`}
              >
                Semua ({stores.length})
              </Button>
              <Button
                variant={storeStatusFilter === 'pending' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStoreStatusFilter('pending')}
                className={`text-xs h-7 px-2.5 ${storeStatusFilter === 'pending' ? 'bg-zinc-900 text-white' : ''}`}
              >
                Menunggu ({stores.filter((s) => s.status === 'pending').length})
              </Button>
              <Button
                variant={storeStatusFilter === 'approved' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStoreStatusFilter('approved')}
                className={`text-xs h-7 px-2.5 ${storeStatusFilter === 'approved' ? 'bg-zinc-900 text-white' : ''}`}
              >
                Disetujui ({stores.filter((s) => s.status === 'approved').length})
              </Button>
              <Button
                variant={storeStatusFilter === 'rejected' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStoreStatusFilter('rejected')}
                className={`text-xs h-7 px-2.5 ${storeStatusFilter === 'rejected' ? 'bg-zinc-900 text-white' : ''}`}
              >
                Ditolak ({stores.filter((s) => s.status === 'rejected').length})
              </Button>
            </div>

            {/* Stores List */}
            {filteredStores.length === 0 ? (
              <Card className="border-zinc-200/80 shadow-xs p-8 text-center bg-white">
                <Store className="w-8 h-8 mx-auto text-zinc-400 mb-2" />
                <p className="text-xs text-zinc-600 font-medium">Tidak ada data toko yang cocok.</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredStores.map((item) => {
                  const isActionBusy = actionLoadingId === item.id
                  return (
                    <Card key={item.id} className="border-zinc-200/80 shadow-xs bg-white">
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          {/* Store Info */}
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h2 className="text-sm font-semibold text-zinc-950 truncate">{item.name}</h2>
                              {item.status === 'pending' && (
                                <Badge variant="outline" className="text-[10px] border-zinc-300 text-zinc-700 bg-zinc-50">
                                  Menunggu
                                </Badge>
                              )}
                              {item.status === 'approved' && (
                                <Badge className="text-[10px] bg-zinc-900 text-white">
                                  Disetujui
                                </Badge>
                              )}
                              {item.status === 'rejected' && (
                                <Badge variant="outline" className="text-[10px] border-zinc-300 text-zinc-500 bg-zinc-50 line-through">
                                  Ditolak
                                </Badge>
                              )}
                            </div>

                            {item.description && (
                              <p className="text-xs text-zinc-600 line-clamp-2 leading-relaxed">
                                {item.description}
                              </p>
                            )}

                            <div className="flex items-center gap-4 text-[11px] text-zinc-500 flex-wrap pt-1">
                              {item.location && (
                                <span>Lokasi: <span className="text-zinc-700 font-medium">{item.location}</span></span>
                              )}
                              {item.owner && (
                                <span>Pemilik: <span className="text-zinc-700 font-medium">{item.owner.name}</span> (@{item.owner.username})</span>
                              )}
                              <span>Diajukan: {new Date(item.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-zinc-100">
                            {item.status !== 'approved' && (
                              <Button
                                size="sm"
                                disabled={isActionBusy}
                                onClick={() => handleUpdateStoreStatus(item.id, 'approved')}
                                className="text-xs h-8 bg-zinc-900 text-white hover:bg-zinc-800"
                              >
                                <CheckCircle className="w-3.5 h-3.5 mr-1" />
                                Setujui
                              </Button>
                            )}

                            {item.status !== 'rejected' && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isActionBusy}
                                onClick={() => handleUpdateStoreStatus(item.id, 'rejected')}
                                className="text-xs h-8 text-zinc-700 hover:text-zinc-950"
                              >
                                <XCircle className="w-3.5 h-3.5 mr-1" />
                                Tolak
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: DAFTAR PENGGUNA ================= */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <Card className="border-zinc-200/80 shadow-xs bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 border-b border-zinc-200/80 text-zinc-500 font-medium">
                    <tr>
                      <th className="py-3 px-4">Pengguna</th>
                      <th className="py-3 px-4">Username</th>
                      <th className="py-3 px-4">Toko Terkait</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-zinc-500">
                          Tidak ada pengguna yang cocok.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => {
                        const isActionBusy = actionLoadingId === u.id
                        return (
                          <tr key={u.id} className="hover:bg-zinc-50/60 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-zinc-900">{u.name}</div>
                              <div className="text-[11px] text-zinc-500">{u.email}</div>
                            </td>
                            <td className="py-3 px-4 font-mono text-zinc-700">@{u.username}</td>
                            <td className="py-3 px-4">
                              {u.store ? (
                                <div className="space-y-0.5">
                                  <span className="font-medium text-zinc-900">{u.store.name}</span>
                                  <div>
                                    {u.store.status === 'approved' && (
                                      <span className="text-[10px] text-zinc-600">Disetujui</span>
                                    )}
                                    {u.store.status === 'pending' && (
                                      <span className="text-[10px] text-zinc-500">Menunggu</span>
                                    )}
                                    {u.store.status === 'rejected' && (
                                      <span className="text-[10px] text-zinc-400">Ditolak</span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-zinc-400">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {u.role === 'admin' ? (
                                <Badge className="text-[10px] bg-zinc-900 text-white">
                                  Admin
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] border-zinc-200 text-zinc-700">
                                  User
                                </Badge>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isActionBusy}
                                onClick={() => handleUpdateUserRole(u.id, u.role)}
                                className="text-[11px] h-7 px-2.5 cursor-pointer"
                              >
                                {u.role === 'admin' ? 'Ubah ke User' : 'Ubah ke Admin'}
                              </Button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}

export const AdminDashboard: React.FC = () => {
  return (
    <AuthProvider>
      <AdminDashboardContent />
    </AuthProvider>
  )
}
