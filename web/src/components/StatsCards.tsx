import React, { useEffect, useRef } from 'react'
import { Users, Radio, HardDrive, MessageSquareText } from 'lucide-react'
import gsap from 'gsap'
import type { SessionInfo } from './types'

interface StatsCardsProps {
  sessions: SessionInfo[]
}

export const StatsCards: React.FC<StatsCardsProps> = ({ sessions }) => {
  const cardsRef = useRef<HTMLDivElement>(null)

  const total = sessions.length
  const connected = sessions.filter((s) => s.status === 'connected').length
  const qrWaiting = sessions.filter((s) => s.status === 'qr_ready').length

  useEffect(() => {
    if (cardsRef.current) {
      gsap.fromTo(
        cardsRef.current.children,
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: 'power2.out' }
      )
    }
  }, [])

  return (
    <div ref={cardsRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* Total Sessions */}
      <div className="p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/50 border border-slate-800/80 hover:border-slate-700/80 transition-all flex items-center gap-4 group">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
          <Users className="w-6 h-6" />
        </div>
        <div>
          <div className="text-2xl font-bold text-white tracking-tight">{total}</div>
          <div className="text-xs text-slate-400">Total Sesi Pengguna</div>
        </div>
      </div>

      {/* Connected Bots */}
      <div className="p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/50 border border-slate-800/80 hover:border-slate-700/80 transition-all flex items-center gap-4 group">
        <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center group-hover:scale-110 transition-transform">
          <Radio className="w-6 h-6" />
        </div>
        <div>
          <div className="text-2xl font-bold text-white tracking-tight">{connected}</div>
          <div className="text-xs text-slate-400">Bot Aktif Terhubung</div>
        </div>
      </div>

      {/* Waiting QR Scan */}
      <div className="p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/50 border border-slate-800/80 hover:border-slate-700/80 transition-all flex items-center gap-4 group">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
          <MessageSquareText className="w-6 h-6" />
        </div>
        <div>
          <div className="text-2xl font-bold text-white tracking-tight">{qrWaiting}</div>
          <div className="text-xs text-slate-400">Menunggu Scan QR</div>
        </div>
      </div>

      {/* Database Session Storage */}
      <div className="p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/50 border border-slate-800/80 hover:border-slate-700/80 transition-all flex items-center gap-4 group">
        <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
          <HardDrive className="w-6 h-6" />
        </div>
        <div>
          <div className="text-base font-bold text-white tracking-tight">db_chat</div>
          <div className="text-xs text-emerald-400 font-medium">MySQL (wa_sessions)</div>
        </div>
      </div>
    </div>
  )
}
