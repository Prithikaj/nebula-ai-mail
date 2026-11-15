# 🌌 Nebula AI Mail

An AI-powered email web application that connects to your real Gmail account and lets an AI assistant **control the UI** through natural-language commands.

> **This is not a chatbot.** The AI assistant composes emails, fills forms visibly, searches your real inbox, applies filters, opens emails, and prepares replies — all by executing Gmail API calls and dispatching actions directly to React state.

---

## ✨ Features

| Feature | Description |
|---|---|
| **Google OAuth 2.0** | Connect your real Gmail account securely |
| **Real Inbox & Sent** | Fetch actual emails via Gmail API |
| **Email Detail** | Full HTML email rendering with sanitization |
| **Compose / Reply / Forward** | Send real emails via Gmail API |
| **AI Assistant** | Gemini 2.0 Flash with function calling |
| **AI Compose** | AI fills form fields visibly in real time |
| **AI Search** | AI queries your real Gmail and updates the UI |
| **AI Filters** | AI applies date/read/sender filters |
| **AI Navigation** | AI opens views and specific emails |
| **Context-aware Reply** | AI reads the open email and prepares replies |
| **Real-time Sync** | Gmail Push → Pub/Sub → WebSocket → React |
| **Confirmation Gate** | AI never sends without explicit user approval |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Vite)               │
│                                                              │
│  ┌──────────┐  ┌──────────────────┐  ┌────────────────────┐ │
│  │ Sidebar  │  │   Main Content   │  │   AI Assistant     │ │
│  │ (nav)    │  │ Inbox/Detail/    │  │   (Gemini chat)    │ │
│  │          │  │ Compose/Search   │  │                    │ │
│  └──────────┘  └──────────────────┘  └────────────────────┘ │
│                         ▲                      │             │
│                    MailContext                  │             │
│                   (shared state)         POST /assistant/chat│
│                         │                      ▼             │
└─────────────────────────┼──────────────────────┼─────────────┘
                          │                      │
                     REST + WS              REST API
                          │                      │
┌─────────────────────────┼──────────────────────┼─────────────┐
│                        BACKEND (FastAPI)         │             │
│                                                              │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │  Auth routes │  │  Email routes    │  │ Assistant     │  │
│  │  OAuth flow  │  │  inbox/sent/     │  │ routes        │  │
│  │              │  │  search/send     │  │               │  │
│  └──────────────┘  └──────────────────┘  └───────┬───────┘  │
│                                                   │          │
│  ┌────────────────────────────────────────────────▼───────┐  │
│  │              Gemini Service (google-genai)              │  │
│  │  User message → Function calling → Tool execution      │  │
│  │  → Structured action response → Frontend dispatches    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─────────────────────┐  ┌──────────────────────────────┐  │
│  │   Gmail Service     │  │   WebSocket Manager          │  │
│  │   (google API)      │  │   Real-time notifications    │  │
│  └─────────────────────┘  └──────────────────────────────┘  │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                  SQLite Database                         │  │
│  │        users | email_cache | assistant_messages          │  │
│  └─────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                          │
                          │ Gmail Push Notifications
                          ▼
                 Google Cloud Pub/Sub
                          │
                          ▼
                 POST /webhooks/gmail
                 → History API → WebSocket → React
```

---

## 📦 Tech Stack

**Frontend:** React 18, Vite, Tailwind CSS, React Router, Axios, Lucide React, date-fns, DOMPurify

**Backend:** Python, FastAPI, Uvicorn, SQLAlchemy, SQLite, Pydantic

**AI:** Google Gemini 2.0 Flash (`google-genai` SDK), function calling, structured outputs

**Email:** Gmail API, Google OAuth 2.0, `google-api-python-client`

**Real-time:** Google Cloud Pub/Sub, Gmail push notifications, WebSockets

---

## 📁 Project Structure

```
nebula-ai-mail/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Sidebar.jsx          # Left nav, compose button, account
│   │   │   ├── Inbox.jsx            # Email list (inbox/sent/search)
│   │   │   ├── EmailCard.jsx        # Single email row
│   │   │   ├── EmailDetail.jsx      # Full email view
│   │   │   ├── ComposeEmail.jsx     # Compose/reply/forward form
│   │   │   ├── EmailFilters.jsx     # Filter bar
│   │   │   ├── Assistant.jsx        # AI assistant panel
│   │   │   ├── Toast.jsx            # Notifications
│   │   │   └── Settings.jsx         # Settings page
│   │   ├── context/
│   │   │   └── MailContext.jsx      # Shared state + AI action dispatcher
│   │   ├── services/
│   │   │   └── api.js               # Axios API client
│   │   ├── pages/
│   │   │   └── Login.jsx            # Landing / sign-in page
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
│
├── backend/
│   ├── main.py                      # FastAPI app entry point
│   ├── config.py                    # Settings from .env
│   ├── requirements.txt
│   ├── routes/
│   │   ├── auth.py                  # OAuth login/callback/status/logout
│   │   ├── emails.py                # Inbox/sent/search/send/reply/forward
│   │   ├── assistant.py             # AI chat endpoint
│   │   └── notifications.py        # Pub/Sub webhook + WebSocket
│   ├── services/
│   │   ├── gmail_service.py         # All Gmail API calls
│   │   ├── gemini_service.py        # Gemini function calling + tool execution
│   │   └── notification_service.py # WebSocket manager + push processing
│   ├── agents/
│   │   └── mail_tools.py            # AI tool definitions (function schemas)
│   ├── database/
│   │   ├── database.py              # SQLAlchemy async setup
│   │   └── models.py                # User, EmailCache, AssistantMessage
│   └── .env.example
│
└── README.md
```

---

## 🔧 Setup Instructions

### 1. Prerequisites

- Python 3.11+
- Node.js 18+
- A Google Cloud project with Gmail API enabled
- A Gemini API key

### 2. Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or use existing)
3. Enable **Gmail API**: APIs & Services → Library → Gmail API → Enable
4. Configure **OAuth Consent Screen**: External, add your Gmail as test user
5. Add scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `openid`, `email`, `profile`
6. Create **OAuth 2.0 Client ID**: Web application
   - Authorized redirect URI: `http://localhost:8000/auth/google/callback`
