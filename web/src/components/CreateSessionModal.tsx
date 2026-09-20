import React, { useState, useEffect, useRef } from 'react'
import { X, PlusCircle, Sparkles } from 'lucide-react'
import gsap from 'gsap'

interface CreateSessionModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (sessionId: string, userName: string) => Promise<void>
}

export const CreateSessionModal: React.FC<CreateSessionModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const [sessionId, setSessionId] = useState('')
  const [userName, setUserName] = useState('')
  const [loading, setLoading] = useState(false)
  const modalBoxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      // Auto-generate random session id
      const randomId = 'user_' + Math.random().toString(36).substring(2, 7)
      setSessionId(randomId)
      setUserName('')

      if (modalBoxRef.current) {
        gsap.fromTo(
          modalBoxRef.current,
          { scale: 0.95, opacity: 0, y: 10 },
          { scale: 1, opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
        )
      }
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionId.trim() || !userName.trim()) return

    setLoading(true)
    try {
      await onCreate(sessionId.trim(), userName.trim())
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div
        ref={modalBoxRef}
        className="w-full max-w-md rounded-2xl bg-[#0f172a] border border-slate-800 shadow-2xl shadow-black/80 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-base text-white">
              Tambah Sesi WhatsApp Baru
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Session ID (Unik untuk Database)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  placeholder="contoh: cs_toko_1"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 text-white font-mono text-sm outline-none transition-colors"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Kunci pembeda sesi di tabel <code className="text-emerald-400 font-mono">wa_sessions</code>.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Nama Pengguna / Akun Bot
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="contoh: Customer Service Bandung"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 text-white text-sm outline-none transition-colors"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Nama ini akan muncul pada salam bot WhatsApp.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-xs text-emerald-300 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                Setelah disimpan, QR Code akan otomatis digenerate dan dikirim via Server-Sent Events (SSE).
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-950/60 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-slate-950 text-xs font-semibold shadow-md shadow-emerald-500/20 disabled:opacity-50 transition-all cursor-pointer"
            >
              {loading ? 'Menginisialisasi...' : 'Inisialisasi & Scan QR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
