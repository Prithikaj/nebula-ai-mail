"""
Gmail API service layer.
All Gmail API interactions go through this module.
Keeps business logic clean and testable.
"""

import base64
import json
import re
from datetime import datetime, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

import bleach
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from config import settings
from database.models import User


# Tags allowed when rendering HTML email bodies (security: strip scripts)
ALLOWED_TAGS = [
    "p", "br", "b", "i", "u", "strong", "em", "a", "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "h6", "span", "div", "table", "tr",
    "td", "th", "thead", "tbody", "blockquote", "pre", "code", "img",
    "hr", "small", "sup", "sub",
]
ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "target"],
    "img": ["src", "alt", "width", "height"],
    "*": ["style", "class"],
}


def build_credentials(user: User) -> Credentials:
    """Build Google OAuth credentials from stored user tokens."""
    creds = Credentials(
        token=user.access_token,
        refresh_token=user.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=settings.gmail_scopes,
    )
    return creds


def refresh_credentials_if_needed(creds: Credentials) -> Credentials:
    """Refresh access token if it has expired."""
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return creds


def get_gmail_service(user: User):
    """Build and return an authenticated Gmail API service client."""
    creds = build_credentials(user)
    creds = refresh_credentials_if_needed(creds)
    service = build("gmail", "v1", credentials=creds)
    return service, creds


def parse_email_headers(headers: list) -> dict:
    """Extract useful headers from Gmail message headers list."""
    result = {}
    for header in headers:
        name = header.get("name", "").lower()
        value = header.get("value", "")
        if name in ("from", "to", "cc", "bcc", "subject", "date", "reply-to", "message-id"):
            result[name] = value
    return result


def decode_email_body(payload: dict) -> tuple[str, str]:
    """
    Recursively decode email body from Gmail payload.
    Returns (plain_text, html_content) tuple.
    """
    plain = ""
    html = ""

    mime_type = payload.get("mimeType", "")
    body = payload.get("body", {})
    parts = payload.get("parts", [])

    if mime_type == "text/plain":
        data = body.get("data", "")
        if data:
            plain = base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")

    elif mime_type == "text/html":
        data = body.get("data", "")
        if data:
            html = base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")

    elif parts:
        for part in parts:
            p, h = decode_email_body(part)
            plain = plain or p
            html = html or h

    return plain, html


def sanitize_html(html_content: str) -> str:
    """Sanitize HTML email content to prevent XSS attacks."""
    if not html_content:
        return ""
    return bleach.clean(
        html_content,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        strip=True,
    )


def parse_sender(from_header: str) -> tuple[str, str]:
    """
    Parse 'From' header into (name, email) tuple.
    Example: "John Doe <john@example.com>" -> ("John Doe", "john@example.com")
    """
    from_header = from_header.strip()
    # Try "Name <email>" format
    match = re.match(r'^"?([^"<]*)"?\s*<([^>]+)>$', from_header)
    if match:
        name = match.group(1).strip().strip('"')
        email = match.group(2).strip()
        return name or email, email
    # Plain email address
    email_match = re.search(r'[\w.+\-]+@[\w\-]+\.[\w.\-]+', from_header)
    if email_match:
        email = email_match.group(0)
        return email, email
    return from_header, from_header


def format_email_message(message: dict) -> dict:
    """
    Transform raw Gmail API message into a clean frontend-ready dict.
    """
    payload = message.get("payload", {})
    headers = parse_email_headers(payload.get("headers", []))
    plain_body, html_body = decode_email_body(payload)

    # Sanitize HTML to prevent XSS
    safe_html = sanitize_html(html_body) if html_body else ""

    sender_name, sender_email = parse_sender(headers.get("from", ""))

    # Build preview from plain text
    preview = plain_body[:200].replace("\n", " ").strip() if plain_body else ""
    if not preview and safe_html:
        # Strip tags for preview
        preview = re.sub(r"<[^>]+>", "", safe_html)[:200].strip()

    # Determine read status (UNREAD label means unread)
    label_ids = message.get("labelIds", [])
    is_unread = "UNREAD" in label_ids
    is_starred = "STARRED" in label_ids

    return {
        "id": message.get("id"),
        "thread_id": message.get("threadId"),
        "label_ids": label_ids,
        "sender_name": sender_name,
        "sender_email": sender_email,
        "to": headers.get("to", ""),
        "cc": headers.get("cc", ""),
        "bcc": headers.get("bcc", ""),
        "subject": headers.get("subject", "(No Subject)"),
        "date": headers.get("date", ""),
        "preview": preview,
        "body_plain": plain_body,
        "body_html": safe_html,
        "is_unread": is_unread,
        "is_starred": is_starred,
        "snippet": message.get("snippet", ""),
    }


