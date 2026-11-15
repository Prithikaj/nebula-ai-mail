"""
Email routes - inbox, sent, search, send, reply, forward, read status.
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, field_validator
import re

from routes.auth import get_current_user
from database.models import User
from services import gmail_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/emails", tags=["Emails"])


# ─── Request/Response Schemas ────────────────────────────────────────────────

class SendEmailRequest(BaseModel):
    to: str
    subject: str
    body: str
    cc: Optional[str] = None
    bcc: Optional[str] = None

    @field_validator("to")
    @classmethod
    def validate_to(cls, v):
        # Basic email validation - accepts "Name <email>" format too
        emails = [e.strip() for e in v.split(",")]
        for email in emails:
            # Extract email from "Name <email>" format
            match = re.search(r'[\w.+-]+@[\w-]+\.[\w.-]+', email)
            if not match:
                raise ValueError(f"Invalid email address: {email}")
        return v


class ReplyEmailRequest(BaseModel):
    body: str


class ForwardEmailRequest(BaseModel):
    recipient: str
    body: Optional[str] = None


# ─── Poll IDs only (used by 30-second frontend background poll) ──────────────

@router.get("/poll-ids")
async def poll_inbox_ids(
    max_results: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
):
    """
    Return only inbox message IDs — no bodies, no headers.
    Cost: 1 quota unit total (single list call).
    Frontend uses this to detect new arrivals and fetches metadata only
    for IDs that aren't already in the email list.
    """
    try:
        ids = await gmail_service.get_inbox_message_ids(
            user=user,
            max_results=max_results,
        )
        return JSONResponse({"ids": ids})
    except Exception as e:
        logger.error(f"Poll IDs error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Batch metadata fetch (for new IDs found during polling) ─────────────────

@router.post("/fetch-new")
async def fetch_new_emails(
    request: dict,
    user: User = Depends(get_current_user),
):
    """
    Fetch metadata for a list of email IDs that the frontend
    doesn't already have. Cost: 1 unit/message.
    Body: {"ids": ["id1", "id2", ...]}
    """
    ids = request.get("ids", [])
    if not ids:
        return JSONResponse({"emails": []})
    # Cap at 10 to prevent abuse
    ids = ids[:10]
    try:
        emails = await gmail_service.get_emails_by_ids_metadata(
            user=user,
            email_ids=ids,
        )
        return JSONResponse({"emails": emails})
    except Exception as e:
        logger.error(f"Fetch new emails error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Inbox ────────────────────────────────────────────────────────────────────

@router.get("/inbox")
async def get_inbox(
    page_token: Optional[str] = Query(None),
    max_results: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
):
    """Get inbox emails with optional pagination."""
    try:
        result = await gmail_service.get_inbox_emails(
            user=user,
            page_token=page_token,
            max_results=max_results,
        )
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"Inbox fetch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Sent ─────────────────────────────────────────────────────────────────────

@router.get("/sent")
async def get_sent(
    page_token: Optional[str] = Query(None),
    max_results: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
):
    """Get sent emails with optional pagination."""
    try:
        result = await gmail_service.get_sent_emails(
            user=user,
            page_token=page_token,
            max_results=max_results,
        )
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"Sent fetch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Search ───────────────────────────────────────────────────────────────────

@router.get("/search")
async def search_emails(
    q: Optional[str] = Query(None, description="Gmail search query"),
    sender: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    date_after: Optional[str] = Query(None, description="YYYY/MM/DD"),
    date_before: Optional[str] = Query(None, description="YYYY/MM/DD"),
    read_status: Optional[str] = Query(None, description="read, unread, or all"),
    max_results: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
):
    """Search emails with various filters."""
    # Add read_status to query if specified
    query = q or ""
    if read_status == "unread":
        query = (query + " is:unread").strip()
    elif read_status == "read":
        query = (query + " is:read").strip()

    try:
        result = await gmail_service.search_emails(
            user=user,
            query=query or None,
            sender=sender,
            keyword=keyword,
            date_after=date_after,
            date_before=date_before,
            max_results=max_results,
        )
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Single Email ─────────────────────────────────────────────────────────────

@router.get("/{email_id}")
async def get_email(
    email_id: str,
    user: User = Depends(get_current_user),
):
    """Get a single email by ID."""
    try:
        email = await gmail_service.get_email_by_id(user=user, email_id=email_id)
        return JSONResponse(email)
    except Exception as e:
        logger.error(f"Get email error: {e}")
        raise HTTPException(status_code=404, detail=str(e))


# ─── Send ─────────────────────────────────────────────────────────────────────

@router.post("/send")
async def send_email(
    request: SendEmailRequest,
    user: User = Depends(get_current_user),
):
    """Send a new email via Gmail API."""
    try:
        result = await gmail_service.send_email(
            user=user,
            to=request.to,
            subject=request.subject,
            body=request.body,
            cc=request.cc,
            bcc=request.bcc,
        )
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"Send email error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Reply ────────────────────────────────────────────────────────────────────

@router.post("/{email_id}/reply")
async def reply_to_email(
    email_id: str,
    request: ReplyEmailRequest,
    user: User = Depends(get_current_user),
):
    """Reply to an existing email."""
    try:
        # Get original email to extract thread info and sender
        original = await gmail_service.get_email_by_id(user=user, email_id=email_id)

        result = await gmail_service.send_email(
            user=user,
            to=original["sender_email"],
            subject=f"Re: {original['subject']}",
            body=request.body,
            reply_to_message_id=original["id"],
            thread_id=original["thread_id"],
        )
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"Reply error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Forward ──────────────────────────────────────────────────────────────────

@router.post("/{email_id}/forward")
async def forward_email(
    email_id: str,
    request: ForwardEmailRequest,
    user: User = Depends(get_current_user),
):
    """Forward an email to another recipient."""
    try:
        original = await gmail_service.get_email_by_id(user=user, email_id=email_id)

        forward_body = (
            f"{request.body or ''}\n\n"
            f"---------- Forwarded message ----------\n"
            f"From: {original.get('sender_email', '')}\n"
            f"Date: {original.get('date', '')}\n"
            f"Subject: {original.get('subject', '')}\n\n"
            f"{original.get('body_plain', original.get('snippet', ''))}"
        )

        result = await gmail_service.send_email(
            user=user,
            to=request.recipient,
            subject=f"Fwd: {original['subject']}",
            body=forward_body,
        )
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"Forward error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Read Status ──────────────────────────────────────────────────────────────

@router.patch("/{email_id}/read")
async def mark_read(
    email_id: str,
    user: User = Depends(get_current_user),
):
    """Mark an email as read."""
    try:
        result = await gmail_service.mark_email_read(user=user, email_id=email_id)
        return JSONResponse(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{email_id}/unread")
async def mark_unread(
    email_id: str,
    user: User = Depends(get_current_user),
):
    """Mark an email as unread."""
    try:
        result = await gmail_service.mark_email_unread(user=user, email_id=email_id)
        return JSONResponse(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
