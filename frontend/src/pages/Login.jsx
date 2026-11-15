/**
 * Login / landing page.
 * Shows when user is not authenticated.
 */
import React, { useEffect, useState } from 'react'
import { Sparkles, Mail, Shield, Zap, MessageSquare } from 'lucide-react'
import { authAPI } from '../services/api'

const FEATURES = [
  { icon: Sparkles, title: 'AI Mail Control',   desc: 'Tell the AI to compose, search, and reply — it controls the UI for you.' },
  { icon: Zap,      title: 'Real-time Sync',    desc: 'Gmail push notifications keep your inbox up to date instantly.' },
  { icon: Shield,   title: 'Secure OAuth',      desc: 'Connects to your real Gmail via Google OAuth 2.0. No passwords stored.' },
  { icon: MessageSquare, title: 'Smart Context', desc: 'AI understands which email you have open and prepares context-aware replies.' },
]

export default function Login() {
  const [error, setError] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    if (err) {
      setError({
        oauth_denied:    'Gmail access was denied. Please try again.',
        auth_failed:     'Authentication failed. Please try again.',
        state_mismatch:  'Security check failed. Please try again.',
        session_expired: 'Your session expired. Please sign in again.',
      }[err] || 'Authentication error. Please try again.')
    }
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-nebula-950 via-nebula-900 to-purple-950
                    flex items-center justify-center p-4">

      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-nebula-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-4xl grid md:grid-cols-2 gap-8 items-center">

        {/* Left – branding */}
        <div className="text-white">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-nebula-400 to-nebula-600
                            flex items-center justify-center shadow-lg">
              <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                <rect x="2" y="4" width="20" height="16" rx="2" stroke="white" strokeWidth="1.8"/>
                <path d="M2 7l10 7 10-7" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold">Nebula Mail</h1>
              <p className="text-nebula-300 text-sm">AI-Powered Email Client</p>
            </div>
          </div>

          <p className="text-3xl font-bold leading-tight mb-6 text-white">
            Your email,<br />
            <span className="text-nebula-300">controlled by AI.</span>
          </p>

          <p className="text-nebula-200 text-base mb-8 leading-relaxed">
            Nebula connects to your real Gmail account and gives you an AI assistant
            that can compose, search, filter, and reply — just by asking.
          </p>

          <div className="grid grid-cols-1 gap-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-nebula-800/60 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={15} className="text-nebula-300" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-xs text-nebula-400 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right – sign in card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-nebula-50 flex items-center justify-center mx-auto mb-4">
              <Mail size={26} className="text-nebula-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Connect your Gmail</h2>
            <p className="text-sm text-gray-500 mt-2">
              Sign in with Google to access your real inbox through the Nebula AI Mail interface.
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={() => authAPI.login()}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-6
                       border-2 border-gray-200 rounded-2xl text-sm font-semibold text-gray-700
                       hover:border-nebula-400 hover:bg-nebula-50 hover:text-nebula-700
                       transition-all duration-200 group shadow-sm"
          >
            {/* Google "G" logo */}
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>

          <p className="text-xs text-center text-gray-400 mt-5 leading-relaxed">
            By connecting, you grant Nebula Mail read, send, and modify access
            to your Gmail account via Google OAuth 2.0.
            Your credentials are never stored.
          </p>
        </div>
      </div>
    </div>
  )
}
