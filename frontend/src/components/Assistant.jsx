/**
 * AI Mail Assistant panel (right sidebar).
 *
 * This is the core feature. User types natural-language commands.
 * The backend calls Gemini with function calling.
 * We receive structured "actions" and dispatch them to MailContext,
 * which updates the UI visibly in real time.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Send, Bot, User, Loader2, Trash2,
  Sparkles, X, Info,
  Search, Mail, PenSquare, Navigation, CheckCircle,
} from 'lucide-react'
import { assistantAPI } from '../services/api'
import { useMail } from '../context/MailContext'

/* ── Tool call status chip ── */
function ToolChip({ tool }) {
  const icons = {
    open_compose: PenSquare,
    fill_email_form: PenSquare,
    send_email: Send,
    search_emails: Search,
    filter_emails: Search,
    open_email: Mail,
    reply_to_email: Mail,
    forward_email: Mail,
    navigate_to_view: Navigation,
    get_current_context: Info,
    mark_email_read: CheckCircle,
    mark_email_unread: Mail,
  }
  const labels = {
    open_compose: 'Opening compose…',
    fill_email_form: 'Filling form…',
    send_email: 'Sending email…',
    search_emails: 'Searching emails…',
    filter_emails: 'Applying filters…',
    open_email: 'Opening email…',
    reply_to_email: 'Preparing reply…',
    forward_email: 'Forwarding…',
    navigate_to_view: 'Navigating…',
    get_current_context: 'Reading context…',
    mark_email_read: 'Marking read…',
    mark_email_unread: 'Marking unread…',
  }
  const Icon = icons[tool] || Sparkles
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium
                     bg-nebula-100 text-nebula-700 px-2 py-0.5 rounded-full">
      <Icon size={10} />
      {labels[tool] || tool}
    </span>
  )
}

/* ── Typing dots ── */
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  )
}

/* ── Email preview card shown inside assistant chat ── */
function EmailPreviewCard({ email, onOpen }) {
  return (
    <button
      onClick={() => onOpen(email.id)}
      className="w-full text-left p-2.5 rounded-xl border border-gray-200 bg-white
                 hover:border-nebula-400 hover:bg-nebula-50 transition-colors mt-1"
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-full bg-nebula-100 flex items-center justify-center
                        text-nebula-700 text-[10px] font-bold uppercase shrink-0">
          {(email.sender_name || email.sender_email || '?')[0]}
        </div>
        <span className="text-xs font-semibold text-gray-800 truncate">
          {email.sender_name || email.sender_email}
        </span>
        {email.is_unread && (
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-nebula-500 shrink-0" />
        )}
      </div>
      <p className="text-xs font-medium text-gray-700 truncate">{email.subject}</p>
      <p className="text-[11px] text-gray-400 truncate mt-0.5">
        {email.snippet || email.preview || ''}
      </p>
    </button>
  )
}

/* ── Message bubble ── */
function Message({ msg, onOpenEmail }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''} animate-fade-in`}>
      {/* Avatar */}
      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center
                       ${isUser ? 'bg-nebula-600' : 'bg-gradient-to-br from-purple-500 to-nebula-600'}`}>
        {isUser
          ? <User size={13} className="text-white" />
          : <Sparkles size={13} className="text-white" />}
      </div>

      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        {/* Tool chips */}
        {msg.tool_calls?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {msg.tool_calls.map((tc, i) => <ToolChip key={i} tool={tc.tool} />)}
          </div>
        )}

        {/* Bubble */}
        <div className={`px-3 py-2.5 rounded-2xl text-sm leading-relaxed
                         ${isUser
                           ? 'bg-nebula-600 text-white rounded-tr-sm'
                           : 'bg-gray-100 text-gray-800 rounded-tl-sm'}`}>
          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
        </div>

        {/* Email preview cards for search results */}
        {msg.search_results?.length > 0 && (
          <div className="w-full space-y-1 mt-1">
            <p className="text-[10px] text-gray-500 font-medium px-1">
              {msg.search_results.length} result{msg.search_results.length !== 1 ? 's' : ''}
            </p>
            {msg.search_results.slice(0, 4).map((email) => (
              <EmailPreviewCard key={email.id} email={email} onOpen={onOpenEmail} />
            ))}
            {msg.search_results.length > 4 && (
              <p className="text-[11px] text-gray-400 px-1">
                +{msg.search_results.length - 4} more in main panel
              </p>
            )}
          </div>
        )}

        <span className="text-[10px] text-gray-400">
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  )
}

/* ── Quick action suggestions ── */
const QUICK_SUGGESTIONS = [
  { label: '📥 Show inbox', prompt: 'Show my inbox' },
  { label: '🔍 Search emails', prompt: 'Search emails from last 7 days' },
  { label: '✉️ Compose email', prompt: 'Open compose' },
  { label: '📬 Unread only', prompt: 'Show only unread emails' },
]