async def get_inbox_emails(user: User, page_token: Optional[str] = None, max_results: int = 20) -> dict:
    """
    Retrieve inbox emails from Gmail.
    Returns emails list and next page token for pagination.
    """
    service, creds = get_gmail_service(user)

    try:
        # List inbox messages
        params = {
            "userId": "me",
            "labelIds": ["INBOX"],
            "maxResults": max_results,
        }
        if page_token:
            params["pageToken"] = page_token

        result = service.users().messages().list(**params).execute()
        messages = result.get("messages", [])
        next_token = result.get("nextPageToken")

        # Fetch full details for each message
        emails = []
        for msg_ref in messages:
            try:
                msg = service.users().messages().get(
                    userId="me",
                    id=msg_ref["id"],
                    format="full",
                ).execute()
                emails.append(format_email_message(msg))
            except HttpError:
                continue  # Skip failed individual messages

        return {
            "emails": emails,
            "next_page_token": next_token,
            "result_size": len(emails),
        }

    except HttpError as e:
        raise Exception(f"Gmail API error fetching inbox: {e}")


async def get_sent_emails(user: User, page_token: Optional[str] = None, max_results: int = 20) -> dict:
    """Retrieve sent emails from Gmail."""
    service, creds = get_gmail_service(user)

    try:
        params = {
            "userId": "me",
            "labelIds": ["SENT"],
            "maxResults": max_results,
        }
        if page_token:
            params["pageToken"] = page_token

        result = service.users().messages().list(**params).execute()
        messages = result.get("messages", [])
        next_token = result.get("nextPageToken")

        emails = []
        for msg_ref in messages:
            try:
                msg = service.users().messages().get(
                    userId="me",
                    id=msg_ref["id"],
                    format="full",
                ).execute()
                emails.append(format_email_message(msg))
            except HttpError:
                continue

        return {
            "emails": emails,
            "next_page_token": next_token,
            "result_size": len(emails),
        }

    except HttpError as e:
        raise Exception(f"Gmail API error fetching sent: {e}")


async def get_email_by_id(user: User, email_id: str) -> dict:
    """Retrieve a single email by its Gmail message ID."""
    service, creds = get_gmail_service(user)

    try:
        msg = service.users().messages().get(
            userId="me",
            id=email_id,
            format="full",
        ).execute()
        return format_email_message(msg)
    except HttpError as e:
        raise Exception(f"Gmail API error fetching email {email_id}: {e}")


async def search_emails(
    user: User,
    query: Optional[str] = None,
    sender: Optional[str] = None,
    keyword: Optional[str] = None,
    date_after: Optional[str] = None,
    date_before: Optional[str] = None,
    max_results: int = 20,
) -> dict:
    """
    Search Gmail using Gmail search syntax.
    Builds a Gmail query string from the provided filters.
    """
    service, creds = get_gmail_service(user)

    # Build Gmail query string
    parts = []
    if query:
        parts.append(query)
    if sender:
        parts.append(f"from:{sender}")
    if keyword:
        parts.append(keyword)
    if date_after:
        # Gmail format: YYYY/MM/DD
        parts.append(f"after:{date_after}")
    if date_before:
        parts.append(f"before:{date_before}")

    gmail_query = " ".join(parts) if parts else ""

    try:
        result = service.users().messages().list(
            userId="me",
            q=gmail_query,
            maxResults=max_results,
        ).execute()

        messages = result.get("messages", [])

        emails = []
        for msg_ref in messages:
            try:
                msg = service.users().messages().get(
                    userId="me",
                    id=msg_ref["id"],
                    format="full",
                ).execute()
                emails.append(format_email_message(msg))
            except HttpError:
                continue

        return {
            "emails": emails,
            "query": gmail_query,
            "result_size": len(emails),
        }

    except HttpError as e:
        raise Exception(f"Gmail API error searching emails: {e}")


