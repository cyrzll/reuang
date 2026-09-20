import React from 'react'
import { LogOut } from 'lucide-react'
import { Button } from './ui/button'
import { useAuth } from '../context/AuthContext'
import type { User } from './types'

interface NavbarProps {
  serverOnline: boolean
  user?: User | null
  onLogout?: () => void
}

export const Navbar: React.FC<NavbarProps> = ({
  serverOnline,
  user: propUser,
  onLogout: propLogout,
}) => {
  const auth = useAuth()
  const user = propUser !== undefined ? propUser : auth.user
  const handleLogout = propLogout || auth.logout

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-zinc-200/80">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Logo in Navbar Beranda */}
        <div className="flex items-center gap-3">
          <a href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <img
              src="/logo.png"
              alt="REUANG"
              className="h-6 w-auto object-contain"
            />
          </a>
        </div>

        {/* User Info & Actions */}
        <div className="flex items-center gap-3">

          {user && (
            <div className="flex items-center gap-2.5 pl-2 border-l border-zinc-200">
              <img
                src={user.profileUrl || '/media/profile/default-profile.jpeg'}
                alt={user.name}
                className="w-6 h-6 rounded-full object-cover border border-zinc-200"
              />
              <span className="text-xs font-mono text-zinc-600">
                @{user.username}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="h-7 px-2.5 text-xs text-zinc-700 hover:text-zinc-900"
              >
                <LogOut className="w-3 h-3" />
                <span>Keluar</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
