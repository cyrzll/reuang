import React, { useState, useEffect } from 'react'
import { Menu } from 'lucide-react'
import { AuthProvider, useAuth } from '../context/AuthContext'
import { Navbar } from './Navbar'
import { AuthForm } from './AuthForm'
import { Sidebar, type NavTab } from './Sidebar'
import { DashboardView } from './views/DashboardView'
import { KatalogView } from './views/KatalogView'
import { PesananView } from './views/PesananView'
import { PenjualanView } from './views/PenjualanView'
import { UserBotDashboard } from './UserBotDashboard'
import { PengaturanTokoView } from './views/PengaturanTokoView'
import { PengaturanView, type SettingSubTab } from './views/PengaturanView'
import { SERVER_URL } from '../lib/api'

export type { NavTab } from './Sidebar'
export type { SettingSubTab } from './views/PengaturanView'

interface DashboardProps {
  initialTab?: NavTab
  initialSubTab?: SettingSubTab
}

const VALID_TABS: NavTab[] = [
  'dashboard',
  'catalog',
  'orders',
  'sales',
  'store-settings',
  'whatsapp',
  'setting',
]

// Helper to parse pathname into tab and sub-tab with backwards compatibility
function parseLocation(pathname: string): { tab: NavTab; subTab: SettingSubTab } {
  const parts = pathname.replace(/^\//, '').split('/').filter(Boolean)
  const first = parts[0] || 'dashboard'
  const second = parts[1] as SettingSubTab | undefined

  // Map backwards compatibility for Indonesian routes
  if (first === 'katalog') return { tab: 'catalog', subTab: 'profil' }
  if (first === 'pesanan') return { tab: 'orders', subTab: 'profil' }
  if (first === 'penjualan') return { tab: 'sales', subTab: 'profil' }
  if (first === 'akun-wa' || first === 'whatsapp') return { tab: 'store-settings', subTab: 'profil' }
  if (first === 'store-settings' || first === 'pengaturan-toko') return { tab: 'store-settings', subTab: 'profil' }
  if (first === 'pengaturan') return { tab: 'setting', subTab: 'profil' }

  if (first === 'setting') {
    const validSubs: SettingSubTab[] = ['profil', 'security', 'wallet']
    const sub = validSubs.includes(second as SettingSubTab) ? (second as SettingSubTab) : 'profil'
    return { tab: 'setting', subTab: sub }
  }

  if (VALID_TABS.includes(first as NavTab)) {
    return { tab: first as NavTab, subTab: 'profil' }
  }

  return { tab: 'dashboard', subTab: 'profil' }
}

const DashboardContent: React.FC<DashboardProps> = ({
  initialTab = 'dashboard',
  initialSubTab = 'profil',
}) => {
  const { user, store, isAuthenticated, isLoading } = useAuth()
  const [serverOnline, setServerOnline] = useState(false)

  // Initialize current tab and subTab from URL or props
  const [currentTab, setCurrentTab] = useState<NavTab>(() => {
    if (typeof window !== 'undefined') {
      const parsed = parseLocation(window.location.pathname)
      if (VALID_TABS.includes(parsed.tab)) {
        return parsed.tab
      }
    }
    return initialTab
  })

  const [settingSubTab, setSettingSubTab] = useState<SettingSubTab>(() => {
    if (typeof window !== 'undefined') {
      const parsed = parseLocation(window.location.pathname)
      return parsed.subTab
    }
    return initialSubTab
  })

  const [mobileOpen, setMobileOpen] = useState(false)

  // Redirect admin to /admin immediately
  useEffect(() => {
    if (!isLoading && isAuthenticated && user?.role === 'admin') {
      if (typeof window !== 'undefined' && window.location.pathname !== '/admin') {
        window.location.replace('/admin')
      }
    }
  }, [isLoading, isAuthenticated, user])

  // Server health heartbeat check
  useEffect(() => {
    const checkServer = async () => {
      try {
        const res = await fetch(SERVER_URL)
        setServerOnline(res.ok)
      } catch {
        setServerOnline(false)
      }
    }

    checkServer()
    const interval = setInterval(checkServer, 10000)
    return () => clearInterval(interval)
  }, [])

  // Listen to browser Back / Forward popstate & Astro View Transitions page-load
  useEffect(() => {
    const syncLocation = () => {
      if (typeof window !== 'undefined') {
        const parsed = parseLocation(window.location.pathname)
        if (typeof document !== 'undefined' && 'startViewTransition' in document) {
          document.startViewTransition(() => {
            setCurrentTab(parsed.tab)
            setSettingSubTab(parsed.subTab)
          })
        } else {
          setCurrentTab(parsed.tab)
          setSettingSubTab(parsed.subTab)
        }
      }
    }

    window.addEventListener('popstate', syncLocation)
    document.addEventListener('astro:page-load', syncLocation)

    return () => {
      window.removeEventListener('popstate', syncLocation)
      document.removeEventListener('astro:page-load', syncLocation)
    }
  }, [])

  // Seamless tab change with Astro / native View Transitions
  const handleTabChange = (tab: NavTab) => {
    // If store not approved, block locked tabs
    const lockedTabs: NavTab[] = ['catalog', 'orders', 'sales', 'whatsapp']
    let targetTab = tab
    if (lockedTabs.includes(tab) && store?.status !== 'approved') {
      targetTab = 'dashboard'
    }

    if (currentTab === targetTab) return

    let targetPath = `/${targetTab}`
    if (targetTab === 'setting') {
      targetPath = `/setting/${settingSubTab}`
    }

    const applyChange = () => {
      setCurrentTab(targetTab)
      if (typeof window !== 'undefined' && window.location.pathname !== targetPath) {
        window.history.pushState({ tab: targetTab, subTab: settingSubTab }, '', targetPath)
      }
    }

    // Trigger smooth Astro-compatible View Transition if supported
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      document.startViewTransition(() => {
        applyChange()
      })
    } else {
      applyChange()
    }
  }

  // Guard locked tabs on mount or store update
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const lockedTabs: NavTab[] = ['catalog', 'orders', 'sales', 'whatsapp']
      if (lockedTabs.includes(currentTab) && store?.status !== 'approved') {
        handleTabChange('dashboard')
      }
    }
  }, [isLoading, isAuthenticated, currentTab, store])

  // Seamless subTab change for /setting/* with View Transitions
  const handleSettingSubTabChange = (sub: SettingSubTab) => {
    if (settingSubTab === sub) return
    const targetPath = `/setting/${sub}`

    const applySubChange = () => {
      setSettingSubTab(sub)
      if (typeof window !== 'undefined' && window.location.pathname !== targetPath) {
        window.history.pushState({ tab: 'setting', subTab: sub }, '', targetPath)
      }
    }

    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      document.startViewTransition(() => {
        applySubChange()
      })
    } else {
      applySubChange()
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fafafa] text-zinc-950 flex items-center justify-center p-4">
        <div className="bg-white border border-zinc-200/80 rounded-xl px-4 py-2.5 text-xs text-zinc-600 font-medium shadow-xs">
          Memeriksa sesi...
        </div>
      </div>
    )
  }

  // Redirecting admin screen
  if (isAuthenticated && user?.role === 'admin') {
    return (
      <div className="min-h-screen bg-[#fafafa] text-zinc-950 flex items-center justify-center p-4">
        <div className="bg-white border border-zinc-200/80 rounded-xl px-4 py-2.5 text-xs text-zinc-600 font-medium shadow-xs">
          Mengalihkan ke Admin Panel...
        </div>
      </div>
    )
  }

  // If not logged in, show AuthForm with clean minimalist navbar
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#fafafa] text-zinc-950 flex flex-col font-sans">
        <Navbar serverOnline={serverOnline} />
        <AuthForm />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-950 flex flex-col md:flex-row font-sans">
      {/* Responsive Navigation Sidebar:
          - Desktop (lg: >= 1024px): Full expanded sidebar (w-64)
          - Tablet (md: 768px - 1023px): Icon-only compact sidebar (w-20)
          - Mobile (< md): Slide-over drawer menu controlled by mobileOpen
      */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={handleTabChange}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        serverOnline={serverOnline}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header (< md) with Hamburger Menu */}
        <header className="md:hidden flex items-center justify-between px-4 h-14 bg-white/95 backdrop-blur-md border-b border-zinc-200/80 sticky top-0 z-20 select-none">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="p-1.5 rounded-lg text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 transition-colors cursor-pointer"
              aria-label="Buka Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <a href="/" className="flex items-center">
              <img src="/logo.png" alt="REUANG" className="h-5 w-auto object-contain" />
            </a>
          </div>

          {user && (
            <img
              src={user.profileUrl || '/media/profile/default-profile.jpeg'}
              alt={user.name}
              className="w-7 h-7 rounded-full object-cover border border-zinc-200/80 shadow-xs"
            />
          )}
        </header>

        {/* Viewport Content with Astro View Transitions Animation */}
        <main
          className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto"
          style={{ viewTransitionName: 'tab-viewport' }}
        >
          {currentTab === 'dashboard' && <DashboardView onNavigate={handleTabChange} />}
          {currentTab === 'catalog' && <KatalogView />}
          {currentTab === 'orders' && <PesananView onNavigate={handleTabChange} />}
          {currentTab === 'sales' && <PenjualanView />}
          {currentTab === 'store-settings' && <PengaturanTokoView />}
          {currentTab === 'whatsapp' && <PengaturanTokoView initialSubTab="bots" initialBotType="whatsapp" />}
          {currentTab === 'setting' && (
            <PengaturanView
              initialSubTab={settingSubTab}
              onSubTabChange={handleSettingSubTabChange}
            />
          )}
        </main>
      </div>
    </div>
  )
}

export const Dashboard: React.FC<DashboardProps> = ({ initialTab, initialSubTab }) => {
  return (
    <AuthProvider>
      <DashboardContent initialTab={initialTab} initialSubTab={initialSubTab} />
    </AuthProvider>
  )
}