/* ── Main component ── */
export default function Assistant() {
  const {
    assistantOpen, assistantSessionId,
    currentView, currentEmail, activeFilters, composeData,
    dispatch, applyAIActions, addToast, openEmail,
  } = useMail()

  const [messages, setMessages]   = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hi! I'm your Nebula AI assistant. I can control your email app — compose, search, filter, reply, and more. What would you like to do?",
      timestamp: Date.now(),
    }
  ])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Build app context from current state to send with every message
  const buildAppContext = useCallback(() => ({
    current_view:          currentView,
    current_email_id:      currentEmail?.id      || null,
    current_email_subject: currentEmail?.subject  || null,
    current_email_sender:  currentEmail?.sender_email || null,
    active_filters:        activeFilters,
    compose_data:          composeData,
  }), [currentView, currentEmail, activeFilters, composeData])

  async function sendMessage(text) {
    const userText = (text || input).trim()
    if (!userText || loading) return

    setInput('')

    const userMsg = { id: Date.now(), role: 'user', content: userText, timestamp: Date.now() }
    setMessages((m) => [...m, userMsg])
    setLoading(true)

    try {
      const { data } = await assistantAPI.chat({
        message: userText,
        session_id: sessionId,
        app_context: buildAppContext(),
      })

      // Store session ID for conversation continuity
      if (data.session_id && !sessionId) {
        setSessionId(data.session_id)
        dispatch({ type: 'SET_ASSISTANT_SESSION', sessionId: data.session_id })
      }

      const assistantMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.response || "I've completed the action.",
        timestamp: Date.now(),
        tool_calls: data.tool_calls || [],
        search_results: data.search_results || [],
      }
      setMessages((m) => [...m, assistantMsg])

      // Apply AI actions to update the UI
      if (data.actions?.length) {
        await applyAIActions(data.actions, {
          compose_data:   data.compose_data,
          search_results: data.search_results,
          open_email_id:  data.open_email_id,
        })
      }

    } catch (err) {
      const errMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: err.response?.status === 401
          ? 'Please sign in to use the AI assistant.'
          : 'Something went wrong. Please try again.',
        timestamp: Date.now(),
        isError: true,
      }
      setMessages((m) => [...m, errMsg])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  async function clearHistory() {
    try {
      await assistantAPI.clearHistory(sessionId)
      setMessages([{
        id: 'welcome-new',
        role: 'assistant',
        content: 'Conversation cleared. How can I help you?',
        timestamp: Date.now(),
      }])
      setSessionId(null)
    } catch {}
  }

  if (!assistantOpen) return null

  return (
    <aside className="flex flex-col w-80 h-full bg-white border-l border-gray-100 shrink-0">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100
                      bg-gradient-to-r from-nebula-600 to-purple-600 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
            <Sparkles size={15} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">AI Assistant</p>
            <p className="text-[10px] text-white/70">Powered by Groq · Llama</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={clearHistory} title="Clear history"
            className="p-1.5 rounded-lg hover:bg-white/20 transition-colors text-white/80 hover:text-white">
            <Trash2 size={14} />
          </button>
          <button onClick={() => dispatch({ type: 'TOGGLE_ASSISTANT' })}
            className="p-1.5 rounded-lg hover:bg-white/20 transition-colors text-white/80 hover:text-white">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Context indicator – shows open email and quick reply shortcut */}
      {currentEmail ? (
        <div className="px-3 py-2.5 bg-nebula-50 border-b border-nebula-200 shrink-0">
          <p className="text-[10px] text-nebula-500 font-medium uppercase tracking-wide mb-1">
            Reading email
          </p>
          <p className="text-xs font-semibold text-nebula-800 truncate leading-tight">
            {currentEmail.subject}
          </p>
          <p className="text-[11px] text-nebula-600 truncate">
            from {currentEmail.sender_name || currentEmail.sender_email}
          </p>
          <div className="flex gap-1.5 mt-2">
            <button
              onClick={() => sendMessage('Reply to this email')}
              className="flex-1 text-[11px] font-semibold bg-nebula-600 text-white
                         rounded-lg py-1 hover:bg-nebula-700 transition-colors"
            >
              ↩ Reply
            </button>
            <button
              onClick={() => sendMessage('Summarise this email')}
              className="flex-1 text-[11px] font-semibold bg-white text-nebula-700
                         border border-nebula-300 rounded-lg py-1 hover:bg-nebula-50 transition-colors"
            >
              📋 Summarise
            </button>
          </div>
        </div>
      ) : (
        <div className="px-3 py-2 bg-nebula-50 border-b border-nebula-100 shrink-0">
          <p className="text-[10px] text-nebula-600 font-medium flex items-center gap-1">
            <Info size={10} />
            View: <span className="font-bold capitalize ml-1">{currentView}</span>
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {messages.map((msg) => <Message key={msg.id} msg={msg} onOpenEmail={openEmail} />)}
        {loading && (
          <div className="flex gap-2.5 animate-fade-in">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-nebula-600 flex items-center justify-center shrink-0">
              <Sparkles size={13} className="text-white" />
            </div>
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2">
              <TypingIndicator />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick suggestions (shown only when no conversation yet) */}
      {messages.length <= 1 && (
        <div className="px-3 pb-3 grid grid-cols-2 gap-1.5">
          {QUICK_SUGGESTIONS.map((s) => (
            <button key={s.label} onClick={() => sendMessage(s.prompt)}
              className="text-left text-xs px-2.5 py-2 rounded-xl border border-gray-200
                         hover:border-nebula-400 hover:bg-nebula-50 transition-colors text-gray-600
                         hover:text-nebula-700 font-medium leading-tight">
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-gray-100 shrink-0">
        <div className="flex items-end gap-2 bg-gray-50 rounded-2xl border border-gray-200
                        focus-within:border-nebula-400 focus-within:ring-2 focus-within:ring-nebula-100
                        px-3 py-2 transition-all">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            placeholder="Ask me anything about your mail…"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-gray-900 outline-none
                       placeholder-gray-400 leading-relaxed max-h-28 overflow-y-auto"
            style={{ minHeight: '20px' }}
            onInput={(e) => {
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 112) + 'px'
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="shrink-0 w-8 h-8 rounded-xl bg-nebula-600 hover:bg-nebula-700
                       flex items-center justify-center transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading
              ? <Loader2 size={14} className="text-white animate-spin" />
              : <Send size={14} className="text-white" />}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5 text-center">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </aside>
  )
}
