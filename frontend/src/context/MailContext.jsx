/**
 * MailContext – single source of truth for the entire application.
 *
 * The AI assistant dispatches "actions" (navigate, fill_compose, open_email, etc.)
 * that this context applies directly, making the UI update visibly.
 *
 * Shared state:
 *   currentView        – which main panel is shown
 *   emailList          – emails currently shown in the list
 *   currentEmail       – email open in detail view
 *   composeData        – form fields for compose/reply/forward
 *   activeFilters      – filters currently applied
 *   user               – authenticated user info
 *   loading / error    – loading/error states per section
 *   toasts             – notification toasts
 */

import React, {
  createContext, useContext, useReducer, useCallback, useEffect, useRef,
} from 'react'
import { emailsAPI, authAPI } from '../services/api'

/* ─────────────────────── Initial State ─────────────────────────────────── */
const initialState = {
  /* Auth */
  user: null,
  authChecked: false,

  /* Navigation */
  currentView: 'inbox',          // inbox | sent | compose | email_detail | search | settings

  /* Email list */
  emailList: [],
  emailListTitle: 'Inbox',
  nextPageToken: null,
  loadingEmails: false,
  emailListError: null,

  /* Email detail */
  currentEmail: null,
  loadingEmail: false,

  /* Compose */
  composeData: { to: '', cc: '', bcc: '', subject: '', body: '' },
  composeMode: null,             // null | 'new' | 'reply' | 'forward'
  sendingEmail: false,

  /* Filters */
  activeFilters: {},

  /* Assistant */
  assistantOpen: true,
  assistantSessionId: null,

  /* Toasts */
  toasts: [],
}

/* ─────────────────────── Reducer ───────────────────────────────────────── */
function reducer(state, action) {
  switch (action.type) {

    /* ── Auth ── */
    case 'SET_USER':
      return { ...state, user: action.payload, authChecked: true }
    case 'AUTH_CHECKED':
      return { ...state, authChecked: true }
    case 'LOGOUT':
      return { ...initialState, authChecked: true }

    /* ── Navigation ── */
    case 'NAVIGATE':
      return {
        ...state,
        currentView: action.view,
        // Clear compose when leaving compose
        ...(action.view !== 'compose' && action.view !== 'email_detail'
          ? { currentEmail: null }
          : {}),
      }

    /* ── Email list ── */
    case 'SET_EMAIL_LIST':
      return {
        ...state,
        emailList: action.emails,
        emailListTitle: action.title || state.emailListTitle,
        nextPageToken: action.nextPageToken || null,
        loadingEmails: false,
        emailListError: null,
        activeFilters: action.filters || {},
      }
    case 'APPEND_EMAIL_LIST':
      return {
        ...state,
        emailList: [...state.emailList, ...action.emails],
        nextPageToken: action.nextPageToken || null,
        loadingEmails: false,
      }
    case 'PREPEND_EMAIL':
      return {
        ...state,
        emailList: [action.email, ...state.emailList],
      }
    case 'UPDATE_EMAIL_IN_LIST':
      return {
        ...state,
        emailList: state.emailList.map((e) =>
          e.id === action.emailId ? { ...e, ...action.updates } : e
        ),
        currentEmail:
          state.currentEmail?.id === action.emailId
            ? { ...state.currentEmail, ...action.updates }
            : state.currentEmail,
      }
    case 'LOADING_EMAILS':
      return { ...state, loadingEmails: true, emailListError: null }
    case 'EMAIL_LIST_ERROR':
      return { ...state, loadingEmails: false, emailListError: action.error }

    /* ── Email detail ── */
    case 'SET_CURRENT_EMAIL':
      return { ...state, currentEmail: action.email, currentView: 'email_detail', loadingEmail: false }
    case 'LOADING_EMAIL':
      return { ...state, loadingEmail: true }
    case 'CLEAR_CURRENT_EMAIL':
      return { ...state, currentEmail: null }

    /* ── Compose ── */
    case 'OPEN_COMPOSE':
      return {
        ...state,
        currentView: 'compose',
        composeData: action.data || { to: '', cc: '', bcc: '', subject: '', body: '' },
        composeMode: action.mode || 'new',
      }
    case 'UPDATE_COMPOSE':
      return { ...state, composeData: { ...state.composeData, ...action.data } }
    case 'CLOSE_COMPOSE':
      return {
        ...state,
        currentView: state.currentEmail ? 'email_detail' : 'inbox',
        composeData: { to: '', cc: '', bcc: '', subject: '', body: '' },
        composeMode: null,
      }
    case 'SENDING_EMAIL':
      return { ...state, sendingEmail: action.value }

    /* ── Filters ── */
    case 'SET_FILTERS':
      return { ...state, activeFilters: action.filters }
    case 'CLEAR_FILTERS':
      return { ...state, activeFilters: {} }

    /* ── Assistant ── */
    case 'TOGGLE_ASSISTANT':
      return { ...state, assistantOpen: !state.assistantOpen }
    case 'SET_ASSISTANT_SESSION':
      return { ...state, assistantSessionId: action.sessionId }

    /* ── Toasts ── */
    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, action.toast] }
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) }

    default:
      return state
  }
}

