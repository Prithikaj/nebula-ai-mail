/**
 * Filter bar above the email list.
 * Manual filters that sync with the same state the AI assistant uses.
 */
import React, { useState } from 'react'
import { Search, X, Filter } from 'lucide-react'
import { useMail } from '../context/MailContext'

const DATE_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_10_days', label: 'Last 10 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
]

const READ_OPTIONS = [
  { value: '', label: 'All mail' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
]

function getDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

export default function EmailFilters() {
  const { searchEmails, activeFilters, dispatch, loadInbox, currentView } = useMail()
  const [keyword, setKeyword]   = useState('')
  const [sender, setSender]     = useState('')
  const [dateRange, setDateRange] = useState('')
  const [readStatus, setReadStatus] = useState('')

  const hasFilters = keyword || sender || dateRange || readStatus

  function applyFilters() {
    const params = {}
    if (keyword)    params.keyword    = keyword
    if (sender)     params.sender     = sender
    if (readStatus) params.read_status = readStatus
    if (dateRange) {
      const days = dateRange === 'last_7_days' ? 7 : dateRange === 'last_10_days' ? 10 : 30
      params.date_after = getDaysAgo(days)
    }
    if (Object.keys(params).length) {
      searchEmails(params)
    }
  }

  function clearFilters() {
    setKeyword(''); setSender(''); setDateRange(''); setReadStatus('')
    dispatch({ type: 'CLEAR_FILTERS' })
    loadInbox()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') applyFilters()
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-gray-100 flex-wrap">

      {/* Keyword search */}
      <div className="relative flex-1 min-w-[180px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search emails..."
          className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-200
                     focus:outline-none focus:ring-2 focus:ring-nebula-400 bg-gray-50"
        />
      </div>

      {/* Sender filter */}
      <input
        value={sender}
        onChange={(e) => setSender(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="From sender..."
        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 w-36
                   focus:outline-none focus:ring-2 focus:ring-nebula-400 bg-gray-50"
      />

      {/* Date range */}
      <select
        value={dateRange}
        onChange={(e) => setDateRange(e.target.value)}
        className="px-2 py-1.5 text-sm rounded-lg border border-gray-200 bg-gray-50
                   focus:outline-none focus:ring-2 focus:ring-nebula-400 cursor-pointer"
      >
        {DATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {/* Read status */}
      <select
        value={readStatus}
        onChange={(e) => setReadStatus(e.target.value)}
        className="px-2 py-1.5 text-sm rounded-lg border border-gray-200 bg-gray-50
                   focus:outline-none focus:ring-2 focus:ring-nebula-400 cursor-pointer"
      >
        {READ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {/* Apply */}
      <button
        onClick={applyFilters}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                   bg-nebula-600 text-white rounded-lg hover:bg-nebula-700 transition-colors"
      >
        <Filter size={13} /> Apply
      </button>

      {/* Clear */}
      {hasFilters && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-1 px-2.5 py-1.5 text-sm text-gray-500
                     hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <X size={13} /> Clear
        </button>
      )}

      {/* Active filter chips */}
      {Object.entries(activeFilters).filter(([,v]) => v).map(([k, v]) => (
        <span key={k} className="text-xs bg-nebula-100 text-nebula-700 px-2 py-0.5 rounded-full font-medium">
          {k}: {v}
        </span>
      ))}
    </div>
  )
}
