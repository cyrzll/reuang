import React, { useState, useEffect } from 'react'
import {
  Bot,
  Store,
  CreditCard,
  Bell,
  Smartphone,
  Send,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ExternalLink,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Badge } from '../ui/badge'
import { UserBotDashboard } from '../UserBotDashboard'
import { RekeningSayaSettings } from './RekeningSayaSettings'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from '../../lib/api'

export type StoreSettingSubTab = 'bots' | 'profile' | 'payments' | 'notifications'
export type BotType = 'whatsapp' | 'telegram'

interface PengaturanTokoViewProps {
  initialSubTab?: StoreSettingSubTab
  initialBotType?: BotType
}

const SUB_TABS: { id: StoreSettingSubTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'bots', label: 'Bot Saya', icon: Bot },
  { id: 'profile', label: 'Profil Toko', icon: Store },
  { id: 'payments', label: 'Metode Pembayaran', icon: CreditCard },
  { id: 'notifications', label: 'Notifikasi', icon: Bell },
]

export const PengaturanTokoView: React.FC<PengaturanTokoViewProps> = ({
  initialSubTab = 'bots',
  initialBotType = 'whatsapp',
}) => {
  const { store, user, refreshStore, refreshUser } = useAuth()

  const [activeSubTab, setActiveSubTab] = useState<StoreSettingSubTab>(initialSubTab)
  const [activeBot, setActiveBot] = useState<BotType>(initialBotType)

  // Feedback toast/notice
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const showNotice = (type: 'success' | 'error', message: string) => {
    setNotice({ type, message })
    setTimeout(() => setNotice(null), 4000)
  }

  // ---------------------------------------------------------------------------
  // Profile Form States
  // ---------------------------------------------------------------------------
  const [storeName, setStoreName] = useState(store?.name || user?.storeName || '')
  const [storeLocation, setStoreLocation] = useState(store?.location || '')
  const [storeDescription, setStoreDescription] = useState(store?.description || '')
  const [savingProfile, setSavingProfile] = useState(false)

  useEffect(() => {
    if (store) {
      setStoreName(store.name || '')
      setStoreLocation(store.location || '')
      setStoreDescription(store.description || '')
      setTelegramToken(store.telegramBotToken || '')
      setTelegramUsername(store.telegramBotUsername || '')
      setTelegramActive(Boolean(store.telegramActive))
    }
  }, [store])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!storeName.trim()) {
      showNotice('error', 'Nama toko tidak boleh kosong.')
      return
    }

    setSavingProfile(true)
    try {
      const res = await apiFetch<any>('/user-store', {
        method: 'PUT',
        body: JSON.stringify({
          name: storeName.trim(),
          location: storeLocation.trim(),
          description: storeDescription.trim(),
        }),
      })

      if (res.success) {
        await Promise.all([refreshStore(), refreshUser()])
        showNotice('success', 'Profil toko berhasil diperbarui.')
      } else {
        showNotice('error', res.error || 'Gagal memperbarui profil toko.')
      }
    } catch {
      showNotice('error', 'Terjadi kesalahan koneksi saat menyimpan.')
    } finally {
      setSavingProfile(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Telegram Bot Form States
  // ---------------------------------------------------------------------------
  const [telegramToken, setTelegramToken] = useState(store?.telegramBotToken || '')
  const [telegramUsername, setTelegramUsername] = useState(store?.telegramBotUsername || '')
  const [telegramActive, setTelegramActive] = useState(Boolean(store?.telegramActive))
  const [showToken, setShowToken] = useState(false)
  const [savingTelegram, setSavingTelegram] = useState(false)
  const [testingTelegram, setTestingTelegram] = useState(false)
  const [telegramBotInfo, setTelegramBotInfo] = useState<{ id: number; name: string; username: string } | null>(null)

  const handleTestTelegram = async () => {
    const tokenToTest = telegramToken.trim()
    if (!tokenToTest) {
      showNotice('error', 'Masukkan token Telegram Bot terlebih dahulu.')
      return
    }

    setTestingTelegram(true)
    setTelegramBotInfo(null)
    try {
      const res = await apiFetch<any>('/user-store/test-telegram', {
        method: 'POST',
        body: JSON.stringify({ token: tokenToTest }),
      })

      if (res.success && res.bot) {
        setTelegramBotInfo(res.bot)
        if (res.bot.username && !telegramUsername) {
          setTelegramUsername(res.bot.username)
        }
        showNotice('success', `Koneksi berhasil: @${res.bot.username} (${res.bot.name})`)
      } else {
        showNotice('error', res.error || 'Token Telegram Bot tidak valid.')
      }
    } catch {
      showNotice('error', 'Gagal memverifikasi token ke server Telegram.')
    } finally {
      setTestingTelegram(false)
    }
  }

  const handleSaveTelegram = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingTelegram(true)
    try {
      const res = await apiFetch<any>('/user-store', {
        method: 'PUT',
        body: JSON.stringify({
          telegramBotToken: telegramToken.trim() || null,
          telegramBotUsername: telegramUsername.trim() || null,
          telegramActive,
        }),
      })

      if (res.success) {
        await refreshStore()
        showNotice('success', 'Pengaturan Bot Telegram berhasil disimpan.')
      } else {
        showNotice('error', res.error || 'Gagal menyimpan pengaturan Telegram.')
      }
    } catch {
      showNotice('error', 'Terjadi kesalahan koneksi.')
    } finally {
      setSavingTelegram(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Notifications Preferences States
  // ---------------------------------------------------------------------------
  const [notifyWa, setNotifyWa] = useState(true)
  const [notifyTg, setNotifyTg] = useState(true)
  const [savingNotify, setSavingNotify] = useState(false)

  const handleSaveNotification = (e: React.FormEvent) => {
    e.preventDefault()
    setSavingNotify(true)
    setTimeout(() => {
      setSavingNotify(false)
      showNotice('success', 'Preferensi notifikasi berhasil disimpan.')
    }, 400)
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Toast Notice */}
      {notice && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-xs font-medium shadow-md border flex items-center gap-2 ${
            notice.type === 'success'
              ? 'bg-zinc-950 text-white border-zinc-800'
              : 'bg-white text-zinc-900 border-zinc-200'
          }`}
        >
          {notice.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          )}
          <span>{notice.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/80 pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-950">Pengaturan Toko</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Kelola konfigurasi bot WhatsApp &amp; Telegram, profil usaha, serta metode pembayaran.
          </p>
        </div>
      </div>

      {/* Top Sub-Nav Pills */}
      <div className="flex border-b border-zinc-200/80 overflow-x-auto gap-1">
        {SUB_TABS.map((sub) => {
          const Icon = sub.icon
          const isActive = activeSubTab === sub.id
          return (
            <button
              key={sub.id}
              type="button"
              onClick={() => setActiveSubTab(sub.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
                isActive
                  ? 'border-zinc-950 text-zinc-950 font-semibold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-zinc-950' : 'text-zinc-400'}`} />
              <span>{sub.label}</span>
            </button>
          )
        })}
      </div>

      {/* -----------------------------------------------------------------------
          SUB-TAB 1: BOT SAYA (WhatsApp & Telegram)
          ----------------------------------------------------------------------- */}
      {activeSubTab === 'bots' && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          {/* Bot Type Segmented Switcher */}
          <div className="flex items-center justify-between border border-zinc-200/80 rounded-xl p-1.5 bg-zinc-50/70 max-w-md">
            <button
              type="button"
              onClick={() => setActiveBot('whatsapp')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeBot === 'whatsapp'
                  ? 'bg-white text-zinc-950 shadow-xs font-semibold'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>WhatsApp Bot</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveBot('telegram')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                activeBot === 'telegram'
                  ? 'bg-white text-zinc-950 shadow-xs font-semibold'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Telegram Bot</span>
            </button>
          </div>

          {/* WhatsApp Bot Content */}
          {activeBot === 'whatsapp' && (
            <div className="space-y-4">
              <UserBotDashboard />
            </div>
          )}

          {/* Telegram Bot Content */}
          {activeBot === 'telegram' && (
            <div className="space-y-6">
              <Card className="shadow-xs border border-zinc-200/80">
                <CardHeader className="pb-3 border-b border-zinc-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold text-zinc-950">
                        Integrasi Telegram Bot
                      </CardTitle>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Hubungkan toko Anda dengan bot Telegram untuk menerima pesanan otomatis.
                      </p>
                    </div>
                    <Badge variant={telegramActive && telegramToken ? 'default' : 'outline'}>
                      {telegramActive && telegramToken ? 'Bot Aktif' : 'Nonaktif'}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="pt-5">
                  <form onSubmit={handleSaveTelegram} className="space-y-4">
                    {/* Bot Token Field */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-900 flex items-center justify-between">
                        <span>Bot Token Telegram</span>
                        <span className="text-[11px] text-zinc-400 font-normal">
                          Didapat dari @BotFather
                        </span>
                      </label>
                      <div className="relative">
                        <Input
                          type={showToken ? 'text' : 'password'}
                          value={telegramToken}
                          onChange={(e) => setTelegramToken(e.target.value)}
                          placeholder="Contoh: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                          className="font-mono text-xs pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowToken(!showToken)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                        >
                          {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Bot Username Field */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-900">
                        Username Bot Telegram
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xs font-mono">
                          @
                        </span>
                        <Input
                          type="text"
                          value={telegramUsername.replace(/^@/, '')}
                          onChange={(e) => setTelegramUsername(e.target.value.replace(/^@/, ''))}
                          placeholder="namabot_anda_bot"
                          className="pl-7 text-xs font-mono"
                        />
                      </div>
                    </div>

                    {/* Active Status Toggle */}
                    <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-medium text-zinc-900">Status Aktif Bot</div>
                        <div className="text-[11px] text-zinc-500">
                          Aktifkan bot untuk merespons pesan pembeli
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTelegramActive(!telegramActive)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                          telegramActive ? 'bg-zinc-900' : 'bg-zinc-200'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            telegramActive ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Verified Bot Info Banner */}
                    {telegramBotInfo && (
                      <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-lg text-xs space-y-1">
                        <div className="font-semibold text-zinc-950 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Bot Terverifikasi: {telegramBotInfo.name}</span>
                        </div>
                        <div className="text-zinc-500 font-mono">
                          ID: {telegramBotInfo.id} | @{telegramBotInfo.username}
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="pt-3 flex items-center gap-3">
                      <Button
                        type="submit"
                        disabled={savingTelegram}
                        className="text-xs bg-zinc-900 text-white hover:bg-zinc-800"
                      >
                        {savingTelegram ? 'Menyimpan...' : 'Simpan Pengaturan Telegram'}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        disabled={testingTelegram || !telegramToken}
                        onClick={handleTestTelegram}
                        className="text-xs border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                      >
                        {testingTelegram ? 'Memeriksa...' : 'Uji Koneksi Token'}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              {/* Telegram Guide Card */}
              <Card className="shadow-xs border border-zinc-200/80 bg-zinc-50/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Panduan Membuat Bot Telegram
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5 text-xs text-zinc-600">
                  <div className="flex items-start gap-2.5">
                    <span className="font-mono font-bold text-zinc-900">1.</span>
                    <span>
                      Buka aplikasi Telegram dan cari akun resmi{' '}
                      <a
                        href="https://t.me/BotFather"
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-zinc-900 underline hover:text-black inline-flex items-center gap-0.5"
                      >
                        @BotFather <ExternalLink className="w-3 h-3" />
                      </a>
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="font-mono font-bold text-zinc-900">2.</span>
                    <span>
                      Kirim perintah <code className="bg-zinc-200/80 px-1 py-0.5 rounded font-mono text-zinc-900">/newbot</code> lalu ikuti instruksi untuk mengisi nama dan username bot.
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="font-mono font-bold text-zinc-900">3.</span>
                    <span>
                      Salin HTTP API Token yang diberikan oleh BotFather lalu tempelkan ke kolom form di atas.
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* -----------------------------------------------------------------------
          SUB-TAB 2: PROFIL TOKO
          ----------------------------------------------------------------------- */}
      {activeSubTab === 'profile' && (
        <Card className="shadow-xs border border-zinc-200/80 animate-in fade-in-50 duration-200">
          <CardHeader className="pb-3 border-b border-zinc-100">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-zinc-950">
                  Profil Usaha / Toko
                </CardTitle>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Informasi ini akan ditampilkan kepada pembeli pada pesan sambutan bot.
                </p>
              </div>
              <Badge variant={store?.status === 'approved' ? 'default' : 'outline'}>
                {store?.status === 'approved' ? 'Disetujui' : store?.status === 'pending' ? 'Menunggu' : 'Draft'}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="pt-5">
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-900">Nama Toko</label>
                <Input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Contoh: Toko Mwani"
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-900">Lokasi / Alamat Toko</label>
                <Input
                  type="text"
                  value={storeLocation}
                  onChange={(e) => setStoreLocation(e.target.value)}
                  placeholder="Contoh: Jl. Sudirman No. 12, Jakarta"
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-900">Deskripsi Singkat</label>
                <Textarea
                  value={storeDescription}
                  onChange={(e) => setStoreDescription(e.target.value)}
                  placeholder="Jelaskan produk atau layanan yang ditawarkan toko Anda..."
                  className="text-xs resize-none h-24"
                />
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={savingProfile}
                  className="text-xs bg-zinc-900 text-white hover:bg-zinc-800"
                >
                  {savingProfile ? 'Menyimpan...' : 'Simpan Profil Toko'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* -----------------------------------------------------------------------
          SUB-TAB 3: METODE PEMBAYARAN
          ----------------------------------------------------------------------- */}
      {activeSubTab === 'payments' && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          <RekeningSayaSettings />
        </div>
      )}

      {/* -----------------------------------------------------------------------
          SUB-TAB 4: NOTIFIKASI
          ----------------------------------------------------------------------- */}
      {activeSubTab === 'notifications' && (
        <Card className="shadow-xs border border-zinc-200/80 animate-in fade-in-50 duration-200">
          <CardHeader className="pb-3 border-b border-zinc-100">
            <CardTitle className="text-sm font-semibold text-zinc-950">
              Notifikasi Pesanan
            </CardTitle>
            <p className="text-xs text-zinc-500 mt-0.5">
              Atur bagaimana Anda ingin menerima pemberitahuan setiap ada transaksi atau pesanan baru.
            </p>
          </CardHeader>

          <CardContent className="pt-5">
            <form onSubmit={handleSaveNotification} className="space-y-4">
              <div className="flex items-center justify-between p-3 border border-zinc-200/80 rounded-xl bg-zinc-50/50">
                <div>
                  <div className="text-xs font-medium text-zinc-900">Notifikasi via WhatsApp</div>
                  <div className="text-[11px] text-zinc-500">
                    Kirim pesan rangkuman pesanan otomatis ke nomor WhatsApp pemilik
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setNotifyWa(!notifyWa)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    notifyWa ? 'bg-zinc-900' : 'bg-zinc-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      notifyWa ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 border border-zinc-200/80 rounded-xl bg-zinc-50/50">
                <div>
                  <div className="text-xs font-medium text-zinc-900">Notifikasi via Telegram</div>
                  <div className="text-[11px] text-zinc-500">
                    Terima notifikasi instan melalui bot Telegram saat pelanggan menyelesaikan checkout
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setNotifyTg(!notifyTg)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    notifyTg ? 'bg-zinc-900' : 'bg-zinc-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      notifyTg ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={savingNotify}
                  className="text-xs bg-zinc-900 text-white hover:bg-zinc-800"
                >
                  {savingNotify ? 'Menyimpan...' : 'Simpan Preferensi Notifikasi'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
