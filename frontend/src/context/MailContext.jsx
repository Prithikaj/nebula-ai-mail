/**
 * MailContext – single source of truth for the entire application.
 *
 * Quota-efficient polling strategy (30-second interval):
 *   1. Poll /emails/poll-ids  → costs 1 unit total (no per-message charge)
 *   2. Diff returned IDs against knownIdsRef (a Set of IDs already in the list)
 *   3. Only call /emails/fetch-new for genuinely new IDs → 1 unit/message
 *   4. Prepend new emails to the list and show a toast
 *   5. Guard with pollInFlightRef so requests never overlap
 *
 * Duplicate-load prevention:
 *   checkAuth() loads the inbox once and sets inboxLoadedRef = true.
 *   Inbox.jsx skips its own useEffect load when inboxLoadedRef is already true.
 *   inboxLoadedRef is exposed on the context value.
 */

import {
  createContext, useContext, useReducer, useCallback, useEffect, useRef,
} from 'react'
import { emailsAPI, authAPI } from '../services/api'

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Initial state                                                               */
/* ─────────────────────────────────────────────────────────────────────────── */
const initialState = {
  user: null,
  authChecked: false,

  currentView: 'inbox',   // inbox | sent | compose | email_detail | search | settings

  emailList: [],
  emailListTitle: 'Inbox',
  nextPageToken: null,
  loadingEmails: false,
  emailListError: null,

  currentEmail: null,
  loadingEmail: false,

  composeData: { to: '', cc: '', bcc: '', subject: '', body: '' },
  composeMode: null,       // null | 'new' | 'reply' | 'forward'
  sendingEmail: false,

  activeFilters: {},

  assistantOpen: true,
  assistantSessionId: null,

  toasts: [],
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Reducer                                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */
function reducer(state, action) {
  switch (action.type) {

    case 'SET_USER':
      return { ...state, user: action.payload, authChecked: true }
    case 'AUTH_CHECKED':
      return { ...state, authChecked: true }
    case 'LOGOUT':
      return { ...initialState, authChecked: true }

    case 'NAVIGATE':
      return {
        ...state,
        currentView: action.view,
        ...(action.view !== 'compose' && action.view !== 'email_detail'
          ? { currentEmail: null } : {}),
      }

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
      // Skip if ID already in list (guards against races)
      if (state.emailList.some((e) => e.id === action.email.id)) return state
      return { ...state, emailList: [action.email, ...state.emailList] }
    case 'UPDATE_EMAIL_IN_LIST':
      return {
        ...state,
        emailList: state.emailList.map((e) =>
          e.id === action.emailId ? { ...e, ...action.updates } : e),
        currentEmail:
          state.currentEmail?.id === action.emailId
            ? { ...state.currentEmail, ...action.updates }
            : state.currentEmail,
      }
    case 'LOADING_EMAILS':
      return { ...state, loadingEmails: true, emailListError: null }
    case 'EMAIL_LIST_ERROR':
      return { ...state, loadingEmails: false, emailListError: action.error }

    case 'SET_CURRENT_EMAIL':
      return { ...state, currentEmail: action.email, currentView: 'email_detail', loadingEmail: false }
    case 'LOADING_EMAIL':
      return { ...state, loadingEmail: true }
    case 'CLEAR_CURRENT_EMAIL':
      return { ...state, currentEmail: null }

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

    case 'SET_FILTERS':
      return { ...state, activeFilters: action.filters }
    case 'CLEAR_FILTERS':
      return { ...state, activeFilters: {} }

    case 'TOGGLE_ASSISTANT':
      return { ...state, assistantOpen: !state.assistantOpen }
    case 'SET_ASSISTANT_SESSION':
      return { ...state, assistantSessionId: action.sessionId }

    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, action.toast] }
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) }

    default:
      return state
  }
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Context                                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */
const MailContext = createContext(null)

