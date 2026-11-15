/**
 * Settings panel – account info, reconnect Gmail, theme toggle.
 */
import React from 'react'
import { Mail, Shield, RefreshCw, LogOut, Moon, Sun } from 'lucide-react'
import { useMail } from '../context/MailContext'
import { authAPI } from '../services/api'

export default function Settings() {
  const { user, logout, addToast } = useMail()
  const [dark, setDark] = React.useState(
    () => document.documentElement.classList.contains('dark')
  )

  function toggleDark() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('nebula-dark', next ? '1' : '0')
  }

  async function reconnectGmail() {
    authAPI.login()
  }

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="max-w-xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Settings</h1>

        {/* Account section */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Account</h2>
          <div className="card p-5">
            <div className="flex items-center gap-4">
              {user?.picture ? (
                <img src={user.picture} alt="" className="w-14 h-14 rounded-full border-2 border-gray-200" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-nebula-100 flex items-center justify-center
                                text-nebula-700 font-bold text-xl">
                  {user?.name?.[0] || '?'}
                </div>
              )}
              <div>
                <p className="font-semibold text-gray-900">{user?.name || 'User'}</p>
                <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                  <Mail size={12} /> {user?.email}
                </p>
                <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100
                                 px-2 py-0.5 rounded-full mt-2 font-medium">
                  <Shield size={10} /> Gmail connected
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Gmail connection */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Gmail Connection</h2>
          <div className="card p-5 space-y-3">
            <p className="text-sm text-gray-600">
              Your Gmail account is connected. You can reconnect to refresh permissions.
            </p>
            <button onClick={reconnectGmail}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200
                         rounded-lg hover:bg-gray-50 transition-colors text-gray-700">
              <RefreshCw size={14} /> Reconnect Gmail
            </button>
          </div>
        </section>

        {/* Appearance */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Appearance</h2>
          <div className="card p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Dark Mode</p>
              <p className="text-xs text-gray-500 mt-0.5">Switch between light and dark theme</p>
            </div>
            <button onClick={toggleDark}
              className={`relative w-11 h-6 rounded-full transition-colors
                          ${dark ? 'bg-nebula-600' : 'bg-gray-200'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow
                                transition-transform flex items-center justify-center
                                ${dark ? 'translate-x-5' : ''}`}>
                {dark ? <Moon size={11} className="text-nebula-600" /> : <Sun size={11} className="text-amber-500" />}
              </span>
            </button>
          </div>
        </section>

        {/* AI Assistant */}
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">AI Assistant</h2>
          <div className="card p-5">
            <p className="text-sm text-gray-600 mb-2">
              Powered by <span className="font-semibold text-nebula-700">Google Gemini 2.0 Flash</span>
            </p>
            <p className="text-xs text-gray-500">
              The AI assistant can compose, search, filter, reply, and control the mail UI through natural language commands.
            </p>
          </div>
        </section>

        {/* Danger zone */}
        <section>
          <h2 className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-3">Account Actions</h2>
          <div className="card p-5">
            <button onClick={logout}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600
                         border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
