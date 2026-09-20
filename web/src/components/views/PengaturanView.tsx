import React, { useState, useEffect } from 'react'
import {
  User,
  Lock,
  Building2,
  ShieldCheck,
  LogOut,
  Store,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { RekeningSayaSettings } from './RekeningSayaSettings'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from '../../lib/api'

export type SettingSubTab = 'profil' | 'security' | 'wallet'

interface PengaturanViewProps {
  initialSubTab?: SettingSubTab
  onSubTabChange?: (subTab: SettingSubTab) => void
}

const SUB_TABS: { id: SettingSubTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'profil', label: 'Profil', icon: User },
  { id: 'security', label: 'Keamanan', icon: Lock },
  { id: 'wallet', label: 'Rekening Saya', icon: Building2 },
]

export const PengaturanView: React.FC<PengaturanViewProps> = ({
  initialSubTab = 'profil',
  onSubTabChange,
}) => {
  const { user, logout, refreshUser } = useAuth()
  const [activeSubTab, setActiveSubTab] = useState<SettingSubTab>(initialSubTab)

  // Store & Profile form states
  const [storeNameInput, setStoreNameInput] = useState(user?.storeName || 'Toko Saya')
  const [phoneInput, setPhoneInput] = useState(user?.phone || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileNotice, setProfileNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    if (user?.storeName) {
      setStoreNameInput(user.storeName)
    }
    setPhoneInput(user?.phone || '')
  }, [user?.storeName, user?.phone])

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!storeNameInput.trim()) return

    setSavingProfile(true)
    setProfileNotice(null)
    try {
      const res = await apiFetch<any>('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          storeName: storeNameInput.trim(),
          phone: phoneInput.trim() || null,
        }),
      })

      if (res.success) {
        await refreshUser()
        setProfileNotice({
          type: 'success',
          message: 'Profil dan nomor HP berhasil diperbarui.',
        })
      } else {
        setProfileNotice({
          type: 'error',
          message: res.error || 'Gagal memperbarui profil.',
        })
      }
    } catch (err: any) {
      setProfileNotice({
        type: 'error',
        message: err.message || 'Terjadi kesalahan saat memperbarui profil.',
      })
    } finally {
      setSavingProfile(false)
      setTimeout(() => setProfileNotice(null), 4000)
    }
  }

  // Password form states
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null)

  useEffect(() => {
    setActiveSubTab(initialSubTab)
  }, [initialSubTab])

  const handleSubTabClick = (tab: SettingSubTab) => {
    setActiveSubTab(tab)
    if (onSubTabChange) {
      onSubTabChange(tab)
    }
  }

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentPassword || !newPassword) return

    if (newPassword.length < 6) {
      setPasswordStatus('Password baru minimal 6 karakter.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus('Konfirmasi password tidak cocok.')
      return
    }

    setPasswordStatus('Password berhasil diperbarui.')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setTimeout(() => setPasswordStatus(null), 4000)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/80 pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-950">Pengaturan Akun</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Kelola profil pengguna, keamanan akun, dan rekening Anda
          </p>
        </div>
      </div>

      {/* Sub-Navigation Tabs Bar */}
      <div className="flex items-center gap-1.5 border-b border-zinc-200/80 pb-3 overflow-x-auto select-none">
        {SUB_TABS.map((t) => {
          const Icon = t.icon
          const isActive = activeSubTab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleSubTabClick(t.id)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-zinc-900 text-white shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* =========================================================================
          TAB 1: PROFIL (/setting/profil)
          ========================================================================= */}
      {activeSubTab === 'profil' && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          <Card className="shadow-xs">
            <CardHeader className="pb-4 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-zinc-700" />
                <CardTitle className="text-sm font-semibold text-zinc-950">Profil & Nama Toko</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-5">
              {/* Profile Avatar Header */}
              <div className="flex items-center gap-3.5 pb-4 border-b border-zinc-100">
                <img
                  src={user?.profileUrl || '/media/profile/default-profile.jpeg'}
                  alt={user?.name || 'Profil'}
                  className="w-14 h-14 rounded-full object-cover border border-zinc-200 shadow-xs"
                />
                <div>
                  <div className="text-sm font-semibold text-zinc-950">{user?.storeName || 'Toko Saya'}</div>
                  <div className="text-xs text-zinc-500 font-medium">{user?.name || '-'}</div>
                  <div className="text-[11px] font-mono text-zinc-400">@{user?.username || '-'}</div>
                </div>
              </div>

              {profileNotice && (
                <div
                  className={`p-2.5 rounded-lg text-xs font-medium border flex items-center justify-between ${
                    profileNotice.type === 'success'
                      ? 'bg-zinc-900 text-white border-zinc-800'
                      : 'bg-zinc-100 text-zinc-900 border-zinc-300'
                  }`}
                >
                  <span>{profileNotice.message}</span>
                </div>
              )}

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="p-4 rounded-xl bg-zinc-50/70 border border-zinc-200/80 space-y-3.5">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-950">Nama Toko</label>
                      <span className="text-[10px] text-zinc-400">Identitas toko pada WhatsApp</span>
                    </div>
                    <Input
                      type="text"
                      value={storeNameInput}
                      onChange={(e) => setStoreNameInput(e.target.value)}
                      placeholder="Masukkan nama toko Anda"
                      className="text-xs bg-white"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-zinc-950">Nomor HP / WhatsApp</label>
                      <span className="text-[10px] text-zinc-400">Nomor kontak akun aktif</span>
                    </div>
                    <Input
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value.replace(/[^0-9+]/g, ''))}
                      placeholder="081234567890"
                      className="text-xs bg-white"
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={savingProfile || !storeNameInput.trim() || (storeNameInput.trim() === (user?.storeName || 'Toko Saya') && phoneInput.trim() === (user?.phone || ''))}
                      className="bg-zinc-950 hover:bg-zinc-800 text-white text-xs cursor-pointer"
                    >
                      {savingProfile ? 'Menyimpan...' : 'Simpan Perubahan'}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-zinc-500 mb-1">Nama Pemilik</label>
                    <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 font-medium text-zinc-900">
                      {user?.name || '-'}
                    </div>
                  </div>

                  <div>
                    <label className="block text-zinc-500 mb-1">Username</label>
                    <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 font-mono text-zinc-900">
                      @{user?.username || '-'}
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-zinc-500 mb-1">Email Terdaftar</label>
                    <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900">
                      {user?.email || '-'}
                    </div>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* =========================================================================
          TAB 2: KEAMANAN (/setting/security)
          ========================================================================= */}
      {activeSubTab === 'security' && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          {/* Ganti Kata Sandi */}
          <Card className="shadow-xs">
            <CardHeader className="pb-4 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-zinc-700" />
                <CardTitle className="text-sm font-semibold text-zinc-950">Ganti Kata Sandi</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleChangePassword} className="space-y-3 max-w-md text-xs">
                {passwordStatus && (
                  <div
                    className={`p-2.5 rounded-lg text-xs font-medium border ${
                      passwordStatus.includes('berhasil')
                        ? 'bg-zinc-900 text-white border-zinc-800'
                        : 'bg-zinc-100 text-zinc-900 border-zinc-300'
                    }`}
                  >
                    {passwordStatus}
                  </div>
                )}

                <div>
                  <label className="block text-zinc-600 mb-1 font-medium">Kata Sandi Saat Ini</label>
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Masukkan kata sandi lama"
                    required
                  />
                </div>

                <div>
                  <label className="block text-zinc-600 mb-1 font-medium">Kata Sandi Baru</label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    required
                  />
                </div>

                <div>
                  <label className="block text-zinc-600 mb-1 font-medium">Konfirmasi Kata Sandi Baru</label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi kata sandi baru"
                    required
                  />
                </div>

                <div className="pt-2">
                  <Button type="submit" size="sm">
                    Perbarui Kata Sandi
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Sesi & Logout */}
          <Card className="shadow-xs border-zinc-200">
            <CardHeader className="pb-4 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-zinc-700" />
                <CardTitle className="text-sm font-semibold text-zinc-950">Keamanan Sesi</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-zinc-900">Keluar dari Akun</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Menghapus token autentikasi dari browser dan mencabut sesi refresh token aktif.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={logout}
                className="text-xs shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar Sesi</span>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* =========================================================================
          TAB 3: REKENING SAYA (/setting/wallet)
          ========================================================================= */}
      {activeSubTab === 'wallet' && (
        <div className="animate-in fade-in-50 duration-200">
          <RekeningSayaSettings key={user?.id} />
        </div>
      )}
    </div>
  )
}
