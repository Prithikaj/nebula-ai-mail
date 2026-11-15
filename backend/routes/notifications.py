"""
Gmail push notification webhook and WebSocket routes.

Gmail push notifications flow:
  1. Gmail detects new mail for a watched user
  2. Gmail publishes a notification to your Pub/Sub topic
  3. Pub/Sub pushes to this webhook endpoint: POST /webhooks/gmail
  4. We decode the notification and call Gmail History API
  5. New emails are broadcast via WebSocket to connected clients

WebSocket endpoint:
  WS /ws/mail?token=<session_token>
  Frontend connects here to receive real-time inbox updates.
"""

import base64
import json
import logging
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Request, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database.database import get_db
from database.models import User
from services.notification_service import ws_manager, process_gmail_notification

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Notifications"])


@router.post("/webhooks/gmail")
async def gmail_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Receive Gmail push notifications from Google Cloud Pub/Sub.
    
    Pub/Sub sends a POST with a base64-encoded message containing:
    {
        "message": {
            "data": "<base64-encoded JSON>",
            "messageId": "...",
            "publishTime": "...",
        },
        "subscription": "projects/.../subscriptions/..."
    }
    
    The decoded data contains:
    {
        "emailAddress": "user@gmail.com",
        "historyId": "12345"
    }
    """
    try:
        body = await request.json()
        message = body.get("message", {})
        data = message.get("data", "")

        if not data:
            return JSONResponse({"status": "no_data"})

        # Decode base64 Pub/Sub message
        decoded = base64.b64decode(data).decode("utf-8")
        notification = json.loads(decoded)

        email_address = notification.get("emailAddress")
        history_id = notification.get("historyId")

        logger.info(f"Gmail push notification for {email_address}, historyId: {history_id}")

        if not email_address or not history_id:
            return JSONResponse({"status": "invalid_notification"})

        # Find the user by email
        result = await db.execute(select(User).where(User.email == email_address))
        user = result.scalar_one_or_none()

        if not user:
            logger.warning(f"No user found for email: {email_address}")
            return JSONResponse({"status": "user_not_found"})

        # Process the notification - fetch new emails and push via WebSocket
        await process_gmail_notification(
            user_id=user.id,
            history_id=history_id,
            user=user,
            db=db,
        )

        # Acknowledge receipt (Pub/Sub requires 200 response within 10 seconds)
        return JSONResponse({"status": "ok"})

    except Exception as e:
        logger.error(f"Webhook processing error: {e}")
        # Still return 200 to prevent Pub/Sub from retrying indefinitely
        return JSONResponse({"status": "error", "detail": str(e)})


@router.websocket("/ws/mail")
async def websocket_endpoint(
    websocket: WebSocket,
    db: AsyncSession = Depends(get_db),
):
    """
    WebSocket connection for real-time inbox updates.
    
    Authentication: The frontend should send the user_id as a query parameter.
    In production, use a signed token instead of raw user ID.
    
    Messages sent to client:
    - {"type": "new_email", "email": {...}}
    - {"type": "email_updated", "email_id": "...", "updates": {...}}
    - {"type": "inbox_refresh"}
    - {"type": "connected", "message": "..."}
    """
    # Get user ID from query parameter
    # In a production setup, this should be a signed short-lived token
    user_id = websocket.query_params.get("user_id")

    if not user_id:
        await websocket.close(code=1008, reason="Missing user_id")
        return

    # Verify user exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        await websocket.close(code=1008, reason="User not found")
        return

    # Register connection
    await ws_manager.connect(websocket, user_id)

    try:
        # Send connection confirmation
        await websocket.send_json({
            "type": "connected",
            "message": "Real-time mail sync active",
            "user_email": user.email,
        })

        # Keep connection alive, handle incoming messages (ping/pong)
        while True:
            data = await websocket.receive_text()
            # Handle ping messages from client
            if data == "ping":
                await websocket.send_text("pong")

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, user_id)
        logger.info(f"WebSocket disconnected: user={user_id}")
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        ws_manager.disconnect(websocket, user_id)
