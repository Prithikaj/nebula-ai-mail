"""
Real-time notification service using WebSockets.
Handles Gmail push notification processing and broadcasting to connected clients.

Architecture:
  Gmail -> Pub/Sub -> /webhooks/gmail -> History API -> WebSocket -> React

The WebSocket manager maintains active connections per user.
"""

import asyncio
import json
import logging
from typing import Dict, Set
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    """
    Manages WebSocket connections for real-time inbox updates.
    Each connected user can have multiple browser tabs (multiple connections).
    """

    def __init__(self):
        # user_id -> set of active WebSocket connections
        self.connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        """Accept a new WebSocket connection for a user."""
        await websocket.accept()
        if user_id not in self.connections:
            self.connections[user_id] = set()
        self.connections[user_id].add(websocket)
        logger.info(f"WebSocket connected: user={user_id}, total_connections={len(self.connections[user_id])}")

    def disconnect(self, websocket: WebSocket, user_id: str):
        """Remove a disconnected WebSocket."""
        if user_id in self.connections:
            self.connections[user_id].discard(websocket)
            if not self.connections[user_id]:
                del self.connections[user_id]
        logger.info(f"WebSocket disconnected: user={user_id}")

    async def send_to_user(self, user_id: str, message: dict):
        """
        Send a message to all active connections for a specific user.
        Automatically removes stale/closed connections.
        """
        if user_id not in self.connections:
            return

        stale = set()
        for ws in self.connections[user_id].copy():
            try:
                await ws.send_json(message)
            except Exception:
                stale.add(ws)

        # Clean up stale connections
        for ws in stale:
            self.connections[user_id].discard(ws)

    async def broadcast_new_email(self, user_id: str, email: dict):
        """Notify a user's browser that a new email arrived."""
        await self.send_to_user(user_id, {
            "type": "new_email",
            "email": email,
        })

    async def broadcast_email_update(self, user_id: str, email_id: str, updates: dict):
        """Notify a user's browser that an email was updated (read/unread etc)."""
        await self.send_to_user(user_id, {
            "type": "email_updated",
            "email_id": email_id,
            "updates": updates,
        })

    async def broadcast_inbox_refresh(self, user_id: str):
        """Tell the browser to refresh the inbox."""
        await self.send_to_user(user_id, {
            "type": "inbox_refresh",
        })


# Global singleton WebSocket manager
ws_manager = WebSocketManager()


async def process_gmail_notification(user_id: str, history_id: str, user, db) -> bool:
    """
    Process a Gmail push notification.
    
    When Gmail sends a push notification, it includes a historyId.
    We use the History API to find what changed since our last known historyId,
    then push new emails to the frontend via WebSocket.
    
    Returns True if new emails were found and pushed.
    """
    from services.gmail_service import get_history, get_email_by_id, format_email_message
    from database.models import User as UserModel
    from sqlalchemy import select

    if not user or not user.gmail_history_id:
        logger.warning(f"No history ID for user {user_id}")
        return False

    try:
        # Fetch history since last known ID
        new_messages = await get_history(user, user.gmail_history_id)

        if not new_messages:
            logger.info(f"No new messages in history for user {user_id}")
            return False

        # Fetch full details for new messages
        new_emails = []
        for msg in new_messages:
            msg_id = msg.get("id")
            if msg_id:
                try:
                    full_email = await get_email_by_id(user, msg_id)
                    new_emails.append(full_email)
                except Exception as e:
                    logger.error(f"Error fetching new email {msg_id}: {e}")

        # Push new emails to frontend via WebSocket
        for email in new_emails:
            await ws_manager.broadcast_new_email(user_id, email)

        # Update stored history ID
        async with db.begin():
            user.gmail_history_id = history_id
            db.add(user)

        logger.info(f"Pushed {len(new_emails)} new emails to user {user_id}")
        return len(new_emails) > 0

    except Exception as e:
        logger.error(f"Error processing Gmail notification: {e}")
        return False
