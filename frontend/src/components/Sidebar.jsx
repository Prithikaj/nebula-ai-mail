/**
 * Left sidebar – navigation, compose button, account info.
 */
import React from 'react'
import {
  Inbox, Send, PenSquare, Search, Settings, LogOut,
  Star, ChevronRight,
} from 'lucide-react'
import { useMail } from '../context/MailContext'

const NAV = [
  { id: 'inbox',    label: 'Inbox',    icon: Inbox },
  { id: 'sent',     label: 'Sent',     icon: Send },
  { id: 'search',   label: 'Search',   icon: Search },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function Sidebar() {
  const {
    currentView, user, emailList, activeFilters,
    dispatch, loadInbox, loadSent, logout,
  } = useMail()

  const unreadCount = emailList.filter((e) => e.is_unread).length

  function navigate(view) {
    if (view === 'inbox') {
      dispatch({ type: 'NAVIGATE', view: 'inbox' })
      loadInbox()
    } else if (view === 'sent') {
      dispatch({ type: 'NAVIGATE', view: 'sent' })
      loadSent()
    } else {
      dispatch({ type: 'NAVIGATE', view })
    }
  }

  function openCompose() {
    dispatch({ type: 'OPEN_COMPOSE', data: {}, mode: 'new' })
  }

  const activeView = ['email_detail', 'compose'].includes(currentView)
    ? 'inbox'
    : currentView

  return (
    <aside className="flex flex-col w-64 h-full bg-white border-r border-gray-100 py-4 px-3 shrink-0">

      {/* Logo */}
      <div className="flex items-center gap-2.5 px-2 mb-6">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-nebula-500 to-nebula-700 flex items-center justify-center shadow-md">
          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
            <rect x="2" y="4" width="20" height="16" rx="2" stroke="white" strokeWidth="1.8"/>
            <path d="M2 7l10 7 10-7" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900 leading-tight">Nebula Mail</p>
          <p className="text-[10px] text-nebula-600 font-medium">AI Powered</p>
        </div>
      </div>

      {/* Compose */}
      <button
        onClick={openCompose}
        className="flex items-center gap-2 w-full mb-5 px-4 py-2.5 rounded-xl
                   bg-nebula-600 text-white font-semibold text-sm
                   hover:bg-nebula-700 active:bg-nebula-800 transition-colors shadow-md"
      >
        <PenSquare size={16} />
        Compose
      </button>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => navigate(id)}
            className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl
                        text-sm font-medium transition-colors group
                        ${activeView === id
                          ? 'bg-nebula-50 text-nebula-700'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
          >
            <div className="flex items-center gap-3">
              <Icon size={17} className={activeView === id ? 'text-nebula-600' : 'text-gray-400 group-hover:text-gray-600'} />
              {label}
            </div>
            {id === 'inbox' && unreadCount > 0 && (
              <span className="text-xs font-semibold bg-nebula-600 text-white rounded-full px-2 py-0.5 min-w-[20px] text-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Active filters badge */}
      {Object.keys(activeFilters).length > 0 && (
        <div className="mx-2 mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs font-medium text-amber-700">Filters active</p>
          <button
            onClick={() => { dispatch({ type: 'CLEAR_FILTERS' }); loadInbox() }}
            className="text-xs text-amber-600 underline mt-0.5"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Account info */}
      {user && (
        <div className="mt-auto pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2.5 px-2 py-2">
            {user.picture ? (
              <img src={user.picture} alt="" className="w-8 h-8 rounded-full border border-gray-200" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-nebula-100 flex items-center justify-center text-nebula-700 font-semibold text-sm">
                {user.name?.[0] || user.email[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">{user.name || 'User'}</p>
              <p className="text-[11px] text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-gray-500
                       hover:text-red-600 hover:bg-red-50 transition-colors mt-1"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      )}
    </aside>
  )
}
