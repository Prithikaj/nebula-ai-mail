/**
 * Toast notification system.
 * Toasts are stored in MailContext and auto-dismissed after their duration.
 */
import React from 'react'
import { CheckCircle, AlertCircle, Info, X, AlertTriangle } from 'lucide-react'
import { useMail } from '../context/MailContext'

const CONFIGS = {
  success: { icon: CheckCircle, bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-800', icon_color: 'text-green-500' },
  error:   { icon: AlertCircle, bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-800',   icon_color: 'text-red-500' },
  warning: { icon: AlertTriangle, bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', icon_color: 'text-amber-500' },
  info:    { icon: Info,         bg: 'bg-blue-50',  border: 'border-blue-200',  text: 'text-blue-800',  icon_color: 'text-blue-500' },
}

export default function ToastContainer() {
  const { toasts, dispatch } = useMail()

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const cfg = CONFIGS[toast.type] || CONFIGS.info
        const Icon = cfg.icon
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-panel
                        ${cfg.bg} ${cfg.border} toast-enter`}
          >
            <Icon size={16} className={`shrink-0 mt-0.5 ${cfg.icon_color}`} />
            <p className={`flex-1 text-sm font-medium ${cfg.text}`}>{toast.message}</p>
            <button
              onClick={() => dispatch({ type: 'REMOVE_TOAST', id: toast.id })}
              className={`shrink-0 ${cfg.icon_color} hover:opacity-70 transition-opacity`}
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
