/**
 * Inbox / Sent / Search results panel – the main email list.
 */
import React, { useEffect, useRef, useCallback } from 'react'
import { RefreshCw, Inbox as InboxIcon, Search as SearchIcon, Send } from 'lucide-react'
import EmailCard from './EmailCard'
import EmailFilters from './EmailFilters'
import { useMail } from '../context/MailContext'

function EmptyState({ view, loading }) {
  if (loading) return null
  const configs = {
    inbox:  { icon: InboxIcon,  title: 'Your inbox is empty',    sub: 'No emails yet.' },
    sent:   { icon: Send,       title: 'No sent emails',          sub: 'Emails you send will appear here.' },
    search: { icon: SearchIcon, title: 'No results found',       sub: 'Try a different search or filter.' },
  }
  const cfg = configs[view] || configs.inbox
  const Icon = cfg.icon
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <Icon size={28} className="text-gray-400" />
      </div>
      <p className="text-sm font-semibold text-gray-700">{cfg.title}</p>
      <p className="text-xs text-gray-400 mt-1">{cfg.sub}</p>
    </div>
  )
}

export default function Inbox() {
  const {
    emailList, emailListTitle, loadingEmails, emailListError,
    nextPageToken, currentView,
    loadInbox, loadSent,
    inboxLoadedRef,   // skip self-load when checkAuth already loaded inbox
  } = useMail()

  const listRef = useRef(null)

  // Load on mount / view change — but skip if checkAuth already populated the list
  useEffect(() => {
    if (currentView === 'inbox') {
      if (!inboxLoadedRef.current) {
        loadInbox()
      }
      // Reset flag so manual refresh or navigation works normally next time
      inboxLoadedRef.current = false
    }
    if (currentView === 'sent') loadSent()
  }, [currentView])

  // Infinite scroll
  const handleScroll = useCallback(() => {
    if (!listRef.current || loadingEmails || !nextPageToken) return
    const { scrollTop, scrollHeight, clientHeight } = listRef.current
    if (scrollTop + clientHeight >= scrollHeight - 120) {
      if (currentView === 'inbox') loadInbox(nextPageToken)
      if (currentView === 'sent')  loadSent(nextPageToken)
    }
  }, [loadingEmails, nextPageToken, currentView, loadInbox, loadSent])

  function refresh() {
    if (currentView === 'sent') loadSent()
    else loadInbox()
  }

  return (
    <div className="flex flex-col h-full bg-white">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
        <div>
          <h1 className="text-base font-bold text-gray-900">{emailListTitle}</h1>
          {emailList.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              {emailList.length} message{emailList.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={loadingEmails}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          title="Refresh"
        >
          <RefreshCw size={15} className={loadingEmails ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filters */}
      <EmailFilters />

      {/* Error */}
      {emailListError && (
        <div className="mx-4 mt-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {emailListError}
        </div>
      )}

      {/* Email list */}
      <div ref={listRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        {loadingEmails && emailList.length === 0 ? (
          <div className="space-y-0 mt-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-4 border-b border-gray-50">
                <div className="w-9 h-9 rounded-full bg-gray-200 animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-1/3" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : emailList.length === 0 ? (
          <EmptyState view={currentView} loading={loadingEmails} />
        ) : (
          <>
            {emailList.map((email) => (
              <EmailCard key={email.id} email={email} />
            ))}
            {loadingEmails && (
              <div className="flex justify-center py-4">
                <RefreshCw size={16} className="animate-spin text-gray-400" />
              </div>
            )}
            {!nextPageToken && emailList.length > 0 && (
              <p className="text-xs text-center text-gray-400 py-4">
                All messages loaded
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
