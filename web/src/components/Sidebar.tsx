import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  LayoutDashboard,
  Store,
  Package,
  ShoppingCart,
  TrendingUp,
  Smartphone,
  Settings,
  LogOut,
  X,
  Lock,
  ChevronDown,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export type NavTab = 'dashboard' | 'catalog' | 'orders' | 'sales' | 'store-settings' | 'setting' | 'whatsapp'

export interface SidebarProps {
  currentTab: NavTab
  onTabChange: (tab: NavTab) => void
  mobileOpen: boolean
  onMobileClose: () => void
  serverOnline?: boolean
}

export const storeChildItems: {
  id: NavTab
  label: string
  icon: React.ComponentType<{ className?: string }>
  path: string
}[] = [
  { id: 'catalog', label: 'Katalog', icon: Package, path: '/catalog' },
  { id: 'orders', label: 'Pesanan', icon: ShoppingCart, path: '/orders' },
  { id: 'sales', label: 'Penjualan', icon: TrendingUp, path: '/sales' },
  { id: 'store-settings', label: 'Pengaturan', icon: Settings, path: '/store-settings' },
]

export const navItems: {
  id: NavTab
  label: string
  icon: React.ComponentType<{ className?: string }>
  path: string
}[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { id: 'catalog', label: 'Katalog', icon: Package, path: '/catalog' },
  { id: 'orders', label: 'Pesanan', icon: ShoppingCart, path: '/orders' },
  { id: 'sales', label: 'Penjualan', icon: TrendingUp, path: '/sales' },
  { id: 'store-settings', label: 'Pengaturan Toko', icon: Settings, path: '/store-settings' },
  { id: 'setting', label: 'Pengaturan Akun', icon: Settings, path: '/setting/profil' },
]

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  mobileOpen,
  onMobileClose,
}) => {
  const { user, store, logout } = useAuth()
  const isStoreApproved = store?.status === 'approved'

  // Accordion state for "Toko Saya"
  const isStoreChildActive = ['catalog', 'orders', 'sales', 'store-settings'].includes(currentTab)
  const [storeOpen, setStoreOpen] = useState(true)
  const [tabletFlyoutOpen, setTabletFlyoutOpen] = useState(false)

  // DOM Refs for dynamic hardware-accelerated gliding pill slider
  const desktopContainerRef = useRef<HTMLDivElement>(null)
  const desktopItemRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [desktopPill, setDesktopPill] = useState({
    top: 0,
    left: 0,
    width: 0,
    height: 40,
    opacity: 0,
  })

  const mobileContainerRef = useRef<HTMLDivElement>(null)
  const mobileItemRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [mobilePill, setMobilePill] = useState({
    top: 0,
    left: 0,
    width: 0,
    height: 40,
    opacity: 0,
  })

  // Synchronize dynamic active pill measurements
  const updatePills = () => {
    // 1. Desktop Pill Calculation
    if (desktopContainerRef.current) {
      const containerRect = desktopContainerRef.current.getBoundingClientRect()
      const activeEl = desktopItemRefs.current.get(currentTab)
      if (activeEl) {
        const elRect = activeEl.getBoundingClientRect()
        setDesktopPill({
          top: elRect.top - containerRect.top,
          left: elRect.left - containerRect.left,
          width: elRect.width,
          height: elRect.height,
          opacity: 1,
        })
      }
    }

    // 2. Mobile Pill Calculation
    if (mobileContainerRef.current) {
      const containerRect = mobileContainerRef.current.getBoundingClientRect()
      const activeEl = mobileItemRefs.current.get(currentTab)
      if (activeEl) {
        const elRect = activeEl.getBoundingClientRect()
        setMobilePill({
          top: elRect.top - containerRect.top,
          left: elRect.left - containerRect.left,
          width: elRect.width,
          height: elRect.height,
          opacity: 1,
        })
      }
    }
  }

  // Auto-expand accordion when a child tab is active
  useEffect(() => {
    if (isStoreChildActive) {
      setStoreOpen(true)
    }
  }, [isStoreChildActive])

  // Recalculate positions on tab change, accordion toggle, or window resize
  useEffect(() => {
    updatePills()
    const frame = requestAnimationFrame(updatePills)
    const t1 = setTimeout(updatePills, 50)
    const t2 = setTimeout(updatePills, 160)
    const t3 = setTimeout(updatePills, 320)

    window.addEventListener('resize', updatePills)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      window.removeEventListener('resize', updatePills)
    }
  }, [currentTab, storeOpen, mobileOpen])

  // Tablet active index for sliding indicator box
  const tabletActiveIndex = useMemo(() => {
    if (currentTab === 'dashboard') return 0
    if (isStoreChildActive) return 1
    if (currentTab === 'setting') return 2
    return 0
  }, [currentTab, isStoreChildActive])

  const handleSelectTab = (tab: NavTab) => {
    onTabChange(tab)
    onMobileClose()
    setTabletFlyoutOpen(false)
  }

  return (
    <>
      {/* =========================================================================
          1. DESKTOP SIDEBAR (lg: >= 1024px) - Ultra-Smooth Gliding Slider Pill
          ========================================================================= */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-zinc-200/80 bg-white h-screen sticky top-0 shrink-0 select-none">
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center border-b border-zinc-100">
          <a href="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
            <img src="/logo.png" alt="REUANG" className="h-6 w-auto object-contain" />
          </a>
        </div>

        {/* Navigation Menu with Silky Gliding Pill Slider */}
        <div className="flex-1 py-4 px-3 overflow-y-auto">
          <div ref={desktopContainerRef} className="relative space-y-1">
            {/* GPU Hardware-Accelerated Floating Active Pill */}
            <div
              className="absolute bg-zinc-900 rounded-lg shadow-xs pointer-events-none transition-[transform,width,height,opacity] duration-300 ease-[cubic-bezier(0.2,0,0,1)] z-0"
              style={{
                transform: `translate3d(${desktopPill.left}px, ${desktopPill.top}px, 0)`,
                width: `${desktopPill.width}px`,
                height: `${desktopPill.height}px`,
                opacity: desktopPill.opacity,
              }}
            />

            {/* Menu Item: Dashboard */}
            <a
              ref={(el) => {
                if (el) desktopItemRefs.current.set('dashboard', el)
                else desktopItemRefs.current.delete('dashboard')
              }}
              href="/dashboard"
              onClick={(e) => {
                e.preventDefault()
                handleSelectTab('dashboard')
              }}
              className={`w-full h-10 flex items-center gap-3 px-3 rounded-lg text-xs font-medium text-left cursor-pointer transition-colors duration-200 relative z-10 ${
                currentTab === 'dashboard'
                  ? 'text-white'
                  : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/60'
              }`}
            >
              <LayoutDashboard
                className={`w-4 h-4 shrink-0 transition-colors duration-200 ${
                  currentTab === 'dashboard' ? 'text-white' : 'text-zinc-500'
                }`}
              />
              <span className="truncate">Dashboard</span>
            </a>

            {/* Accordion Menu: Toko Saya */}
            <div className="space-y-1 relative z-10">
              <button
                type="button"
                onClick={() => {
                  if (!isStoreApproved) return
                  setStoreOpen(!storeOpen)
                }}
                className={`w-full h-10 flex items-center justify-between px-3 rounded-lg text-xs font-medium text-left transition-colors duration-200 ${
                  !isStoreApproved
                    ? 'text-zinc-400 cursor-not-allowed opacity-50'
                    : isStoreChildActive
                    ? 'text-zinc-950 font-semibold bg-zinc-100/80 hover:bg-zinc-100 cursor-pointer'
                    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/60 cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Store
                    className={`w-4 h-4 shrink-0 transition-colors duration-200 ${
                      isStoreChildActive ? 'text-zinc-950' : 'text-zinc-500'
                    }`}
                  />
                  <span className="truncate">Toko Saya</span>
                </div>

                {!isStoreApproved ? (
                  <Lock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                ) : (
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                      storeOpen ? 'rotate-180 text-zinc-700' : ''
                    }`}
                  />
                )}
              </button>

              {/* Accordion Children with Silky CSS Grid Transition */}
              <div
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                  storeOpen && isStoreApproved
                    ? 'grid-rows-[1fr] opacity-100'
                    : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                }`}
                onTransitionEnd={updatePills}
              >
                <div className="overflow-hidden">
                  <div className="ml-4 pl-3.5 border-l border-zinc-200/80 space-y-1 py-1">
                    {storeChildItems.map((child) => {
                      const ChildIcon = child.icon
                      const isActive = currentTab === child.id
                      return (
                        <a
                          key={child.id}
                          ref={(el) => {
                            if (el) desktopItemRefs.current.set(child.id, el)
                            else desktopItemRefs.current.delete(child.id)
                          }}
                          href={child.path}
                          onClick={(e) => {
                            e.preventDefault()
                            handleSelectTab(child.id)
                          }}
                          className={`w-full h-9 flex items-center gap-2.5 px-2.5 rounded-lg text-xs font-medium text-left cursor-pointer transition-colors duration-200 relative z-10 ${
                            isActive
                              ? 'text-white'
                              : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/60'
                          }`}
                        >
                          <ChildIcon
                            className={`w-3.5 h-3.5 shrink-0 transition-colors duration-200 ${
                              isActive ? 'text-white' : 'text-zinc-500'
                            }`}
                          />
                          <span className="truncate">{child.label}</span>
                        </a>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>



            {/* Menu Item: Pengaturan Akun */}
            <a
              ref={(el) => {
                if (el) desktopItemRefs.current.set('setting', el)
                else desktopItemRefs.current.delete('setting')
              }}
              href="/setting/profil"
              onClick={(e) => {
                e.preventDefault()
                handleSelectTab('setting')
              }}
              className={`w-full h-10 flex items-center gap-3 px-3 rounded-lg text-xs font-medium text-left cursor-pointer transition-colors duration-200 relative z-10 ${
                currentTab === 'setting'
                  ? 'text-white'
                  : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/60'
              }`}
            >
              <Settings
                className={`w-4 h-4 shrink-0 transition-colors duration-200 ${
                  currentTab === 'setting' ? 'text-white' : 'text-zinc-500'
                }`}
              />
              <span className="truncate">Pengaturan Akun</span>
            </a>
          </div>
        </div>

        {/* User Profile & Logout Footer */}
        {user && (
          <div className="p-3 border-t border-zinc-100 bg-zinc-50/50">
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-zinc-200/80 shadow-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={user.profileUrl || '/media/profile/default-profile.jpeg'}
                  alt={user.name}
                  className="w-7 h-7 rounded-full object-cover shrink-0 border border-zinc-200/80"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-zinc-900 truncate leading-none mb-1">
                    {store?.name || user.storeName || user.name}
                  </p>
                  <p className="text-[11px] font-mono text-zinc-500 truncate leading-none">
                    @{user.username}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                title="Keluar"
                className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* =========================================================================
          2. TABLET SIDEBAR (md: 768px - 1023px) - With Smooth Gliding Indicator Box
          ========================================================================= */}
      <aside className="hidden md:flex lg:hidden flex-col w-20 border-r border-zinc-200/80 bg-white h-screen sticky top-0 shrink-0 items-center justify-between py-4 select-none">
        {/* Brand Icon Header */}
        <div className="flex flex-col items-center">
          <a href="/" className="p-1 hover:opacity-85 transition-opacity" title="REUANG">
            <img src="/logo-icon.png" alt="REUANG" className="w-8 h-8 object-contain" />
          </a>
        </div>

        {/* Tablet Navigation Icons with Gliding Box */}
        <div className="relative">
          {/* Active Gliding Box on Tablet */}
          <div
            className="absolute left-0 w-10 h-10 bg-zinc-900 rounded-lg shadow-xs transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] z-0 pointer-events-none"
            style={{
              transform: `translateY(${tabletActiveIndex * 52}px)`,
            }}
          />

          <div className="space-y-3 flex flex-col items-center relative z-10">
            {/* Dashboard */}
            <a
              href="/dashboard"
              onClick={(e) => {
                e.preventDefault()
                handleSelectTab('dashboard')
              }}
              title="Dashboard"
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors duration-200 cursor-pointer relative group ${
                currentTab === 'dashboard'
                  ? 'text-white'
                  : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/50'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 transition-colors duration-200" />
              <span className="absolute left-full ml-3 px-2 py-1 rounded-md bg-zinc-900 text-white text-[11px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-md">
                Dashboard
              </span>
            </a>

            {/* Toko Saya with Hover Flyout Popover */}
            <div
              className="relative"
              onMouseEnter={() => setTabletFlyoutOpen(true)}
              onMouseLeave={() => setTabletFlyoutOpen(false)}
            >
              <button
                type="button"
                disabled={!isStoreApproved}
                onClick={() => {
                  if (isStoreApproved) {
                    setTabletFlyoutOpen(!tabletFlyoutOpen)
                  }
                }}
                title="Toko Saya"
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors duration-200 cursor-pointer relative group ${
                  !isStoreApproved
                    ? 'text-zinc-400 cursor-not-allowed opacity-50'
                    : isStoreChildActive
                    ? 'text-white'
                    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/50'
                }`}
              >
                <Store className="w-4 h-4 transition-colors duration-200" />
                {!isStoreApproved ? (
                  <span className="absolute left-full ml-3 px-2 py-1 rounded-md bg-zinc-900 text-white text-[11px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-md">
                    Toko Saya (Terkunci)
                  </span>
                ) : null}
              </button>

              {/* Flyout Submenu on Tablet */}
              {isStoreApproved && tabletFlyoutOpen && (
                <div className="absolute left-full top-0 ml-2 w-40 bg-white border border-zinc-200/80 rounded-xl shadow-lg p-1.5 z-50 animate-in fade-in-50 duration-150">
                  <div className="px-2.5 py-1 text-[11px] font-semibold text-zinc-900 border-b border-zinc-100 mb-1">
                    Toko Saya
                  </div>
                  {storeChildItems.map((child) => {
                    const ChildIcon = child.icon
                    const isActive = currentTab === child.id
                    return (
                      <a
                        key={child.id}
                        href={child.path}
                        onClick={(e) => {
                          e.preventDefault()
                          handleSelectTab(child.id)
                        }}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-zinc-900 text-white font-medium'
                            : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/70'
                        }`}
                      >
                        <ChildIcon className="w-3.5 h-3.5 shrink-0" />
                        <span>{child.label}</span>
                      </a>
                    )
                  })}
                </div>
              )}
            </div>



            {/* Pengaturan Akun */}
            <a
              href="/setting/profil"
              onClick={(e) => {
                e.preventDefault()
                handleSelectTab('setting')
              }}
              title="Pengaturan Akun"
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors duration-200 cursor-pointer relative group ${
                currentTab === 'setting'
                  ? 'text-white'
                  : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/50'
              }`}
            >
              <Settings className="w-4 h-4 transition-colors duration-200" />
              <span className="absolute left-full ml-3 px-2 py-1 rounded-md bg-zinc-900 text-white text-[11px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-md">
                Pengaturan Akun
              </span>
            </a>
          </div>
        </div>

        {/* Tablet User Initial & Logout Button */}
        {user && (
          <div className="flex flex-col items-center gap-2">
            <img
              src={user.profileUrl || '/media/profile/default-profile.jpeg'}
              alt={user.name}
              className="w-8 h-8 rounded-full object-cover shrink-0 border border-zinc-200/80 shadow-xs"
              title={`${store?.name || user.storeName || user.name} (@${user.username})`}
            />
            <button
              type="button"
              onClick={logout}
              title="Keluar"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </aside>

      {/* =========================================================================
          3. MOBILE SLIDE-OVER DRAWER (< md: < 768px)
          ========================================================================= */}
      <div
        className={`fixed inset-0 z-50 md:hidden transition-all duration-300 ${
          mobileOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'
        }`}
      >
        {/* Backdrop */}
        <div
          className={`fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity duration-300 ease-in-out ${
            mobileOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={onMobileClose}
          aria-hidden="true"
        />

        {/* Drawer Panel */}
        <div
          className={`relative w-72 max-w-[85vw] bg-white h-full shadow-2xl flex flex-col justify-between z-10 border-r border-zinc-200 select-none transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Drawer Header */}
          <div className="h-16 px-5 flex items-center justify-between border-b border-zinc-100">
            <img src="/logo.png" alt="REUANG" className="h-6 w-auto object-contain" />
            <button
              type="button"
              onClick={onMobileClose}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer active:scale-95"
              aria-label="Tutup Menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mobile Navigation Links with Gliding Pill Slider */}
          <div className="flex-1 py-4 px-3 overflow-y-auto">
            <div ref={mobileContainerRef} className="relative space-y-1">
              {/* Mobile Active Pill */}
              <div
                className="absolute bg-zinc-900 rounded-lg shadow-xs pointer-events-none transition-[transform,width,height,opacity] duration-300 ease-[cubic-bezier(0.2,0,0,1)] z-0"
                style={{
                  transform: `translate3d(${mobilePill.left}px, ${mobilePill.top}px, 0)`,
                  width: `${mobilePill.width}px`,
                  height: `${mobilePill.height}px`,
                  opacity: mobilePill.opacity,
                }}
              />

              {/* Dashboard */}
              <a
                ref={(el) => {
                  if (el) mobileItemRefs.current.set('dashboard', el)
                  else mobileItemRefs.current.delete('dashboard')
                }}
                href="/dashboard"
                onClick={(e) => {
                  e.preventDefault()
                  handleSelectTab('dashboard')
                }}
                className={`w-full h-10 flex items-center gap-3 px-3 rounded-lg text-xs font-medium text-left cursor-pointer transition-colors duration-200 relative z-10 ${
                  currentTab === 'dashboard'
                    ? 'text-white'
                    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/60'
                }`}
              >
                <LayoutDashboard
                  className={`w-4 h-4 shrink-0 transition-colors duration-200 ${
                    currentTab === 'dashboard' ? 'text-white' : 'text-zinc-500'
                  }`}
                />
                <span className="truncate">Dashboard</span>
              </a>

              {/* Accordion: Toko Saya */}
              <div className="space-y-1 relative z-10">
                <button
                  type="button"
                  onClick={() => {
                    if (!isStoreApproved) return
                    setStoreOpen(!storeOpen)
                  }}
                  className={`w-full h-10 flex items-center justify-between px-3 rounded-lg text-xs font-medium text-left transition-colors duration-200 ${
                    !isStoreApproved
                      ? 'text-zinc-400 cursor-not-allowed opacity-50'
                      : isStoreChildActive
                      ? 'text-zinc-950 font-semibold bg-zinc-100/80 hover:bg-zinc-100 cursor-pointer'
                      : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/60 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Store
                      className={`w-4 h-4 shrink-0 transition-colors duration-200 ${
                        isStoreChildActive ? 'text-zinc-950' : 'text-zinc-500'
                      }`}
                    />
                    <span className="truncate">Toko Saya</span>
                  </div>

                  {!isStoreApproved ? (
                    <Lock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  ) : (
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                        storeOpen ? 'rotate-180 text-zinc-700' : ''
                      }`}
                    />
                  )}
                </button>

                {/* Children with Smooth Grid Transition */}
                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
                    storeOpen && isStoreApproved
                      ? 'grid-rows-[1fr] opacity-100'
                      : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                  }`}
                  onTransitionEnd={updatePills}
                >
                  <div className="overflow-hidden">
                    <div className="ml-4 pl-3.5 border-l border-zinc-200/80 space-y-1 py-1">
                      {storeChildItems.map((child) => {
                        const ChildIcon = child.icon
                        const isActive = currentTab === child.id
                        return (
                          <a
                            key={child.id}
                            ref={(el) => {
                              if (el) mobileItemRefs.current.set(child.id, el)
                              else mobileItemRefs.current.delete(child.id)
                            }}
                            href={child.path}
                            onClick={(e) => {
                              e.preventDefault()
                              handleSelectTab(child.id)
                            }}
                            className={`w-full h-9 flex items-center gap-2.5 px-2.5 rounded-lg text-xs font-medium text-left cursor-pointer transition-colors duration-200 relative z-10 ${
                              isActive
                                ? 'text-white'
                                : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/60'
                            }`}
                          >
                            <ChildIcon
                              className={`w-3.5 h-3.5 shrink-0 transition-colors duration-200 ${
                                isActive ? 'text-white' : 'text-zinc-500'
                              }`}
                            />
                            <span className="truncate">{child.label}</span>
                          </a>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>



              {/* Pengaturan Akun */}
              <a
                ref={(el) => {
                  if (el) mobileItemRefs.current.set('setting', el)
                  else mobileItemRefs.current.delete('setting')
                }}
                href="/setting/profil"
                onClick={(e) => {
                  e.preventDefault()
                  handleSelectTab('setting')
                }}
                className={`w-full h-10 flex items-center gap-3 px-3 rounded-lg text-xs font-medium text-left cursor-pointer transition-colors duration-200 relative z-10 ${
                  currentTab === 'setting'
                    ? 'text-white'
                    : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/60'
                }`}
              >
                <Settings
                  className={`w-4 h-4 shrink-0 transition-colors duration-200 ${
                    currentTab === 'setting' ? 'text-white' : 'text-zinc-500'
                  }`}
                />
                <span className="truncate">Pengaturan Akun</span>
              </a>
            </div>
          </div>

          {/* Mobile User Footer */}
          {user && (
            <div className="p-4 border-t border-zinc-100 bg-zinc-50/50">
              <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-zinc-200/80 shadow-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={user.profileUrl || '/media/profile/default-profile.jpeg'}
                    alt={user.name}
                    className="w-8 h-8 rounded-full object-cover shrink-0 border border-zinc-200/80 shadow-xs"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-zinc-900 truncate leading-none mb-1">
                      {store?.name || user.storeName || user.name}
                    </p>
                    <p className="text-[11px] font-mono text-zinc-500 truncate leading-none">
                      @{user.username}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  title="Keluar"
                  className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