export function MailProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Refs that survive re-renders without triggering them
  const wsRef            = useRef(null)
  const toastTimers      = useRef({})
  const knownIdsRef      = useRef(new Set())   // IDs currently in the email list
  const inboxLoadedRef   = useRef(false)        // prevents double load on mount
  const pollInFlightRef  = useRef(false)        // prevents overlapping poll requests

  /* ── Keep knownIdsRef in sync with the email list ── */
  useEffect(() => {
    knownIdsRef.current = new Set(state.emailList.map((e) => e.id))
  }, [state.emailList])

  /* ── Auth check on mount ── */
  useEffect(() => { checkAuth() }, [])

  /* ── WebSocket + polling when user authenticates ── */
  useEffect(() => {
    if (state.user) connectWebSocket(state.user.id)
    return () => { if (wsRef.current) wsRef.current.close() }
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

  /* ── Strip OAuth query params from URL bar on mount ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth') === 'success' || params.get('error')) {
      window.history.replaceState({}, '', '/')
    }
  }, [])

  /* ─────────────────────────────────────────────────────────────────────── */
  /*  Auth                                                                    */
  /* ─────────────────────────────────────────────────────────────────────── */
  const checkAuth = useCallback(async () => {
    try {
      const { data } = await authAPI.status()
      if (data.authenticated) {
        dispatch({ type: 'SET_USER', payload: data.user })
        // Load inbox here — Inbox component checks inboxLoadedRef and skips
        // its own effect-based load to avoid a duplicate API call.
        inboxLoadedRef.current = false
        try {
          dispatch({ type: 'LOADING_EMAILS' })
          const { data: inboxData } = await emailsAPI.inbox({ max_results: 20 })
          dispatch({
            type: 'SET_EMAIL_LIST',
            emails: inboxData.emails,
            title: 'Inbox',
            nextPageToken: inboxData.next_page_token,
          })
          // Seed knownIds so the first poll doesn't re-notify for existing mail
          knownIdsRef.current = new Set(inboxData.emails.map((e) => e.id))
          inboxLoadedRef.current = true
        } catch {
          inboxLoadedRef.current = false
          // Inbox load failed — user is still authenticated, they can retry
        }
      } else {
        dispatch({ type: 'AUTH_CHECKED' })
      }
    } catch {
      dispatch({ type: 'AUTH_CHECKED' })
    }
  }, [])

  const logout = useCallback(async () => {
    try { await authAPI.logout() } finally {
      inboxLoadedRef.current = false
      knownIdsRef.current = new Set()
      dispatch({ type: 'LOGOUT' })
    }
  }, [])

  /* ─────────────────────────────────────────────────────────────────────── */
  /*  WebSocket  +  30-second quota-efficient polling                         */
  /* ─────────────────────────────────────────────────────────────────────── */
  const connectWebSocket = useCallback((userId) => {
    if (wsRef.current) wsRef.current.close()

    const base  = import.meta.env.VITE_API_URL || 'http://localhost:8000'
    const wsUrl = `${base.replace(/^http/, 'ws')}/ws/mail?user_id=${userId}`
    const ws    = new WebSocket(wsUrl)
    wsRef.current = ws

    /* ── WebSocket messages (from Gmail push → Pub/Sub → backend) ── */
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'new_email') {
          dispatch({ type: 'PREPEND_EMAIL', email: msg.email })
          dispatch({ type: 'ADD_TOAST', toast: {
            id: `ws-${Date.now()}`,
            message: `New email from ${msg.email.sender_name || 'someone'}`,
            type: 'info', duration: 4000,
          }})
        } else if (msg.type === 'email_updated') {
          dispatch({ type: 'UPDATE_EMAIL_IN_LIST', emailId: msg.email_id, updates: msg.updates })
        } else if (msg.type === 'inbox_refresh') {
          // Full refresh requested by server
          emailsAPI.inbox({ max_results: 20 }).then(({ data }) => {
            dispatch({ type: 'SET_EMAIL_LIST', emails: data.emails, title: 'Inbox', nextPageToken: data.next_page_token })
          }).catch(() => {})
        }
      } catch {}
    }

    ws.onclose = () => { setTimeout(() => connectWebSocket(userId), 5000) }
    ws.onerror = () => { ws.close() }

    /* ── Keep-alive ping ── */
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('ping')
    }, 30000)

    /* ── 30-second quota-efficient background poll ──────────────────────
     *
     * Strategy (minimises Gmail API quota cost):
     *
     *  Step 1 — GET /emails/poll-ids
     *           Calls Gmail messages.list()  → costs 1 unit TOTAL (no body)
     *           Returns up to 20 message IDs from the inbox.
     *
     *  Step 2 — Diff against knownIdsRef
     *           IDs already in the email list are skipped entirely.
     *
     *  Step 3 — POST /emails/fetch-new  (only if new IDs found)
     *           Calls Gmail messages.get(format='metadata') per new ID
     *           → costs 1 unit/message, capped at 10 per poll cycle.
     *           Returns headers + snippet (enough for the inbox row).
     *
     *  Step 4 — Prepend new emails to the list, show a toast.
     *
     *  pollInFlightRef prevents overlapping requests if a cycle takes >30 s.
     * ──────────────────────────────────────────────────────────────────── */
    const pollInterval = setInterval(async () => {
      // Skip if previous poll hasn't finished yet
      if (pollInFlightRef.current) return
      pollInFlightRef.current = true

      try {
        /* Step 1: fetch IDs only — 1 quota unit total */
        const { data: pollData } = await emailsAPI.pollIds()
        const latestIds = pollData.ids || []

        /* Step 2: diff against what we already have */
        const newIds = latestIds.filter((id) => !knownIdsRef.current.has(id))

        if (newIds.length === 0) return  // nothing new — done

        /* Step 3: fetch metadata only for new IDs (capped at 10) */
        const { data: fetchData } = await emailsAPI.fetchNew(newIds.slice(0, 10))
        const newEmails = fetchData.emails || []

        if (newEmails.length === 0) return

        /* Step 4: update UI */
        newEmails.forEach((email) => {
          dispatch({ type: 'PREPEND_EMAIL', email })
        })

        dispatch({ type: 'ADD_TOAST', toast: {
          id: `poll-${Date.now()}`,
          message: `${newEmails.length} new email${newEmails.length > 1 ? 's' : ''} arrived`,
          type: 'info', duration: 4000,
        }})

      } catch {
        // Network error or quota error — silently skip this cycle
      } finally {
        pollInFlightRef.current = false
      }
    }, 30000)  // 30-second interval

    /* Cleanup both intervals when the WebSocket closes */
    ws.addEventListener('close', () => {
      clearInterval(pingInterval)
      clearInterval(pollInterval)
      pollInFlightRef.current = false
    })
  }, [])

  /* ─────────────────────────────────────────────────────────────────────── */
  /*  Email loading                                                            */
  /* ─────────────────────────────────────────────────────────────────────── */
  const loadInbox = useCallback(async (pageToken = null) => {
    dispatch({ type: 'LOADING_EMAILS' })
    try {
      const { data } = await emailsAPI.inbox({ max_results: 20, page_token: pageToken })
      if (pageToken) {
        dispatch({ type: 'APPEND_EMAIL_LIST', emails: data.emails, nextPageToken: data.next_page_token })
      } else {
        dispatch({ type: 'SET_EMAIL_LIST', emails: data.emails, title: 'Inbox', nextPageToken: data.next_page_token })
        knownIdsRef.current = new Set(data.emails.map((e) => e.id))
        inboxLoadedRef.current = true
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

  /* Full body fetched only when the user opens an email (format='full', 5 units) */
  const openEmail = useCallback(async (emailId) => {
    dispatch({ type: 'LOADING_EMAIL' })
    try {
      const { data } = await emailsAPI.get(emailId)
      dispatch({ type: 'SET_CURRENT_EMAIL', email: data })
      emailsAPI.markRead(emailId).catch(() => {})
      dispatch({ type: 'UPDATE_EMAIL_IN_LIST', emailId, updates: { is_unread: false } })
    } catch {
      dispatch({ type: 'ADD_TOAST', toast: {
        id: `err-${Date.now()}`, message: 'Could not open email', type: 'error', duration: 4000,
      }})
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
    } catch {
      dispatch({ type: 'EMAIL_LIST_ERROR', error: 'Search failed' })
    }
  }, [])

  /* ─────────────────────────────────────────────────────────────────────── */
  /*  AI Action Dispatcher                                                    */
  /*  Called after every assistant response — applies actions to React state  */
  /* ─────────────────────────────────────────────────────────────────────── */
  const applyAIActions = useCallback(async (actions = [], extraData = {}) => {
    for (const action of actions) {
      switch (action.type) {

        case 'navigate':
          if (action.view === 'compose') {
            dispatch({ type: 'OPEN_COMPOSE', data: extraData.compose_data, mode: 'new' })
          } else {
            dispatch({ type: 'NAVIGATE', view: action.view })
            if (action.view === 'inbox') loadInbox()
            if (action.view === 'sent')  loadSent()
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
          dispatch({
            type: 'OPEN_COMPOSE',
            data: action.compose_data || {},
            mode: action.compose_data?.is_forward ? 'forward' : 'new',
          })
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
          // Assistant text already asks — no extra UI action needed
          break

        default:
          break
      }
    }
  }, [loadInbox, loadSent, openEmail, state.currentView])

  /* ─────────────────────────────────────────────────────────────────────── */
  /*  Helpers                                                                 */
  /* ─────────────────────────────────────────────────────────────────────── */
  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    dispatch({ type: 'ADD_TOAST', toast: {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      message, type, duration,
    }})
  }, [])

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

  /* ─────────────────────────────────────────────────────────────────────── */
  /*  Context value                                                           */
  /* ─────────────────────────────────────────────────────────────────────── */
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
    // Exposed so Inbox.jsx can skip its own load when checkAuth already loaded
    inboxLoadedRef,
  }

  return <MailContext.Provider value={value}>{children}</MailContext.Provider>
}

export const useMail = () => {
  const ctx = useContext(MailContext)
  if (!ctx) throw new Error('useMail must be used inside MailProvider')
  return ctx
}