async def send_email(
    user: User,
    to: str,
    subject: str,
    body: str,
    cc: Optional[str] = None,
    bcc: Optional[str] = None,
    reply_to_message_id: Optional[str] = None,
    thread_id: Optional[str] = None,
) -> dict:
    """
    Send an email via Gmail API.
    This should only be called after explicit user confirmation.
    """
    service, creds = get_gmail_service(user)

    # Build MIME message
    if cc or bcc:
        msg = MIMEMultipart()
        msg.attach(MIMEText(body, "plain"))
    else:
        msg = MIMEText(body, "plain")

    msg["To"] = to
    msg["Subject"] = subject
    msg["From"] = user.email

    if cc:
        msg["Cc"] = cc
    if bcc:
        msg["Bcc"] = bcc

    # For replies, include threading headers
    if reply_to_message_id:
        msg["In-Reply-To"] = reply_to_message_id
        msg["References"] = reply_to_message_id

    # Encode to base64url
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")

    try:
        send_params = {"userId": "me", "body": {"raw": raw}}
        if thread_id:
            send_params["body"]["threadId"] = thread_id

        sent = service.users().messages().send(**send_params).execute()
        return {"success": True, "message_id": sent.get("id"), "thread_id": sent.get("threadId")}

    except HttpError as e:
        raise Exception(f"Gmail API error sending email: {e}")


async def mark_email_read(user: User, email_id: str) -> dict:
    """Mark an email as read by removing the UNREAD label."""
    service, _ = get_gmail_service(user)
    try:
        service.users().messages().modify(
            userId="me",
            id=email_id,
            body={"removeLabelIds": ["UNREAD"]},
        ).execute()
        return {"success": True, "email_id": email_id, "is_unread": False}
    except HttpError as e:
        raise Exception(f"Gmail API error marking read: {e}")


async def mark_email_unread(user: User, email_id: str) -> dict:
    """Mark an email as unread by adding the UNREAD label."""
    service, _ = get_gmail_service(user)
    try:
        service.users().messages().modify(
            userId="me",
            id=email_id,
            body={"addLabelIds": ["UNREAD"]},
        ).execute()
        return {"success": True, "email_id": email_id, "is_unread": True}
    except HttpError as e:
        raise Exception(f"Gmail API error marking unread: {e}")


async def setup_gmail_watch(user: User, topic_name: str) -> dict:
    """
    Set up Gmail push notifications via Google Cloud Pub/Sub.
    Gmail will send a notification to the Pub/Sub topic when new mail arrives.
    Returns historyId and expiration timestamp.
    """
    service, _ = get_gmail_service(user)
    try:
        result = service.users().watch(
            userId="me",
            body={
                "topicName": topic_name,
                "labelIds": ["INBOX"],
            },
        ).execute()
        return {
            "history_id": result.get("historyId"),
            "expiration": result.get("expiration"),
        }
    except HttpError as e:
        raise Exception(f"Gmail watch setup error: {e}")


async def get_history(user: User, start_history_id: str) -> list:
    """
    Retrieve Gmail history since a given historyId.
    Used to process push notification deltas.
    """
    service, _ = get_gmail_service(user)
    try:
        result = service.users().history().list(
            userId="me",
            startHistoryId=start_history_id,
            historyTypes=["messageAdded"],
        ).execute()

        messages_added = []
        for history_item in result.get("history", []):
            for msg_added in history_item.get("messagesAdded", []):
                messages_added.append(msg_added.get("message", {}))

        return messages_added
    except HttpError as e:
        # History ID expired or invalid - return empty list
        return []
