/**
 * Compose email panel.
 * Controlled by both manual user input AND AI assistant (via MailContext).
 * When AI calls fill_email_form(), composeData in context updates and this
 * component reflects changes in real time.
 */
import React, { useState, useEffect } from 'react'
import { X, Send, ChevronDown, Loader2, Minimize2, Maximize2 } from 'lucide-react'
import { useMail } from '../context/MailContext'

export default function ComposeEmail() {
  const { composeData, composeMode, dispatch, sendEmail, sendingEmail, addToast } = useMail()

  // Local form state mirrors composeData from context
  const [form, setForm] = useState({ to: '', cc: '', bcc: '', subject: '', body: '' })
  const [showCcBcc, setShowCcBcc] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [errors, setErrors] = useState({})

  // Sync whenever AI fills form or mode changes
  useEffect(() => {
    setForm({
      to:      composeData.to      || '',
      cc:      composeData.cc      || '',
      bcc:     composeData.bcc     || '',
      subject: composeData.subject || '',
      body:    composeData.body    || '',
    })
    if (composeData.cc || composeData.bcc) setShowCcBcc(true)
  }, [composeData])

  function handleChange(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
    // Keep context in sync for AI awareness
    dispatch({ type: 'UPDATE_COMPOSE', data: { [field]: value } })
    if (errors[field]) setErrors((e) => ({ ...e, [field]: '' }))
  }

  function validate() {
    const e = {}
    if (!form.to.trim()) e.to = 'Recipient is required'
    else if (!/[\w.+-]+@[\w-]+\.[\w.]+/.test(form.to.trim())) e.to = 'Invalid email address'
    if (!form.subject.trim()) e.subject = 'Subject is required'
    if (!form.body.trim()) e.body = 'Body cannot be empty'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSend() {
    if (!validate()) return
    await sendEmail({
      to: form.to,
      cc: form.cc || undefined,
      bcc: form.bcc || undefined,
      subject: form.subject,
      body: form.body,
    })
  }

  function handleClose() {
    dispatch({ type: 'CLOSE_COMPOSE' })
  }

  const modeLabel = composeMode === 'reply' ? 'Reply' : composeMode === 'forward' ? 'Forward' : 'New Message'

  return (
    <div className={`flex flex-col bg-white rounded-t-2xl shadow-panel border border-gray-200
                     transition-all duration-200
                     ${minimized ? 'h-12' : 'h-full'}`}>

      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 rounded-t-2xl shrink-0">
        <span className="text-sm font-semibold text-white">{modeLabel}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setMinimized((m) => !m)}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
            {minimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
          <button onClick={handleClose}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Form fields */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* To */}
            <div className={`flex items-center border-b px-4 py-2.5
                             ${errors.to ? 'border-red-300 bg-red-50' : 'border-gray-100'}`}>
              <label className="text-xs font-semibold text-gray-500 w-10 shrink-0">To</label>
              <input
                value={form.to}
                onChange={(e) => handleChange('to', e.target.value)}
                placeholder="recipient@example.com"
                className="flex-1 text-sm text-gray-900 outline-none bg-transparent placeholder-gray-400"
              />
              <button onClick={() => setShowCcBcc((s) => !s)}
                className="text-xs text-gray-400 hover:text-gray-600 ml-2">
                Cc/Bcc
              </button>
            </div>
            {errors.to && <p className="text-xs text-red-600 px-14 pb-1">{errors.to}</p>}

            {/* CC / BCC */}
            {showCcBcc && (
              <>
                <div className="flex items-center border-b border-gray-100 px-4 py-2.5">
                  <label className="text-xs font-semibold text-gray-500 w-10 shrink-0">Cc</label>
                  <input
                    value={form.cc}
                    onChange={(e) => handleChange('cc', e.target.value)}
                    placeholder="cc@example.com"
                    className="flex-1 text-sm text-gray-900 outline-none bg-transparent placeholder-gray-400"
                  />
                </div>
                <div className="flex items-center border-b border-gray-100 px-4 py-2.5">
                  <label className="text-xs font-semibold text-gray-500 w-10 shrink-0">Bcc</label>
                  <input
                    value={form.bcc}
                    onChange={(e) => handleChange('bcc', e.target.value)}
                    placeholder="bcc@example.com"
                    className="flex-1 text-sm text-gray-900 outline-none bg-transparent placeholder-gray-400"
                  />
                </div>
              </>
            )}

            {/* Subject */}
            <div className={`flex items-center border-b px-4 py-2.5
                             ${errors.subject ? 'border-red-300 bg-red-50' : 'border-gray-100'}`}>
              <label className="text-xs font-semibold text-gray-500 w-10 shrink-0">Sub</label>
              <input
                value={form.subject}
                onChange={(e) => handleChange('subject', e.target.value)}
                placeholder="Subject"
                className="flex-1 text-sm text-gray-900 outline-none bg-transparent placeholder-gray-400"
              />
            </div>
            {errors.subject && <p className="text-xs text-red-600 px-14 pb-1">{errors.subject}</p>}

            {/* Body */}
            <div className="flex-1 relative">
              <textarea
                value={form.body}
                onChange={(e) => handleChange('body', e.target.value)}
                placeholder="Write your message here..."
                className={`w-full h-full resize-none px-4 py-3 text-sm text-gray-900
                            outline-none placeholder-gray-400 leading-relaxed
                            ${errors.body ? 'bg-red-50' : 'bg-white'}`}
              />
              {/* AI fill indicator */}
              {composeData.body && composeData.body === form.body && composeData._aiGenerated && (
                <div className="absolute top-2 right-2 text-[10px] bg-nebula-100 text-nebula-700
                                px-2 py-0.5 rounded-full font-medium">
                  AI suggested
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 shrink-0 bg-gray-50">
            <button onClick={handleClose}
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
              Discard
            </button>
            <button
              onClick={handleSend}
              disabled={sendingEmail}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white
                         bg-nebula-600 hover:bg-nebula-700 rounded-xl transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {sendingEmail ? (
                <><Loader2 size={15} className="animate-spin" /> Sending…</>
              ) : (
                <><Send size={14} /> Send</>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