7. Note your **Client ID** and **Client Secret**

### 3. Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Create an API key
3. Note the key

### 4. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate it
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
copy .env.example .env
# Edit .env with your credentials
```

**`.env` file:**
```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/google/callback
GOOGLE_CLOUD_PROJECT_ID=your_project_id
GEMINI_API_KEY=your_gemini_api_key
SECRET_KEY=any-long-random-string-here
FRONTEND_URL=http://localhost:5173
```

### 5. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
copy .env.example .env
# VITE_API_URL=http://localhost:8000 (default, no change needed)
```

---

## 🚀 Running Locally

**Terminal 1 – Backend:**
```bash
cd backend
venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

**Terminal 2 – Frontend:**
```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## 🔔 Pub/Sub Configuration (Real-time Notifications)

Gmail push notifications require Google Cloud Pub/Sub. Follow these steps:

### 1. Create a Pub/Sub topic
```bash
gcloud pubsub topics create gmail-notifications \
  --project=YOUR_PROJECT_ID
```

### 2. Grant Gmail permission to publish
```bash
gcloud pubsub topics add-iam-policy-binding gmail-notifications \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher" \
  --project=YOUR_PROJECT_ID
```

### 3. Create a push subscription pointing to your backend
```bash
gcloud pubsub subscriptions create gmail-sub \
  --topic=gmail-notifications \
  --push-endpoint=https://YOUR_BACKEND_URL/webhooks/gmail \
  --project=YOUR_PROJECT_ID
```

### 4. Update `.env`
```env
PUBSUB_TOPIC=projects/YOUR_PROJECT_ID/topics/gmail-notifications
PUBSUB_SUBSCRIPTION=projects/YOUR_PROJECT_ID/subscriptions/gmail-sub
```

### 5. Watch Gmail (call after user authenticates)
The backend can call `gmail_service.setup_gmail_watch()` to register the user's mailbox. Gmail watch tokens expire every 7 days and must be renewed.

**Local development note:** Pub/Sub push subscriptions require a public HTTPS URL. Use [ngrok](https://ngrok.com/) to expose your local backend:
```bash
ngrok http 8000
# Use the https URL as your push endpoint
```

---

## 🚢 Deployment

### Frontend → Vercel

1. Push to GitHub
2. Import repo in [Vercel](https://vercel.com/)
3. Set environment variable: `VITE_API_URL=https://your-backend.onrender.com`
4. Deploy

### Backend → Render

1. Create a new **Web Service** on [Render](https://render.com/)
2. Connect your GitHub repo
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add all environment variables from `.env`
6. Add production redirect URI in Google Cloud Console:
   `https://your-backend.onrender.com/auth/google/callback`

---

## 🤖 AI Assistant Examples

| Command | What happens |
|---|---|
| "Send an email to john@example.com about the meeting" | Opens compose, fills fields visibly, asks confirmation |
| "Show emails from the last 10 days" | Queries Gmail, updates inbox list |
| "Find emails from Sarah about project update" | Searches Gmail, shows results |
| "Open the latest email from David" | Fetches emails from David, opens the newest |
| "Reply to this" | Reads open email, opens reply with pre-filled fields |
| "Show only unread emails from this week" | Applies filters, updates email list |
| "Mark this as unread" | Updates Gmail label, updates UI |

---

## ⚠️ Known Limitations

- Gmail watch tokens expire every 7 days — production deployment should auto-renew them
- Pub/Sub push subscriptions require a public HTTPS URL (use ngrok locally)
- HTML email rendering strips some advanced CSS for security
- Attachments are listed but not downloadable in this version
- The Gemini API may occasionally produce unexpected function call formats

---

## 🔮 Future Improvements

- Email attachment download
- Label management
- Threaded conversation view
- Multiple account support
- Dark mode toggle
- Email templates
- Scheduled send
- AI email summarization
- Mobile responsive design
