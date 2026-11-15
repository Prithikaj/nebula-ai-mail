"""
Nebula AI Mail - FastAPI Backend
Main application entry point.
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from config import settings
from database.database import init_db
from routes.auth import router as auth_router
from routes.emails import router as emails_router
from routes.assistant import router as assistant_router
from routes.notifications import router as notifications_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Allow insecure OAuth redirect for local development
# Remove this in production (use HTTPS)
if settings.environment == "development":
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

# Google returns full canonical scope URLs (userinfo.email, userinfo.profile)
# even when the flow was initiated with short aliases (email, profile).
# This tells the oauthlib not to treat that as a scope mismatch error.
os.environ["OAUTHLIB_RELAX_TOKEN_SCOPE"] = "1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize resources on startup, clean up on shutdown."""
    logger.info("Starting Nebula AI Mail backend...")
    await init_db()
    logger.info("Database initialized")
    yield
    logger.info("Shutting down Nebula AI Mail backend")


app = FastAPI(
    title="Nebula AI Mail API",
    description="AI-powered email application backend with Gmail integration",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── Middleware ───────────────────────────────────────────────────────────────

# Determine if we are running in production (HTTPS) or locally (HTTP)
IS_PRODUCTION = settings.environment == "production"

# Session middleware.
# Production: same_site="none" + https_only=True so the browser sends the
#             cookie on cross-origin requests (Vercel → Render).
# Development: same_site="lax" + https_only=False works over plain HTTP.
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    session_cookie="nebula_session",
    max_age=86400 * 7,                       # 7 days
    https_only=IS_PRODUCTION,                # True in prod (requires HTTPS)
    same_site="none" if IS_PRODUCTION else "lax",
)

# CORS – allow both the configured frontend URL and localhost for local dev.
# allow_credentials=True is required for the session cookie to be sent.
allowed_origins = list({
    settings.frontend_url,
    "http://localhost:5173",
    "http://localhost:3000",
})

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,                  # Must be True for cookies
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ─── Routes ───────────────────────────────────────────────────────────────────

app.include_router(auth_router)
app.include_router(emails_router)
app.include_router(assistant_router)
app.include_router(notifications_router)


# ─── Health Check ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    """Backend health check endpoint - used by deployment platforms."""
    return {"status": "healthy", "service": "nebula-ai-mail"}


@app.get("/")
async def root():
    return {
        "message": "Nebula AI Mail API",
        "docs": "/docs",
        "health": "/health",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