/* ─────────────────────── Context ───────────────────────────────────────── */
const MailContext = createContext(null)

export function MailProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const wsRef = useRef(null)
  const toastTimers = useRef({})

  /* ── Auth check on mount ── */
  useEffect(() => {
    checkAuth()
  }, [])

  /* ── WebSocket setup when user is authenticated ── */
  useEffect(() => {
    if (state.user) {
      connectWebSocket(state.user.id)
    }
    return () => {
      if (wsRef.current) wsRef.current.close()
    }
  }, [state.user?.id])

  /* ── Toast auto-dismiss ── */
  useEffect(() => {
    state.toasts.forEach((toast) => {
      if (!toastTimers.current[toast.id]) {
        toastTimers.current[toast.id] = setTimeout(() => {
          dispatch({ type: 'REMOVE_TOAST', id: toast.id })
          delete toastTimers.current[toast.id]
        }, toast.duration || 4000)
      }
    })
  }, [state.toasts])

  /* ─────────── Auth helpers ─────────────────────── */
  const checkAuth = useCallback(async () => {
    try {
      const { data } = await authAPI.status()
      if (data.authenticated) {
        dispatch({ type: 'SET_USER', payload: data.user })
        // Load inbox immediately after confirming authentication
        // Use a local fetch here rather than calling loadInbox() to avoid
        // the closure-stale-reference problem with useCallback dependencies.
        try {
          const inbox = await emailsAPI.inbox({ max_results: 20 })
          dispatch({
            type: 'SET_EMAIL_LIST',
            emails: inbox.data.emails,
            title: 'Inbox',
            nextPageToken: inbox.data.next_page_token,
          })
        } catch {
          // Inbox failure is non-fatal – user is still logged in
        }
      } else {
        dispatch({ type: 'AUTH_CHECKED' })
      }
    } catch {
      dispatch({ type: 'AUTH_CHECKED' })
    }
  }, [])

  /* ── Detect OAuth redirect and re-check auth ──
     After Google OAuth the backend redirects to /?auth=success.
     The page reloads, React mounts fresh, and checkAuth() runs above.
     We additionally strip the query param from the URL so a manual
     refresh doesn't re-trigger any stale logic.                        */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth') === 'success') {
      // Clean up the URL bar without a reload
      window.history.replaceState({}, '', '/')
    }
    if (params.get('error')) {
      window.history.replaceState({}, '', '/')
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await authAPI.logout()
    } finally {
      dispatch({ type: 'LOGOUT' })
    }
  }, [])

  /* ── WebSocket + polling fallback ───────────────── */
  const connectWebSocket = useCallback((userId) => {
    if (wsRef.current) wsRef.current.close()
    const base = import.meta.env.VITE_API_URL || 'http://localhost:8000'
    const wsUrl = `${base.replace(/^http/, 'ws')}/ws/mail?user_id=${userId}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'new_email') {
          dispatch({ type: 'PREPEND_EMAIL', email: msg.email })
          dispatch({
            type: 'ADD_TOAST',
            toast: {
              id: Date.now().toString(36),
              message: `New email from ${msg.email.sender_name || 'someone'}`,
              type: 'info',
              duration: 4000,
            },
          })
        } else if (msg.type === 'email_updated') {
          dispatch({ type: 'UPDATE_EMAIL_IN_LIST', emailId: msg.email_id, updates: msg.updates })
        } else if (msg.type === 'inbox_refresh') {
          // Trigger a silent inbox reload
          emailsAPI.inbox({ max_results: 20 }).then(({ data }) => {
            dispatch({ type: 'SET_EMAIL_LIST', emails: data.emails, title: 'Inbox', nextPageToken: data.next_page_token })
          }).catch(() => {})
        }
      } catch {}
    }

    ws.onclose = () => {
      setTimeout(() => connectWebSocket(userId), 5000)
    }

    ws.onerror = () => { ws.close() }

    // Keep-alive ping every 30 s
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('ping')
    }, 30000)

    // Polling fallback every 30 s — works even without Pub/Sub configured
    let lastKnownTopId = null
    const pollInterval = setInterval(async () => {
      try {
        const { data } = await emailsAPI.inbox({ max_results: 5 })
        const topId = data.emails?.[0]?.id
        if (topId && topId !== lastKnownTopId) {
          if (lastKnownTopId !== null) {
            const newEmails = data.emails.filter((e) => e.id > lastKnownTopId)
            newEmails.forEach((e) => dispatch({ type: 'PREPEND_EMAIL', email: e }))
            if (newEmails.length > 0) {
              dispatch({
                type: 'ADD_TOAST',
                toast: {
                  id: Date.now().toString(36),
                  message: `${newEmails.length} new email${newEmails.length > 1 ? 's' : ''} arrived`,
                  type: 'info',
                  duration: 4000,
                },
              })
            }
          }
          lastKnownTopId = topId
        }
      } catch {}
    }, 30000)

    ws.addEventListener('close', () => {
      clearInterval(pingInterval)
      clearInterval(pollInterval)
    })
  }, [])

  /* ─────────── Email loading ─────────────────────── */
  const loadInbox = useCallback(async (pageToken = null) => {
    dispatch({ type: 'LOADING_EMAILS' })
    try {
      const { data } = await emailsAPI.inbox({ max_results: 20, page_token: pageToken })
      if (pageToken) {
        dispatch({ type: 'APPEND_EMAIL_LIST', emails: data.emails, nextPageToken: data.next_page_token })
      } else {
        dispatch({ type: 'SET_EMAIL_LIST', emails: data.emails, title: 'Inbox', nextPageToken: data.next_page_token })
      }
    } catch (e) {
      dispatch({ type: 'EMAIL_LIST_ERROR', error: e.response?.data?.detail || 'Failed to load inbox' })
    }
  }, [])

  const loadSent = useCallback(async (pageToken = null) => {
    dispatch({ type: 'LOADING_EMAILS' })
    try {
      const { data } = await emailsAPI.sent({ max_results: 20, page_token: pageToken })
      if (pageToken) {
        dispatch({ type: 'APPEND_EMAIL_LIST', emails: data.emails, nextPageToken: data.next_page_token })
      } else {
        dispatch({ type: 'SET_EMAIL_LIST', emails: data.emails, title: 'Sent', nextPageToken: data.next_page_token })
      }
    } catch (e) {
      dispatch({ type: 'EMAIL_LIST_ERROR', error: e.response?.data?.detail || 'Failed to load sent' })
    }
  }, [])

  const openEmail = useCallback(async (emailId) => {
    dispatch({ type: 'LOADING_EMAIL' })
    try {
      const { data } = await emailsAPI.get(emailId)
      dispatch({ type: 'SET_CURRENT_EMAIL', email: data })
      // Mark as read
      emailsAPI.markRead(emailId).catch(() => {})
      dispatch({ type: 'UPDATE_EMAIL_IN_LIST', emailId, updates: { is_unread: false } })
    } catch (e) {
      addToast('Could not open email', 'error')
    }
  }, [])

  const searchEmails = useCallback(async (params) => {
    dispatch({ type: 'LOADING_EMAILS' })
    try {
      const { data } = await emailsAPI.search(params)
      dispatch({
        type: 'SET_EMAIL_LIST',
        emails: data.emails,
        title: `Search: "${params.q || params.keyword || params.sender || 'results'}"`,
        filters: params,
      })
      dispatch({ type: 'NAVIGATE', view: 'search' })
    } catch (e) {
      dispatch({ type: 'EMAIL_LIST_ERROR', error: 'Search failed' })
    }
  }, [])

  /* ─────────── AI Action Dispatcher ─────────────── */
  /**
   * applyAIActions – called after every assistant response.
   * Takes the "actions" array from the backend and mutates React state
   * so the UI updates visibly exactly as the AI intends.
   */
  const applyAIActions = useCallback(async (actions = [], extraData = {}) => {
    for (const action of actions) {
      switch (action.type) {

        case 'navigate':
          if (action.view === 'compose') {
            dispatch({ type: 'OPEN_COMPOSE', data: extraData.compose_data, mode: 'new' })
          } else {
            dispatch({ type: 'NAVIGATE', view: action.view })
            if (action.view === 'inbox') loadInbox()
            if (action.view === 'sent') loadSent()
          }
          break

        case 'fill_compose':
          dispatch({ type: 'UPDATE_COMPOSE', data: action.data })
          dispatch({ type: 'NAVIGATE', view: 'compose' })
          break

        case 'open_reply':
          dispatch({ type: 'OPEN_COMPOSE', data: action.compose_data, mode: 'reply' })
          break

        case 'open_compose':
          dispatch({ type: 'OPEN_COMPOSE', data: action.compose_data || {}, mode: action.compose_data?.is_forward ? 'forward' : 'new' })
          break

        case 'update_email_list':
          dispatch({
            type: 'SET_EMAIL_LIST',
            emails: action.emails || [],
            title: action.query ? `Search: "${action.query}"` : 'Filtered Results',
            filters: action.filters || {},
          })
          if (!['inbox', 'sent'].includes(state.currentView)) {
            dispatch({ type: 'NAVIGATE', view: 'search' })
          }
          break

        case 'open_email':
          if (action.email) {
            dispatch({ type: 'SET_CURRENT_EMAIL', email: action.email })
            emailsAPI.markRead(action.email_id).catch(() => {})
            dispatch({ type: 'UPDATE_EMAIL_IN_LIST', emailId: action.email_id, updates: { is_unread: false } })
          } else {
            await openEmail(action.email_id)
          }
          break

        case 'update_email_status':
          dispatch({ type: 'UPDATE_EMAIL_IN_LIST', emailId: action.email_id, updates: { is_unread: action.is_unread } })
          break

        case 'email_sent':
          dispatch({ type: 'CLOSE_COMPOSE' })
          addToast('Email sent successfully!', 'success')
          loadSent()
          break

        case 'request_confirmation':
          // The assistant text already asks for confirmation – no extra action needed
          break

        default:
          break
      }
    }
  }, [loadInbox, loadSent, openEmail, state.currentView])

  /* ─────────── Toast helper ─────────────────────── */
  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
    dispatch({ type: 'ADD_TOAST', toast: { id, message, type, duration } })
  }, [])

  /* ─────────── Send email ────────────────────────── */
  const sendEmail = useCallback(async (data) => {
    dispatch({ type: 'SENDING_EMAIL', value: true })
    try {
      await emailsAPI.send(data)
      dispatch({ type: 'CLOSE_COMPOSE' })
      addToast('Email sent!', 'success')
      loadSent()
    } catch (e) {
      addToast(e.response?.data?.detail || 'Failed to send email', 'error')
    } finally {
      dispatch({ type: 'SENDING_EMAIL', value: false })
    }
  }, [loadSent, addToast])

  /* ─────────── Context value ─────────────────────── */
  const value = {
    ...state,
    dispatch,
    checkAuth,
    logout,
    loadInbox,
    loadSent,
    openEmail,
    searchEmails,
    sendEmail,
    applyAIActions,
    addToast,
  }

  return <MailContext.Provider value={value}>{children}</MailContext.Provider>
}

export const useMail = () => {
  const ctx = useContext(MailContext)
  if (!ctx) throw new Error('useMail must be used inside MailProvider')
  return ctx
}
