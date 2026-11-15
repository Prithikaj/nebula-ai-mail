/**
 * A single email row in the list.
 * Shows sender, subject, preview, date, unread/read indicator.
 */
import React from 'react'
import { Star, Paperclip } from 'lucide-react'
import { formatDistanceToNow, parseISO, isValid } from 'date-fns'
import { useMail } from '../context/MailContext'

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (!isValid(d)) return dateStr
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return dateStr
  }
}

function avatarColor(name = '') {
  const colors = [
    'bg-blue-100 text-blue-700',
    'bg-green-100 text-green-700',
    'bg-purple-100 text-purple-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-teal-100 text-teal-700',
    'bg-indigo-100 text-indigo-700',
  ]
  const idx = name.charCodeAt(0) % colors.length
  return colors[idx]
}

export default function EmailCard({ email, selected }) {
  const { openEmail, currentEmail } = useMail()
  const isOpen = currentEmail?.id === email.id

  return (
    <button
      onClick={() => openEmail(email.id)}
      className={`w-full text-left flex items-start gap-3 px-4 py-3.5 border-b border-gray-100
                  transition-colors hover:bg-blue-50/60 group
                  ${isOpen ? 'bg-nebula-50 border-l-2 border-l-nebula-500' : ''}
                  ${email.is_unread ? 'bg-white' : 'bg-gray-50/50'}`}
    >
      {/* Avatar */}
      <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center
                       text-sm font-bold uppercase ${avatarColor(email.sender_name)}`}>
        {(email.sender_name || email.sender_email || '?')[0]}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <span className={`text-sm truncate ${email.is_unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
            {email.sender_name || email.sender_email}
          </span>
          <span className="text-[11px] text-gray-400 shrink-0 whitespace-nowrap">
            {formatDate(email.date)}
          </span>
        </div>

        <p className={`text-sm truncate ${email.is_unread ? 'font-medium text-gray-800' : 'text-gray-600'}`}>
          {email.subject}
        </p>

        <p className="text-xs text-gray-400 truncate mt-0.5">
          {email.snippet || email.preview || ''}
        </p>
      </div>

      {/* Indicators */}
      <div className="shrink-0 flex flex-col items-center gap-1 pt-1">
        {email.is_unread && (
          <span className="w-2 h-2 rounded-full bg-nebula-500" />
        )}
        {email.is_starred && (
          <Star size={13} className="text-amber-400 fill-amber-400" />
        )}
      </div>
    </button>
  )
}
