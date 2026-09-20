import React, { useEffect, useRef } from 'react'
import {
  Smartphone,
  QrCode,
  MessageSquare,
  RotateCw,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  WifiOff,
  Database,
} from 'lucide-react'
import gsap from 'gsap'
import type { SessionInfo } from './types'

interface SessionCardProps {
  session: SessionInfo
  onRestart: (id: string) => void
  onDelete: (id: string) => void
  onOpenChat: (session: SessionInfo) => void
}

export const SessionCard: React.FC<SessionCardProps> = ({
  session,
  onRestart,
  onDelete,
  onOpenChat,
}) => {
  const cardRef = useRef<HTMLDivElement>(null)
  const qrRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (qrRef.current && session.qrDataUrl) {
      gsap.fromTo(
        qrRef.current,
        { scale: 0.9, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.5)' }
      )
    }
  }, [session.qrDataUrl])

  const statusConfig = {
    connected: {
      label: 'Terhubung',
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      dot: 'bg-emerald-400',
      icon: CheckCircle2,
      borderTop: 'border-t-emerald-500',
    },
    qr_ready: {
      label: 'Menunggu Scan QR',
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      dot: 'bg-amber-400',
      icon: QrCode,
      borderTop: 'border-t-amber-500',
    },
    connecting: {
      label: 'Menghubungkan...',
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      dot: 'bg-blue-400 animate-pulse',
      icon: Clock,
      borderTop: 'border-t-blue-500',
    },
    disconnected: {
      label: 'Terputus',
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      dot: 'bg-rose-400',
      icon: WifiOff,
      borderTop: 'border-t-rose-500',
    },
  }[session.status] || {
    label: session.status,
    color: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
    dot: 'bg-slate-400',
    icon: AlertTriangle,
    borderTop: 'border-t-slate-500',
  }

  const StatusIcon = statusConfig.icon

  return (
    <div
      ref={cardRef}
      className={`rounded-2xl bg-[#0f172a]/90 backdrop-blur border border-slate-800/80 border-t-2 ${statusConfig.borderTop} p-5 flex flex-col justify-between gap-5 shadow-lg shadow-black/20 hover:border-slate-700 transition-all group`}
    >
      {/* Head */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-base font-semibold text-white group-hover:text-emerald-400 transition-colors">
              {session.userName}
            </h3>
            <span className="font-mono text-xs text-slate-400 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 mt-1 inline-block">
              ID: {session.sessionId}
            </span>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusConfig.color}`}
          >
            <span className={`w-2 h-2 rounded-full ${statusConfig.dot}`}></span>
            {statusConfig.label}
          </span>
        </div>

        {/* Metadata */}
        <div className="space-y-2 p-3 rounded-xl bg-slate-950/60 border border-slate-900 text-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-slate-500" />
              Nomor WhatsApp:
            </span>
            <span className="font-mono font-medium text-slate-200">
              {session.phoneNumber ? `+${session.phoneNumber}` : '(Belum Terhubung)'}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-slate-500" />
              Kredensial Sesi:
            </span>
            <span className="text-emerald-400 font-medium font-mono">
              MySQL `wa_sessions`
            </span>
          </div>
        </div>
      </div>

      {/* QR Code Container if QR is ready */}
      {session.status === 'qr_ready' && session.qrDataUrl && (
        <div
          ref={qrRef}
          className="p-4 rounded-xl bg-white flex flex-col items-center gap-2 shadow-inner ring-4 ring-amber-500/20"
        >
          <img
            src={session.qrDataUrl}
            alt="Scan WhatsApp QR Code"
            className="w-48 h-48 rounded-lg shadow-sm"
          />
          <div className="w-full text-center space-y-2">
            <p className="text-xs font-semibold text-slate-900">
              Scan dengan WhatsApp Bisnis di HP
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-left space-y-1 text-[11px]">
              <div className="flex items-start gap-2">
                <span className="font-semibold text-slate-900 shrink-0 w-16">IOS:</span>
                <span className="text-slate-600">Pengaturan &gt; Perangkat Tertaut &gt; Tautkan Perangkat</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-semibold text-slate-900 shrink-0 w-16">Android:</span>
                <span className="text-slate-600">titik tiga &gt; perangkat tertaut &gt; tautkan perangkat</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Connecting status loader */}
      {session.status === 'connecting' && (
        <div className="p-6 rounded-xl bg-slate-950/50 border border-slate-900 text-center flex flex-col items-center gap-2">
          <RotateCw className="w-6 h-6 text-blue-400 animate-spin" />
          <p className="text-xs text-slate-400">
            Menghubungkan ke server WhatsApp...
          </p>
        </div>
      )}

      {/* Card Actions Footer */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
        {session.status === 'connected' ? (
          <button
            onClick={() => onOpenChat(session)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-medium transition-all cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Chat Tester
          </button>
        ) : (
          <button
            onClick={() => onRestart(session.sessionId)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-all cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
            Sambungkan Ulang
          </button>
        )}

        <button
          onClick={() => onDelete(session.sessionId)}
          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer ml-auto"
          title="Hapus Sesi dari Database"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
