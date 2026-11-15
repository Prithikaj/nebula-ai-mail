/**
 * Centralised Axios instance.
 * All calls go to the FastAPI backend at localhost:8000.
 * withCredentials=true sends the session cookie automatically.
 */
import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,          // send session cookie
  headers: { 'Content-Type': 'application/json' },
})

/* ── Response interceptor: redirect to login on 401 ── */
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Clear any stale state and redirect to home/login
      window.location.href = '/?error=session_expired'
    }
    return Promise.reject(err)
  }
)

/* ── Auth ── */
export const authAPI = {
  status:  ()      => api.get('/auth/status'),
  login:   ()      => { window.location.href = `${BASE_URL}/auth/google/login` },
  logout:  ()      => api.post('/auth/logout'),
}

/* ── Emails ── */
export const emailsAPI = {
  inbox:   (params) => api.get('/emails/inbox',  { params }),
  sent:    (params) => api.get('/emails/sent',   { params }),
  get:     (id)     => api.get(`/emails/${id}`),
  send:    (data)   => api.post('/emails/send', data),
  reply:   (id, data)    => api.post(`/emails/${id}/reply`, data),
  forward: (id, data)    => api.post(`/emails/${id}/forward`, data),
  search:  (params)      => api.get('/emails/search', { params }),
  markRead:   (id)       => api.patch(`/emails/${id}/read`),
  markUnread: (id)       => api.patch(`/emails/${id}/unread`),
  // Quota-efficient polling: IDs only (1 unit total), then fetch only new ones
  pollIds:    ()         => api.get('/emails/poll-ids'),
  fetchNew:   (ids)      => api.post('/emails/fetch-new', { ids }),
}

/* ── Assistant ── */
export const assistantAPI = {
  chat: (payload) => api.post('/assistant/chat', payload),
  clearHistory: (sessionId) =>
    api.delete('/assistant/history', { params: sessionId ? { session_id: sessionId } : {} }),
}

export default api
