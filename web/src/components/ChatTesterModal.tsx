import React, { useState, useEffect, useRef } from 'react'
import { X, Send, MessageSquare, Bot, User, CornerDownLeft } from 'lucide-react'
import gsap from 'gsap'
import type { SessionInfo, ChatMessage } from './types'

interface ChatTesterModalProps {
  session: SessionInfo | null
  onClose: () => void
  onSendMessage: (sessionId: string, to: string, message: string) => Promise<boolean>
  messages: ChatMessage[]
  loadingMessages: boolean
}

export const ChatTesterModal: React.FC<ChatTesterModalProps> = ({
  session,
  onClose,
  onSendMessage,
  messages,
  loadingMessages,
}) => {
  const [recipient, setRecipient] = useState('')
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const modalBoxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (session && modalBoxRef.current) {
      gsap.fromTo(
        modalBoxRef.current,
        { scale: 0.95, opacity: 0, y: 10 },
        { scale: 1, opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
      )
    }
  }, [session])

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [messages])

  if (!session) return null

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recipient.trim() || !messageText.trim()) return

    setSending(true)
    try {
      const ok = await onSendMessage(session.sessionId, recipient.trim(), messageText.trim())
      if (ok) {
        setMessageText('')
      }
    } finally {
      setSending(false)
    }
  }

  const handleQuickTemplate = (text: string) => {
    setMessageText(text)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div
        ref={modalBoxRef}
        className="w-full max-w-2xl rounded-2xl bg-[#0f172a] border border-slate-800 shadow-2xl shadow-black/80 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                Pesan Tester: {session.userName}
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Session ID: {session.sessionId} • Nomor: +{session.phoneNumber || '-'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chat History Box (Read from MySQL chat_messages) */}
        <div className="p-4 flex-1 flex flex-col gap-3 min-h-[260px] max-h-[350px] overflow-hidden">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium px-1">
            <span>Riwayat Pesan (Tabel MySQL `chat_messages`)</span>
            <span className="text-emerald-400 font-mono">Real-time update</span>
          </div>

          <div
            ref={chatScrollRef}
            className="flex-1 overflow-y-auto p-4 rounded-xl bg-slate-950/80 border border-slate-900 space-y-3"
          >
            {loadingMessages ? (
              <div className="text-center py-10 text-xs text-slate-500">
                Memuat riwayat chat dari MySQL...
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-500">
                Belum ada riwayat pesan untuk sesi ini. Kirim pesan di bawah untuk memulai!
              </div>
            ) : (
              messages.map((m, idx) => {
                const isOut = Boolean(m.isFromMe || m.is_from_me)
                const content = m.text || m.message_text || ''
                const senderName = isOut ? 'Anda (Bot)' : (m.sender ? m.sender.split('@')[0] : 'User')
                const time = m.timestamp
                  ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : ''

                return (
                  <div
                    key={m.id || idx}
                    className={`flex flex-col ${isOut ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-xs leading-relaxed ${
                        isOut
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-tr-xs'
                          : 'bg-slate-800 text-slate-200 border border-slate-700/60 rounded-tl-xs'
                      }`}
                    >
                      <div className="font-semibold text-[10px] opacity-75 mb-0.5 flex items-center gap-1">
                        {isOut ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
                        {senderName}
                      </div>
                      <div className="whitespace-pre-wrap break-words">{content}</div>
                      {time && (
                        <div className="text-[9px] opacity-60 text-right mt-1 font-mono">
                          {time}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Quick template chips */}
        <div className="px-6 py-1.5 flex items-center gap-1.5 flex-wrap shrink-0">
          <span className="text-[11px] text-slate-500 font-medium mr-1">Template:</span>
          {['ping', 'menu', 'info', 'order', 'BELI#Kopi Robusta#2#Jl. Sudirman 10'].map((cmd) => (
            <button
              key={cmd}
              type="button"
              onClick={() => handleQuickTemplate(cmd)}
              className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/30 text-[11px] text-slate-300 hover:text-emerald-400 font-mono transition-all cursor-pointer"
            >
              {cmd}
            </button>
          ))}
        </div>

        {/* Send form */}
        <form onSubmit={handleSend} className="p-4 bg-slate-950/70 border-t border-slate-800 shrink-0 space-y-2.5">
          <div>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Nomor WhatsApp Tujuan (contoh: 08123456789 atau 628123456789)"
              required
              className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 focus:border-emerald-500 text-white font-mono text-xs outline-none transition-colors"
            />
          </div>

          <div className="flex gap-2">
            <textarea
              rows={2}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Ketik pesan yang ingin dikirimkan melalui WhatsApp..."
              required
              className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 focus:border-emerald-500 text-white text-xs outline-none resize-none transition-colors"
            />
            <button
              type="submit"
              disabled={sending}
              className="px-4 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-slate-950 font-semibold text-xs flex flex-col items-center justify-center gap-1 shadow-md shadow-emerald-500/20 disabled:opacity-50 transition-all cursor-pointer shrink-0"
            >
              <Send className="w-4 h-4" />
              <span>{sending ? 'Kirim...' : 'Kirim'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
