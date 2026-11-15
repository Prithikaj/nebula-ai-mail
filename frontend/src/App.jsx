/**
 * Root application component.
 * Handles auth gating and the main three-column layout:
 *   [Left Sidebar] [Main Content] [AI Assistant]
 */
import React, { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { MailProvider, useMail } from './context/MailContext'

import Sidebar      from './components/Sidebar'
import Inbox        from './components/Inbox'
import EmailDetail  from './components/EmailDetail'
import ComposeEmail from './components/ComposeEmail'
import Settings     from './components/Settings'
import Assistant    from './components/Assistant'
import Toast        from './components/Toast'
import Login        from './pages/Login'
import { Sparkles } from 'lucide-react'

/* ── Loading spinner shown during auth check ── */
function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen bg-nebula-950">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-nebula-400 to-nebula-600
                        flex items-center justify-center mx-auto mb-4 shadow-lg animate-pulse-soft">
          <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
            <rect x="2" y="4" width="20" height="16" rx="2" stroke="white" strokeWidth="1.8"/>
            <path d="M2 7l10 7 10-7" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>
        <p className="text-white font-semibold text-lg">Nebula Mail</p>
        <p className="text-nebula-400 text-sm mt-1">Loading…</p>
      </div>
    </div>
  )
}

/* ── Main content area, switches based on currentView ── */
function MainContent() {
  const { currentView, loadingEmail } = useMail()

  if (currentView === 'settings') {
    return <Settings />
  }

  if (currentView === 'email_detail') {
    return loadingEmail ? (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-nebula-500 border-t-transparent rounded-full" />
      </div>
    ) : (
      <EmailDetail />
    )
  }

  if (currentView === 'compose') {
    return <ComposeEmail />
  }

  // inbox | sent | search all use Inbox component (it adapts via context)
  return <Inbox />
}

/* ── The authenticated app layout ── */
function AppLayout() {
  const { user, authChecked, assistantOpen, dispatch } = useMail()

  if (!authChecked) return <LoadingScreen />
  if (!user)        return <Login />

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Left sidebar */}
      <Sidebar />

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <MainContent />
      </main>

      {/* AI Assistant toggle button (when panel is closed) */}
      {!assistantOpen && (
        <button
          onClick={() => dispatch({ type: 'TOGGLE_ASSISTANT' })}
          className="fixed right-4 bottom-6 w-12 h-12 rounded-2xl
                     bg-gradient-to-br from-nebula-600 to-purple-600 shadow-lg
                     flex items-center justify-center hover:scale-105 transition-transform z-40"
          title="Open AI Assistant"
        >
          <Sparkles size={20} className="text-white" />
        </button>
      )}

      {/* Right sidebar – AI Assistant */}
      {assistantOpen && <Assistant />}

      {/* Toast notifications */}
      <Toast />
    </div>
  )
}

/* ── Root with providers ── */
export default function App() {
  return (
    <BrowserRouter>
      <MailProvider>
        <AppLayout />
      </MailProvider>
    </BrowserRouter>
  )
}
