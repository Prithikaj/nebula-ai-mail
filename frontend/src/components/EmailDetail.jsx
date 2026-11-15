/**
 * Email detail view – shows full email with HTML body, reply/forward actions.
 */
import React, { useRef } from 'react'
import {
  ArrowLeft, Reply, Forward,
  Mail, MailOpen, Calendar,
} from 'lucide-react'
import DOMPurify from 'dompurify'
import { formatDistanceToNow } from 'date-fns'
import { useMail } from '../context/MailContext'
import { emailsAPI } from '../services/api'


function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    return d.toLocaleString('en-US', {
      weekday: 'short', year: 'numeric', month: 'short',
      day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return dateStr }
}

export default function EmailDetail() {
  const { currentEmail, dispatch, loadInbox, addToast } = useMail()
  const iframeRef = useRef(null)

  if (!currentEmail) return null

  const email = currentEmail

  function goBack() {
    dispatch({ type: 'NAVIGATE', view: 'inbox' })
    dispatch({ type: 'CLEAR_CURRENT_EMAIL' })
  }

  function openReply() {
    dispatch({
      type: 'OPEN_COMPOSE',
      mode: 'reply',
      data: {
        to: email.sender_email,
        subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
        body: '',
        reply_to_message_id: email.id,
        thread_id: email.thread_id,
      },
    })
  }

  function openForward() {
    dispatch({
      type: 'OPEN_COMPOSE',
      mode: 'forward',
      data: {
        to: '',
        subject: `Fwd: ${email.subject}`,
        body: `\n\n---------- Forwarded message ----------\nFrom: ${email.sender_email}\nDate: ${email.date}\nSubject: ${email.subject}\n\n${email.body_plain || email.snippet || ''}`,
      },
    })
  }

  async function toggleRead() {
    try {
      if (email.is_unread) {
        await emailsAPI.markRead(email.id)
        dispatch({ type: 'UPDATE_EMAIL_IN_LIST', emailId: email.id, updates: { is_unread: false } })
      } else {
        await emailsAPI.markUnread(email.id)
        dispatch({ type: 'UPDATE_EMAIL_IN_LIST', emailId: email.id, updates: { is_unread: true } })
      }
    } catch {
      addToast('Could not update read status', 'error')
    }
  }

  // Sanitize HTML body for safe rendering
  const safeHtml = email.body_html
    ? DOMPurify.sanitize(email.body_html, {
        ALLOWED_TAGS: ['p','br','b','i','u','strong','em','a','ul','ol','li',
                       'h1','h2','h3','h4','h5','h6','span','div','table','tr',
                       'td','th','thead','tbody','blockquote','pre','code','img',
                       'hr','small','sup','sub'],
        ALLOWED_ATTR: ['href','title','target','src','alt','width','height','style','class'],
      })
    : null

  return (
    <div className="flex flex-col h-full bg-white">

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
        <button onClick={goBack} className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
          <ArrowLeft size={17} />
        </button>
        <div className="flex-1" />
        <button onClick={toggleRead} title={email.is_unread ? 'Mark as read' : 'Mark as unread'}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
          {email.is_unread ? <MailOpen size={16} /> : <Mail size={16} />}
        </button>
        <button onClick={openReply}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                     border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-700">
          <Reply size={14} /> Reply
        </button>
        <button onClick={openForward}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                     border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-700">
          <Forward size={14} /> Forward
        </button>
      </div>

      {/* Email content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6">

          {/* Subject */}
          <h1 className="text-xl font-bold text-gray-900 mb-5 leading-snug">
            {email.subject}
          </h1>

          {/* Meta card */}
          <div className="flex items-start gap-3 mb-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="w-10 h-10 rounded-full bg-nebula-100 flex items-center justify-center
                            text-nebula-700 font-bold text-base uppercase shrink-0">
              {(email.sender_name || email.sender_email || '?')[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-semibold text-gray-900 text-sm">{email.sender_name || email.sender_email}</span>
                <span className="text-xs text-gray-500">&lt;{email.sender_email}&gt;</span>
              </div>
              <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                <div><span className="font-medium text-gray-600">To:</span> {email.to}</div>
                {email.cc && <div><span className="font-medium text-gray-600">Cc:</span> {email.cc}</div>}
                <div className="flex items-center gap-1 mt-1">
                  <Calendar size={11} className="text-gray-400" />
                  {formatDate(email.date)}
                </div>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="email-body-html prose prose-sm max-w-none">
            {safeHtml ? (
              <div dangerouslySetInnerHTML={{ __html: safeHtml }} />
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed">
                {email.body_plain || email.snippet || '(No content)'}
              </pre>
            )}
          </div>
        </div>
      </div>

      {/* Quick reply bar */}
      <div className="border-t border-gray-100 px-6 py-3 bg-gray-50 shrink-0">
        <button onClick={openReply}
          className="w-full text-left px-4 py-2.5 rounded-xl border border-gray-200 bg-white
                     text-sm text-gray-400 hover:border-nebula-400 hover:text-gray-600 transition-colors shadow-sm">
          Click to reply to {email.sender_name || email.sender_email}…
        </button>
      </div>
    </div>
  )
}
