import React, { useState, useEffect } from 'react'
import {
  MessageSquare,
  ShoppingCart,
  TrendingUp,
  ArrowRight,
  ChevronDown,
  ShieldCheck,
  FileSpreadsheet,
  Store,
  Receipt,
  Bot,
  Package,
} from 'lucide-react'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { AuthProvider, useAuth } from '../context/AuthContext'

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger)
}

interface FAQItemProps {
  question: string
  answer: string
  isOpen: boolean
  onToggle: () => void
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer, isOpen, onToggle }) => {
  return (
    <div className="aos-faq-item border border-zinc-200/80 rounded-xl bg-white overflow-hidden transition-all duration-200 hover:border-zinc-300">
      <button
        type="button"
        onClick={onToggle}
        className="w-full py-4 px-5 text-left flex items-center justify-between gap-4 font-medium text-sm sm:text-base text-zinc-950 hover:text-zinc-800 cursor-pointer select-none"
      >
        <span>{question}</span>
        <ChevronDown
          className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform duration-300 ease-out ${
            isOpen ? 'rotate-180 text-zinc-950' : ''
          }`}
        />
      </button>
      <div
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          transition: 'grid-template-rows 300ms cubic-bezier(0.2, 0, 0, 1), opacity 300ms ease-out',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-zinc-600 leading-relaxed border-t border-zinc-100">
            {answer}
          </div>
        </div>
      </div>
    </div>
  )
}

const LandingPageContent: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth()
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0)

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index)
  }

  // Smooth Scroll with Lenis and AOS animations with GSAP ScrollTrigger
  useEffect(() => {
    if (typeof window === 'undefined') return

    // 1. Initialize Lenis smooth scroll
    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.5,
    })

    // Synchronize Lenis with GSAP ScrollTrigger
    const handleLenisScroll = () => {
      ScrollTrigger.update()
    }
    lenis.on('scroll', handleLenisScroll)

    const tickerCallback = (time: number) => {
      lenis.raf(time * 1000)
    }
    gsap.ticker.add(tickerCallback)
    gsap.ticker.lagSmoothing(0)

    // Smooth anchor navigation
    const handleAnchorClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null
      if (target) {
        const hash = target.getAttribute('href')
        if (hash && hash !== '#') {
          const el = document.querySelector(hash)
          if (el) {
            e.preventDefault()
            lenis.scrollTo(el as HTMLElement, { offset: -75, duration: 1.2 })
          }
        }
      }
    }

    document.addEventListener('click', handleAnchorClick)

    // 2. AOS (Animate on Scroll) with GSAP context
    const ctx = gsap.context(() => {
      // 1. Hero Animations (plays on load)
      const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      heroTl
        .fromTo('.aos-hero-title', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.85 })
        .fromTo('.aos-hero-sub', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8 }, '-=0.6')
        .fromTo('.aos-hero-cta', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.75 }, '-=0.5')
        .fromTo(
          '.aos-hero-card',
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0, stagger: 0.08, duration: 0.7 },
          '-=0.4'
        )

      // 2. Section Headers (AOS: fade-up on scroll)
      gsap.utils.toArray<HTMLElement>('.aos-section-header').forEach((header) => {
        gsap.fromTo(
          header,
          { opacity: 0, y: 24 },
          {
            scrollTrigger: {
              trigger: header,
              start: 'top 88%',
              toggleActions: 'play none none none',
            },
            opacity: 1,
            y: 0,
            duration: 0.75,
            ease: 'power3.out',
          }
        )
      })

      // 3. Interactive Preview Mockup Window (AOS: fade-up & scale)
      gsap.fromTo(
        '.aos-preview',
        { opacity: 0, y: 36, scale: 0.98 },
        {
          scrollTrigger: {
            trigger: '.aos-preview',
            start: 'top 85%',
            toggleActions: 'play none none none',
          },
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.85,
          ease: 'power3.out',
        }
      )

      // 4. Feature Cards (AOS: staggered fade-up)
      gsap.fromTo(
        '.aos-feature-card',
        { opacity: 0, y: 30 },
        {
          scrollTrigger: {
            trigger: '#fitur-grid',
            start: 'top 85%',
            toggleActions: 'play none none none',
          },
          opacity: 1,
          y: 0,
          stagger: 0.09,
          duration: 0.75,
          ease: 'power3.out',
        }
      )

      // 5. 3 Steps Cards (AOS: staggered fade-up)
      gsap.fromTo(
        '.aos-step-card',
        { opacity: 0, y: 30 },
        {
          scrollTrigger: {
            trigger: '#cara-kerja-grid',
            start: 'top 85%',
            toggleActions: 'play none none none',
          },
          opacity: 1,
          y: 0,
          stagger: 0.12,
          duration: 0.75,
          ease: 'power3.out',
        }
      )

      // 6. FAQ Items (AOS: staggered fade-up)
      gsap.fromTo(
        '.aos-faq-item',
        { opacity: 0, y: 18 },
        {
          scrollTrigger: {
            trigger: '#faq-list',
            start: 'top 88%',
            toggleActions: 'play none none none',
          },
          opacity: 1,
          y: 0,
          stagger: 0.08,
          duration: 0.65,
          ease: 'power3.out',
        }
      )

      // 7. CTA Banner (AOS: fade-up & subtle scale)
      gsap.fromTo(
        '.aos-cta-banner',
        { opacity: 0, y: 30, scale: 0.97 },
        {
          scrollTrigger: {
            trigger: '.aos-cta-banner',
            start: 'top 88%',
            toggleActions: 'play none none none',
          },
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.85,
          ease: 'power3.out',
        }
      )
    })

    // Refresh ScrollTrigger after DOM renders to ensure accurate trigger positions
    requestAnimationFrame(() => {
      ScrollTrigger.refresh()
    })
    const refreshTimer = setTimeout(() => {
      ScrollTrigger.refresh()
    }, 150)

    return () => {
      clearTimeout(refreshTimer)
      document.removeEventListener('click', handleAnchorClick)
      ctx.revert()
      gsap.ticker.remove(tickerCallback)
      lenis.destroy()
      ScrollTrigger.getAll().forEach((t) => t.kill())
    }
  }, [])

  const faqs = [
    {
      question: 'Bagaimana cara menghubungkan WhatsApp dan Telegram?',
      answer:
        'Untuk WhatsApp, Anda cukup memindai kode QR dari menu Pengaturan Toko menggunakan WhatsApp di ponsel Anda. Untuk Telegram, Anda cukup memasukkan token bot yang didapatkan dari BotFather.',
    },
    {
      question: 'Bagaimana cara memverifikasi bukti transfer pelanggan?',
      answer:
        'Saat pelanggan mengirimkan foto bukti transfer via WhatsApp, sistem merekam gambar struk dan nama rekening pengirim. Anda dapat memeriksa keabsahan foto tersebut di daftar pesanan sebelum menyetujui transaksi.',
    },
    {
      question: 'Bagaimana perhitungan untung bersih bekerja?',
      answer:
        'Setiap produk dalam katalog dapat diisi harga jual dan harga modal (HPP). Ketika pesanan berstatus selesai, sistem otomatis menghitung selisih harga jual dengan total modal untuk menampilkan untung bersih toko.',
    },
    {
      question: 'Apakah data transaksi dapat diekspor ke format Excel?',
      answer:
        'Ya. Anda dapat mengekspor riwayat penjualan ke format spreadsheet (.xlsx) dengan pilihan rentang per hari (lengkap dengan kalender pemilih tanggal), per minggu, atau per bulan beserta rincian pembeli, produk, omset, modal, dan laba.',
    },
    {
      question: 'Apakah ada notifikasi otomatis ke WhatsApp pelanggan?',
      answer:
        'Ya. Saat Anda memperbarui status pesanan menjadi "Siap", sistem secara otomatis mengirimkan pesan konfirmasi ke nomor WhatsApp pelanggan yang memesan.',
    },
  ]

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-950 font-sans selection:bg-zinc-900 selection:text-white flex flex-col">
      {/* =========================================================================
          1. NAVIGATION BAR
          ========================================================================= */}
      <header className="sticky top-0 z-50 w-full bg-white/90 backdrop-blur-md border-b border-zinc-200/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <a href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
              <img src="/logo.png" alt="REUANG" className="h-6 w-auto object-contain" />
            </a>

            <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-zinc-600">
              <a href="#fitur" className="hover:text-zinc-950 transition-colors">
                Fitur
              </a>
              <a href="#cara-kerja" className="hover:text-zinc-950 transition-colors">
                Cara Kerja
              </a>
              <a href="#preview" className="hover:text-zinc-950 transition-colors">
                Pratinjau
              </a>
              <a href="#faq" className="hover:text-zinc-950 transition-colors">
                FAQ
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {!isLoading && isAuthenticated && user ? (
              <a
                href="/dashboard"
                className="inline-flex items-center gap-2 bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-medium px-3.5 py-2 rounded-lg transition-colors shadow-xs"
              >
                <img
                  src={user.profileUrl || '/media/profile/default-profile.jpeg'}
                  alt={user.name}
                  className="w-5 h-5 rounded-full object-cover border border-zinc-700"
                />
                <span>Dashboard ({user.name.split(' ')[0]})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            ) : (
              <>
                <a
                  href="/login"
                  className="text-xs font-medium text-zinc-700 hover:text-zinc-950 px-3 py-2 transition-colors"
                >
                  Masuk
                </a>
                <a
                  href="/register"
                  className="inline-flex items-center gap-1.5 bg-zinc-900 text-white hover:bg-zinc-800 text-xs font-medium px-3.5 py-2 rounded-lg transition-colors shadow-xs"
                >
                  <span>Daftar Akun</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </>
            )}
          </div>
        </div>
      </header>

      {/* =========================================================================
          2. HERO SECTION (Vertically Centered in Viewport)
          ========================================================================= */}
      <section className="relative min-h-[calc(100vh-4rem)] min-h-[calc(100dvh-4rem)] flex flex-col justify-center items-center py-12 sm:py-16 overflow-hidden border-b border-zinc-200/60 bg-gradient-to-b from-white to-[#fafafa]">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 text-center my-auto">
          {/* Headline */}
          <h1 className="aos-hero-title text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-zinc-950 max-w-3xl mx-auto leading-[1.15]">
            Pencatatan Pesanan & Katalog WhatsApp Toko Anda
          </h1>

          {/* Subtitle */}
          <p className="aos-hero-sub mt-5 text-sm sm:text-base lg:text-lg text-zinc-600 max-w-2xl mx-auto leading-relaxed">
            Catat pesanan dari WhatsApp & Telegram, kelola katalog produk, verifikasi bukti transfer pelanggan, dan pantau untung bersih toko secara realtime.
          </p>

          {/* CTA Buttons */}
          <div className="aos-hero-cta mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            {!isLoading && isAuthenticated ? (
              <a
                href="/dashboard"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-zinc-950 text-white hover:bg-zinc-800 px-6 py-3 rounded-xl text-sm font-medium transition-colors shadow-xs"
              >
                <span>Buka Dashboard Toko</span>
                <ArrowRight className="w-4 h-4" />
              </a>
            ) : (
              <>
                <a
                  href="/register"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-zinc-950 text-white hover:bg-zinc-800 px-6 py-3 rounded-xl text-sm font-medium transition-colors shadow-xs"
                >
                  <span>Daftar Sekarang</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
                <a
                  href="/login"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-zinc-800 border border-zinc-200/80 hover:bg-zinc-50 px-6 py-3 rounded-xl text-sm font-medium transition-colors"
                >
                  <span>Masuk ke Akun</span>
                </a>
              </>
            )}
          </div>

          {/* Value Highlights */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-3 text-left max-w-4xl mx-auto">
            <div className="aos-hero-card p-4 rounded-xl border border-zinc-200/80 bg-white shadow-xs">
              <div className="flex items-center gap-2 text-zinc-950 font-semibold text-xs mb-1">
                <Bot className="w-4 h-4 text-zinc-700" />
                <span>WA & Telegram</span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-normal">
                Koneksi nomor WhatsApp via QR dan bot Telegram
              </p>
            </div>

            <div className="aos-hero-card p-4 rounded-xl border border-zinc-200/80 bg-white shadow-xs">
              <div className="flex items-center gap-2 text-zinc-950 font-semibold text-xs mb-1">
                <TrendingUp className="w-4 h-4 text-zinc-700" />
                <span>Untung Bersih</span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-normal">
                Kalkulasi laba bersih otomatis berdasarkan modal produk
              </p>
            </div>

            <div className="aos-hero-card p-4 rounded-xl border border-zinc-200/80 bg-white shadow-xs">
              <div className="flex items-center gap-2 text-zinc-950 font-semibold text-xs mb-1">
                <ShieldCheck className="w-4 h-4 text-zinc-700" />
                <span>Verifikasi Struk</span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-normal">
                Tinjau foto bukti transfer dan nama pengirim
              </p>
            </div>

            <div className="aos-hero-card p-4 rounded-xl border border-zinc-200/80 bg-white shadow-xs">
              <div className="flex items-center gap-2 text-zinc-950 font-semibold text-xs mb-1">
                <FileSpreadsheet className="w-4 h-4 text-zinc-700" />
                <span>Ekspor ke Excel</span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-normal">
                Rekap per hari dengan kalender, mingguan, atau bulanan
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          3. INTERACTIVE PRODUCT PREVIEW MOCKUP
          ========================================================================= */}
      <section id="preview" className="py-16 sm:py-20 bg-white border-b border-zinc-200/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="aos-section-header text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950">
              Pratinjau Pengelolaan Pesanan
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Semua pesanan yang masuk dari WhatsApp & Telegram dapat diproses dan dipantau dalam satu tampilan.
            </p>
          </div>

          {/* Mock Dashboard Window */}
          <div className="aos-preview border border-zinc-200/90 rounded-2xl bg-[#fafafa] shadow-md overflow-hidden">
            {/* Window Top Bar */}
            <div className="h-11 px-4 bg-white border-b border-zinc-200/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
                <span className="ml-2 text-xs font-mono text-zinc-400">reuang.app/dashboard</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-700 border border-zinc-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Bot Terhubung
                </span>
              </div>
            </div>

            {/* Dashboard Content Mockup */}
            <div className="p-4 sm:p-6 space-y-5">
              {/* Stat Cards Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-white border border-zinc-200/80 shadow-xs">
                  <span className="text-[11px] font-medium text-zinc-500">Total Penjualan Hari Ini</span>
                  <div className="mt-1 text-xl font-bold text-zinc-950 font-mono">Rp 2.450.000</div>
                  <div className="mt-1 text-[11px] text-zinc-500">18 transaksi tuntas</div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-zinc-200/80 shadow-xs">
                  <span className="text-[11px] font-medium text-zinc-500">Pesanan Masuk Hari Ini</span>
                  <div className="mt-1 text-xl font-bold text-zinc-950 font-mono">18 Pesanan</div>
                  <div className="mt-1 text-[11px] text-zinc-500">2 menunggu verifikasi bayar</div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-zinc-200/80 shadow-xs">
                  <span className="text-[11px] font-medium text-zinc-500">Untung Bersih Hari Ini</span>
                  <div className="mt-1 text-xl font-bold text-zinc-950 font-mono">Rp 890.000</div>
                  <div className="mt-1 text-[11px] text-zinc-500">Total modal: Rp 1.560.000</div>
                </div>
              </div>

              {/* Order Feed Card */}
              <div className="rounded-xl bg-white border border-zinc-200/80 p-4 sm:p-5 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-700 font-semibold text-xs">
                      SR
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-zinc-950 flex items-center gap-2">
                        <span>Siti Rahma</span>
                        <span className="text-[10px] font-mono text-zinc-500">+62 812-3456-7890</span>
                      </div>
                      <span className="text-[11px] text-zinc-500">WhatsApp • 2 menit yang lalu</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-zinc-100 text-zinc-800 border border-zinc-200">
                      <Receipt className="w-3 h-3 text-zinc-600" />
                      Bukti Terlampir
                    </span>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-medium bg-zinc-900 text-white">
                      Menunggu Verifikasi
                    </span>
                  </div>
                </div>

                <div className="py-3.5 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-zinc-500 block text-[11px] mb-1">Rincian Produk</span>
                    <p className="font-medium text-zinc-900">2x Kemeja Linen Hitam (L)</p>
                    <p className="font-medium text-zinc-900">1x Celana Chino Slim (32)</p>
                  </div>

                  <div>
                    <span className="text-zinc-500 block text-[11px] mb-1">Kalkulasi Keuangan</span>
                    <p className="text-zinc-700">Total Omset: <strong className="text-zinc-950 font-mono">Rp 345.000</strong></p>
                    <p className="text-zinc-500 text-[11px]">Modal: Rp 210.000 • Untung: <strong className="text-zinc-900 font-mono">+Rp 135.000</strong></p>
                  </div>

                  <div>
                    <span className="text-zinc-500 block text-[11px] mb-1">Alamat Pengiriman</span>
                    <p className="text-zinc-700">Jl. Melati No. 42, Kebayoran Baru, Jakarta Selatan</p>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-zinc-500">Notifikasi WhatsApp siap dikirim saat pesanan disetujui</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-700 text-xs font-medium hover:bg-zinc-50 cursor-default"
                    >
                      Lihat Foto
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg bg-zinc-950 text-white text-xs font-medium hover:bg-zinc-800 cursor-default"
                    >
                      Verifikasi Pesanan
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          4. CORE FEATURES SECTION
          ========================================================================= */}
      <section id="fitur" className="py-16 sm:py-20 bg-[#fafafa] border-b border-zinc-200/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="aos-section-header text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950">
              Fitur Pengelolaan Toko
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Fitur yang dirancang praktis untuk mendukung pencatatan dan pengelolaan operasional toko harian.
            </p>
          </div>

          <div id="fitur-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Feature 1 */}
            <div className="aos-feature-card p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex flex-col justify-between">
              <div>
                <div className="w-9 h-9 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-900 mb-4">
                  <Bot className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-950 mb-1.5">
                  Integrasi WhatsApp & Telegram
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Hubungkan nomor WhatsApp toko via scan QR dan bot Telegram dengan token bot untuk menerima interaksi pesanan pelanggan.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="aos-feature-card p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex flex-col justify-between">
              <div>
                <div className="w-9 h-9 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-900 mb-4">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-950 mb-1.5">
                  Katalog & Modal (HPP)
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Kelola daftar produk, kategori, harga jual, dan harga modal (HPP) untuk menghitung keuntungan bersih tiap transaksi secara otomatis.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="aos-feature-card p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex flex-col justify-between">
              <div>
                <div className="w-9 h-9 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-900 mb-4">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-950 mb-1.5">
                  Penyaringan Bukti Bayar
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Tinjau foto bukti transfer dan nama pengirim yang dikirimkan pelanggan sebelum memproses pesanan ke tahap selanjutnya.
                </p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="aos-feature-card p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex flex-col justify-between">
              <div>
                <div className="w-9 h-9 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-900 mb-4">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-950 mb-1.5">
                  Ekspor ke Excel Fleksibel
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Unduh rekapan penjualan dengan pilihan per hari (pemilih tanggal kalender), per minggu, atau per bulan lengkap dengan laba bersih.
                </p>
              </div>
            </div>

            {/* Feature 5 */}
            <div className="aos-feature-card p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex flex-col justify-between">
              <div>
                <div className="w-9 h-9 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-900 mb-4">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-950 mb-1.5">
                  Notifikasi WhatsApp Pelanggan
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Kirim notifikasi otomatis langsung ke nomor WhatsApp pelanggan saat status pesanan diubah menjadi Siap.
                </p>
              </div>
            </div>

            {/* Feature 6 */}
            <div className="aos-feature-card p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs flex flex-col justify-between">
              <div>
                <div className="w-9 h-9 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-900 mb-4">
                  <Store className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-950 mb-1.5">
                  Pengaturan Profil & Rekening
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Atur nama toko, pesan pembuka bot, serta rekening bank tujuan pembayaran dengan mudah dari dashboard.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          5. HOW IT WORKS (3 STEPS)
          ========================================================================= */}
      <section id="cara-kerja" className="py-16 sm:py-20 bg-white border-b border-zinc-200/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="aos-section-header text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950">
              3 Langkah Memulai
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Alur penyiapan toko yang sederhana dan langsung siap digunakan.
            </p>
          </div>

          <div id="cara-kerja-grid" className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="aos-step-card p-6 rounded-2xl bg-[#fafafa] border border-zinc-200/80">
              <span className="text-xs font-mono font-bold text-zinc-400">01</span>
              <h3 className="mt-3 text-base font-semibold text-zinc-950">Hubungkan WhatsApp</h3>
              <p className="mt-2 text-xs text-zinc-600 leading-relaxed">
                Pindai kode QR WhatsApp di menu Pengaturan Toko untuk menghubungkan nomor bot dengan toko Anda.
              </p>
            </div>

            <div className="aos-step-card p-6 rounded-2xl bg-[#fafafa] border border-zinc-200/80">
              <span className="text-xs font-mono font-bold text-zinc-400">02</span>
              <h3 className="mt-3 text-base font-semibold text-zinc-950">Atur Produk & Modal</h3>
              <p className="mt-2 text-xs text-zinc-600 leading-relaxed">
                Tambahkan produk ke katalog dengan harga jual dan harga modal (HPP) agar laba bersih dapat terhitung otomatis.
              </p>
            </div>

            <div className="aos-step-card p-6 rounded-2xl bg-[#fafafa] border border-zinc-200/80">
              <span className="text-xs font-mono font-bold text-zinc-400">03</span>
              <h3 className="mt-3 text-base font-semibold text-zinc-950">Kelola Pesanan Masuk</h3>
              <p className="mt-2 text-xs text-zinc-600 leading-relaxed">
                Pantau pesanan yang masuk, periksa bukti transfer pelanggan, ubah status pesanan, dan ekspor laporan penjualan.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          6. FAQ SECTION (Smooth Accordion)
          ========================================================================= */}
      <section id="faq" className="py-16 sm:py-20 bg-[#fafafa] border-b border-zinc-200/80">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="aos-section-header text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950">
              Pertanyaan yang Sering Diajukan
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Informasi seputar penggunaan dan fitur REUANG.
            </p>
          </div>

          <div id="faq-list" className="space-y-3">
            {faqs.map((faq, index) => (
              <FAQItem
                key={index}
                question={faq.question}
                answer={faq.answer}
                isOpen={openFaqIndex === index}
                onToggle={() => toggleFaq(index)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* =========================================================================
          7. CALL TO ACTION BANNER
          ========================================================================= */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="aos-cta-banner rounded-3xl bg-zinc-950 text-white p-8 sm:p-12 text-center relative overflow-hidden shadow-lg">
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight max-w-xl mx-auto leading-snug">
              Kelola Pesanan Toko Anda Lebih Teratur
            </h2>
            <p className="mt-4 text-xs sm:text-sm text-zinc-400 max-w-lg mx-auto leading-relaxed">
              Mulai catat pesanan, verifikasi transfer, dan pantau keuntungan bersih toko dengan REUANG.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              {!isLoading && isAuthenticated ? (
                <a
                  href="/dashboard"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-zinc-950 hover:bg-zinc-100 px-6 py-3 rounded-xl text-sm font-semibold transition-colors shadow-xs"
                >
                  <span>Buka Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
              ) : (
                <>
                  <a
                    href="/register"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-zinc-950 hover:bg-zinc-100 px-6 py-3 rounded-xl text-sm font-semibold transition-colors shadow-xs"
                  >
                    <span>Daftar Akun</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>
                  <a
                    href="/login"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-zinc-900 text-white border border-zinc-800 hover:bg-zinc-800 px-6 py-3 rounded-xl text-sm font-medium transition-colors"
                  >
                    <span>Masuk</span>
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          8. FOOTER
          ========================================================================= */}
      <footer className="border-t border-zinc-200/80 bg-white py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="REUANG" className="h-5 w-auto object-contain" />
            <span className="text-xs text-zinc-500">
              © {new Date().getFullYear()} REUANG. Hak cipta dilindungi.
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <a href="/login" className="hover:text-zinc-950 transition-colors">
              Masuk
            </a>
            <a href="/register" className="hover:text-zinc-950 transition-colors">
              Daftar
            </a>
            <a href="/dashboard" className="hover:text-zinc-950 transition-colors">
              Dashboard
            </a>
            <a href="#fitur" className="hover:text-zinc-950 transition-colors">
              Fitur
            </a>
            <a href="#faq" className="hover:text-zinc-950 transition-colors">
              FAQ
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export const LandingPage: React.FC = () => {
  return (
    <AuthProvider>
      <LandingPageContent />
    </AuthProvider>
  )
}

export default LandingPage
