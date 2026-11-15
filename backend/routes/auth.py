"""
Google OAuth 2.0 authentication routes.

Flow:
  1. GET /auth/google/login  -> redirect to Google consent screen
  2. Google redirects to /auth/google/callback with authorization code
  3. Backend exchanges code for tokens
  4. User info retrieved and stored in database
  5. Session cookie set
  6. User redirected to frontend
"""

import logging
import secrets
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from config import settings
from database.database import get_db
from database.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

# OAuth scopes
SCOPES = settings.gmail_scopes


def get_oauth_flow(state: str = None) -> Flow:
    """Create a Google OAuth flow instance."""
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.google_redirect_uri],
            }
        },
        scopes=SCOPES,
        state=state,
    )
    flow.redirect_uri = settings.google_redirect_uri
    return flow


@router.get("/google/login")
async def google_login(request: Request):
    """
    Initiate Google OAuth flow.
    Generates a state token for CSRF protection and redirects to Google.
    """
    # Generate CSRF state token
    state = secrets.token_urlsafe(32)
    request.session["oauth_state"] = state

    flow = get_oauth_flow(state=state)

    auth_url, _ = flow.authorization_url(
        access_type="offline",   # Request refresh token
        include_granted_scopes="true",
        prompt="consent",        # Force consent screen to get refresh token every time
    )

    logger.info("Redirecting to Google OAuth consent screen")
    return RedirectResponse(url=auth_url)


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str = None,
    state: str = None,
    error: str = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Handle Google OAuth callback.
    Exchange authorization code for tokens and store user data.
    """
    # Handle OAuth errors (user denied access, etc.)
    if error:
        logger.warning(f"OAuth error: {error}")
        return RedirectResponse(
            url=f"{settings.frontend_url}/?error=oauth_denied"
        )

    if not code:
        return RedirectResponse(
            url=f"{settings.frontend_url}/?error=no_code"
        )

    # Verify CSRF state token
    stored_state = request.session.get("oauth_state")
    if not stored_state or stored_state != state:
        logger.warning("OAuth state mismatch - possible CSRF attack")
        return RedirectResponse(
            url=f"{settings.frontend_url}/?error=state_mismatch"
        )

    try:
        # Exchange authorization code for tokens
        flow = get_oauth_flow(state=state)
        flow.fetch_token(code=code)
        credentials = flow.credentials

        # Get user info from Google
        user_info_service = build("oauth2", "v2", credentials=credentials)
        user_info = user_info_service.userinfo().get().execute()

        google_user_id = user_info.get("id")
        email = user_info.get("email")
        name = user_info.get("name", email)
        picture = user_info.get("picture", "")

        if not google_user_id or not email:
            raise ValueError("Could not retrieve user info from Google")

        # Calculate token expiry
        token_expiry = None
        if credentials.expiry:
            token_expiry = credentials.expiry.replace(tzinfo=timezone.utc)

        # Save or update user in database
        result = await db.execute(select(User).where(User.id == google_user_id))
        user = result.scalar_one_or_none()

        if user:
            # Update existing user's tokens
            user.access_token = credentials.token
            user.refresh_token = credentials.refresh_token or user.refresh_token
            user.token_expiry = token_expiry
            user.name = name
            user.picture = picture
        else:
            # Create new user
            user = User(
                id=google_user_id,
                email=email,
                name=name,
                picture=picture,
                access_token=credentials.token,
                refresh_token=credentials.refresh_token,
                token_expiry=token_expiry,
            )
            db.add(user)

        await db.flush()

        # Set secure session
        request.session["user_id"] = google_user_id
        request.session.pop("oauth_state", None)  # Clear used state token

        logger.info(f"User authenticated: {email}")

        # Redirect to frontend application
        return RedirectResponse(url=f"{settings.frontend_url}/?auth=success")

    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        return RedirectResponse(
            url=f"{settings.frontend_url}/?error=auth_failed"
        )


@router.get("/status")
async def auth_status(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Check if the current session has an authenticated user.
    Returns user info without sensitive tokens.
    """
    user_id = request.session.get("user_id")
    if not user_id:
        return JSONResponse({"authenticated": False, "user": None})

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        request.session.clear()
        return JSONResponse({"authenticated": False, "user": None})

    # Check if tokens are still valid (or can be refreshed)
    if user.refresh_token is None:
        return JSONResponse({
            "authenticated": False,
            "user": None,
            "error": "No refresh token - please reconnect Gmail",
        })

    return JSONResponse({
        "authenticated": True,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "picture": user.picture,
        },
    })


@router.post("/logout")
async def logout(request: Request):
    """Clear the user session."""
    request.session.clear()
    return JSONResponse({"success": True, "message": "Logged out successfully"})


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """
    FastAPI dependency: get the authenticated user from the session.
    Raises 401 if not authenticated.
    """
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        request.session.clear()
        raise HTTPException(status_code=401, detail="User not found")

    # Refresh token if expired
    if user.refresh_token:
        creds = Credentials(
            token=user.access_token,
            refresh_token=user.refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret,
        )
        if creds.expired:
            try:
                creds.refresh(GoogleRequest())
                user.access_token = creds.token
                if creds.expiry:
                    user.token_expiry = creds.expiry.replace(tzinfo=timezone.utc)
                await db.flush()
            except Exception as e:
                logger.error(f"Token refresh failed: {e}")
                raise HTTPException(
                    status_code=401,
                    detail="Token expired and refresh failed. Please reconnect Gmail."
                )

    return user
