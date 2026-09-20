import React, { useState, useEffect } from 'react'
import { Card, CardHeader, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { useAuth } from '../context/AuthContext'

interface AuthFormProps {
  initialMode?: 'login' | 'register'
}

export const AuthForm: React.FC<AuthFormProps> = ({ initialMode = 'login' }) => {
  const { login, register, isAuthenticated, isLoading } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Redirect to /dashboard if already logged in
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      if (typeof window !== 'undefined' && (window.location.pathname === '/login' || window.location.pathname === '/register')) {
        window.location.replace('/dashboard')
      }
    }
  }, [isLoading, isAuthenticated])

  const handleModeChange = (newMode: 'login' | 'register') => {
    setMode(newMode)
    setErrorMessage(null)
    if (typeof window !== 'undefined' && (window.location.pathname === '/login' || window.location.pathname === '/register')) {
      window.history.pushState(null, '', `/${newMode}`)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setLoading(true)

    try {
      if (mode === 'login') {
        await login(identifier, password)
      } else {
        await register({ name, username, email, phone, password })
      }
      if (typeof window !== 'undefined') {
        window.location.href = '/dashboard'
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Autentikasi gagal.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm shadow-xs border-zinc-200/80">
        <CardHeader className="pb-4 pt-6 text-center">
          {/* Logo on Halaman Awal */}
          <div className="flex justify-center mb-4">
            <a href="/" className="hover:opacity-90 transition-opacity">
              <img
                src="/logo.png"
                alt="REUANG"
                className="h-9 sm:h-10 w-auto object-contain"
              />
            </a>
          </div>

          {/* Line-soft Tab Switcher */}
          <div className="flex border-b border-zinc-200 justify-center gap-6 mt-1">
            <button
              type="button"
              onClick={() => handleModeChange('login')}
              className={`pb-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'border-zinc-950 text-zinc-950 font-semibold'
                  : 'border-transparent text-zinc-400 hover:text-zinc-700'
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('register')}
              className={`pb-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'border-zinc-950 text-zinc-950 font-semibold'
                  : 'border-transparent text-zinc-400 hover:text-zinc-700'
              }`}
            >
              Daftar
            </button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {errorMessage && (
            <div className="p-2.5 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-800 text-xs">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-name">Nama Lengkap</Label>
                  <Input
                    id="reg-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reg-username">Username</Label>
                  <Input
                    id="reg-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    required
                    className="font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reg-phone">Nomor HP</Label>
                  <Input
                    id="reg-phone"
                    type="tel"
                    placeholder="081234567890"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^0-9+]/g, ''))}
                    required
                  />
                </div>
              </>
            )}

            {mode === 'login' && (
              <div className="space-y-1.5">
                <Label htmlFor="login-id">Username atau Email</Label>
                <Input
                  id="login-id"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="font-mono"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full mt-2"
            >
              {loading ? 'Memproses...' : mode === 'login' ? 'Masuk' : 'Daftar Akun'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
