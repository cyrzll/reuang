import React, { useState, useEffect } from 'react'
import {
  RotateCw,
  Building2,
  AlertCircle,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { useAuth } from '../context/AuthContext'
import { apiFetch, API_BASE } from '../lib/api'
import type { SessionInfo } from './types'

export const UserBotDashboard: React.FC = () => {
  const { user, token } = useAuth()

  const [session, setSession] = useState<SessionInfo>({
    sessionId: user ? `user_${user.id}` : '',
    userName: user ? user.name : '',
    phoneNumber: null,
    status: 'disconnected',
    qrCode: null,
    qrDataUrl: null,
    isBusiness: false,
    errorMessage: null,
  })

  const [actionLoading, setActionLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  // Fetch session status with JWT via apiFetch
  const fetchSessionStatus = async () => {
    try {
      const res = await apiFetch<SessionInfo>('/my-session')
      if (res.success && res.data) {
        setSession(res.data)
      }
    } catch {
      // offline
    }
  }

  // SSE setup with JWT query token
  useEffect(() => {
    if (!token) return

    fetchSessionStatus()

    const sseUrl = `${API_BASE}/my-session/events?token=${token}`
    const es = new EventSource(sseUrl)

    es.addEventListener('init', (e) => {
      try {
        const payload = JSON.parse(e.data)
        setSession((prev) => ({
          ...prev,
          ...payload,
        }))
      } catch {}
    })

    es.addEventListener('qr', (e) => {
      const payload = JSON.parse(e.data)
      setSession((prev) => ({
        ...prev,
        status: 'qr_ready',
        qrDataUrl: payload.qrDataUrl,
        qrCode: payload.qr,
        errorMessage: null,
      }))
    })

    es.addEventListener('connected', (e) => {
      const payload = JSON.parse(e.data)
      setSession((prev) => ({
        ...prev,
        status: 'connected',
        phoneNumber: payload.phoneNumber,
        qrDataUrl: null,
        qrCode: null,
        isBusiness: true,
        errorMessage: null,
      }))
      showToast('WhatsApp Bisnis Terhubung')
    })

    es.addEventListener('status', (e) => {
      const payload = JSON.parse(e.data)
      setSession((prev) => ({
        ...prev,
        status: payload.status,
        ...(payload.status === 'connected' ? { qrDataUrl: null, qrCode: null } : {}),
      }))
    })

    es.addEventListener('error', (e) => {
      try {
        const payload = JSON.parse(e.data)
        const errMsg = payload.message || payload.errorMessage || 'Terjadi kesalahan koneksi'
        setSession((prev) => ({
          ...prev,
          status: 'disconnected',
          errorMessage: errMsg,
          qrCode: null,
          qrDataUrl: null,
          phoneNumber: null,
        }))
        showToast(errMsg)
      } catch {}
    })

    return () => {
      es.close()
    }
  }, [token])

  // Start WhatsApp session with JWT
  const handleStartBot = async () => {
    setActionLoading(true)
    setSession((prev) => ({ ...prev, errorMessage: null }))
    try {
      const res = await apiFetch<SessionInfo>('/my-session/start', {
        method: 'POST',
      })
      if (res.success && res.data) {
        setSession(res.data)
      } else {
        showToast(res.error || 'Gagal memulai')
      }
    } catch {
      showToast('Koneksi gagal')
    } finally {
      setActionLoading(false)
    }
  }

  // Reset / Disconnect Bot with JWT
  const handleResetBot = async () => {
    if (!confirm('Putuskan koneksi bot WhatsApp Bisnis ini?')) return

    setActionLoading(true)
    try {
      const res = await apiFetch('/my-session', {
        method: 'DELETE',
      })
      if (res.success) {
        showToast('Bot Diputus')
        setSession({
          sessionId: user ? `user_${user.id}` : '',
          userName: user ? user.name : '',
          phoneNumber: null,
          status: 'disconnected',
          qrCode: null,
          qrDataUrl: null,
          isBusiness: false,
          errorMessage: null,
        })
      }
    } catch {
      showToast('Gagal memutuskan')
    } finally {
      setActionLoading(false)
    }
  }

  if (!user) return null

  const isConnected = session.status === 'connected'

  const statusLabel = isConnected
    ? 'Terhubung (WA Bisnis)'
    : {
        qr_ready: 'Scan QR Bisnis',
        connecting: 'Menghubungkan',
        disconnected: 'Terputus',
      }[session.status] || session.status

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-zinc-950 text-white text-xs px-4 py-2.5 rounded-lg shadow-lg border border-zinc-800">
          {toastMessage}
        </div>
      )}

      {/* Top Header Card */}
      <Card className="shadow-xs">
        <div className="p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs text-zinc-500 font-medium">Akun Pengguna</div>
            <div className="text-sm font-semibold text-zinc-950 mt-0.5">
              {user.name} <span className="font-mono font-normal text-zinc-500">(@{user.username})</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div>
              <div className="text-xs text-zinc-500 font-medium">ID Sesi</div>
              <div className="font-mono text-xs text-zinc-800 mt-0.5">
                {session.sessionId}
              </div>
            </div>

            <div className="pl-4 border-l border-zinc-200">
              <div className="text-xs text-zinc-500 font-medium">Status</div>
              <Badge
                variant={isConnected ? 'default' : 'outline'}
                className="mt-0.5"
              >
                {statusLabel}
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Device & Connection Card */}
      <Card className="shadow-xs">
        <CardHeader className="pb-3 border-b border-zinc-100">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-900">
            {isConnected ? 'Perangkat WhatsApp Bisnis' : 'Koneksi WhatsApp Bisnis'}
          </CardTitle>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* =========================================================================
              KONDISI 1: SUDAH TERHUBUNG (isConnected === true)
              Hanya tampilkan status akun terhubung, TANPA QR code sama sekali.
              ========================================================================= */}
          {isConnected ? (
            <div className="space-y-4">
              <div className="border border-zinc-200/80 rounded-xl p-4 bg-zinc-50/50 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Tipe Akun:</span>
                  <span className="font-medium text-zinc-950 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-zinc-800" />
                    <span>WhatsApp Bisnis</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Nomor Terhubung:</span>
                  <span className="font-mono text-zinc-950 font-semibold">
                    {session.phoneNumber ? `+${session.phoneNumber}` : '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Status Sesi:</span>
                  <Badge variant="default" className="text-[10px] px-2 py-0">
                    Aktif Terhubung
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Database:</span>
                  <span className="font-mono text-zinc-600">db_chat.wa_sessions</span>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <Button
                  variant="outline"
                  onClick={handleStartBot}
                  disabled={actionLoading}
                  className="w-full text-xs"
                >
                  Restart Bot
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleResetBot}
                  disabled={actionLoading}
                  className="w-full text-xs text-zinc-600 hover:text-red-600"
                >
                  Putuskan Sesi
                </Button>
              </div>
            </div>
          ) : (
            /* =========================================================================
               KONDISI 2: BELUM TERHUBUNG (isConnected === false)
               Tampilkan peringatan WhatsApp Bisnis & QR Scanner jika siap.
               ========================================================================= */
            <div className="space-y-4">
              {/* Ketentuan WA Bisnis */}
              <div className="border border-zinc-200/80 rounded-xl p-3 bg-zinc-50/70 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-zinc-950">
                  <Building2 className="w-3.5 h-3.5 text-zinc-800" />
                  <span>Khusus WhatsApp Bisnis</span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Sistem hanya menerima pemindaian dari aplikasi WhatsApp Bisnis. Akun WhatsApp reguler/personal akan otomatis ditolak.
                </p>
              </div>

              {/* Error banner jika scan ditolak karena non-bisnis */}
              {session.errorMessage && (
                <div className="border border-zinc-300 rounded-xl p-3 bg-zinc-100 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-zinc-950">
                    <AlertCircle className="w-3.5 h-3.5 text-zinc-800" />
                    <span>Koneksi Ditolak</span>
                  </div>
                  <p className="text-[11px] text-zinc-600 leading-relaxed">
                    {session.errorMessage}
                  </p>
                </div>
              )}

              {/* QR Code & Petunjuk Scan (Tampil Hanya Jika Belum Terhubung) */}
              {session.status === 'qr_ready' && session.qrDataUrl ? (
                <div className="border border-zinc-200 rounded-xl p-4 sm:p-5 bg-white flex flex-col items-center gap-3.5 shadow-2xs">
                  <img
                    src={session.qrDataUrl}
                    alt="QR Code WhatsApp Bisnis"
                    className="w-48 h-48 rounded-lg border border-zinc-200"
                  />
                  <div className="w-full max-w-sm space-y-2 text-center">
                    <p className="text-xs font-semibold text-zinc-950">
                      Scan dengan WhatsApp Bisnis di HP
                    </p>
                    <div className="bg-zinc-50 border border-zinc-200/80 rounded-lg p-2.5 text-left space-y-1.5 text-[11px]">
                      <div className="flex items-start gap-2">
                        <span className="font-semibold text-zinc-950 shrink-0 w-16">IOS:</span>
                        <span className="text-zinc-600">Pengaturan &gt; Perangkat Tertaut &gt; Tautkan Perangkat</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-semibold text-zinc-950 shrink-0 w-16">Android:</span>
                        <span className="text-zinc-600">titik tiga &gt; perangkat tertaut &gt; tautkan perangkat</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : session.status !== 'connecting' ? (
                <div className="border border-zinc-200/80 rounded-xl p-3 bg-zinc-50/70 text-xs space-y-2">
                  <p className="font-semibold text-zinc-950 text-xs">
                    Scan dengan WhatsApp Bisnis di HP
                  </p>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-start gap-2">
                      <span className="font-semibold text-zinc-950 shrink-0 w-16">IOS:</span>
                      <span className="text-zinc-600">Pengaturan &gt; Perangkat Tertaut &gt; Tautkan Perangkat</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-semibold text-zinc-950 shrink-0 w-16">Android:</span>
                      <span className="text-zinc-600">titik tiga &gt; perangkat tertaut &gt; tautkan perangkat</span>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Connecting State */}
              {session.status === 'connecting' && (
                <div className="border border-zinc-200 rounded-xl p-6 text-center text-xs text-zinc-600 bg-zinc-50/50 font-medium space-y-2">
                  <RotateCw className="w-4 h-4 animate-spin mx-auto text-zinc-700" />
                  <p>Menyiapkan koneksi WhatsApp Bisnis...</p>
                </div>
              )}

              {/* Tombol Aksi Permintaan QR */}
              <div className="pt-1">
                <Button
                  onClick={handleStartBot}
                  disabled={actionLoading}
                  className="w-full text-xs"
                >
                  {actionLoading
                    ? 'Memproses...'
                    : session.errorMessage
                    ? 'Scan Ulang dengan WA Bisnis'
                    : session.status === 'qr_ready'
                    ? 'Segarkan QR Code'
                    : 'Tampilkan QR Code'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
