import React, { useState, useEffect } from 'react'
import { AuthProvider } from '../context/AuthContext'
import { Navbar } from './Navbar'
import { AuthForm } from './AuthForm'
import { SERVER_URL } from '../lib/api'

interface AuthPageProps {
  initialMode?: 'login' | 'register'
}

const AuthPageContent: React.FC<AuthPageProps> = ({ initialMode = 'login' }) => {
  const [serverOnline, setServerOnline] = useState(false)

  useEffect(() => {
    fetch(SERVER_URL)
      .then((res) => setServerOnline(res.ok))
      .catch(() => setServerOnline(false))
  }, [])

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-950 flex flex-col font-sans">
      <Navbar serverOnline={serverOnline} />
      <AuthForm initialMode={initialMode} />
    </div>
  )
}

export const AuthPage: React.FC<AuthPageProps> = ({ initialMode = 'login' }) => {
  return (
    <AuthProvider>
      <AuthPageContent initialMode={initialMode} />
    </AuthProvider>
  )
}

export default AuthPage
