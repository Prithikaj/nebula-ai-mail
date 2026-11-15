"""
AI Assistant routes.
POST /assistant/chat - process a user message through Gemini
GET  /assistant/context - get current app context (called by frontend to send with messages)
"""

import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from routes.auth import get_current_user
from database.database import get_db
from database.models import User, AssistantMessage
from services.gemini_service import process_assistant_message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assistant", tags=["AI Assistant"])


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    # App context sent from frontend - describes current UI state
    app_context: Optional[dict] = {
        "current_view": "inbox",
        "current_email_id": None,
        "current_email_subject": None,
        "current_email_sender": None,
        "active_filters": {},
        "compose_data": {},
    }


@router.post("/chat")
async def chat(
    request: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Process a user message through the AI assistant.
    
    1. Load conversation history from database
    2. Send to Gemini with function calling
    3. Execute any tool calls (search, navigate, fill form, etc.)
    4. Store conversation turn
    5. Return structured response with actions for frontend
    """
    # Use provided session ID or create a new one
    session_id = request.session_id or str(uuid.uuid4())

    # Load recent conversation history for context
    history_result = await db.execute(
        select(AssistantMessage)
        .where(
            AssistantMessage.user_id == user.id,
            AssistantMessage.session_id == session_id,
        )
        .order_by(AssistantMessage.created_at.asc())
        .limit(20)
    )
    history_messages = history_result.scalars().all()

    conversation_history = [
        {"role": msg.role, "content": msg.content}
        for msg in history_messages
    ]

    # Store user message
    user_msg = AssistantMessage(
        user_id=user.id,
        session_id=session_id,
        role="user",
        content=request.message,
    )
    db.add(user_msg)

    try:
        # Process through Gemini with function calling
        result = await process_assistant_message(
            user_message=request.message,
            app_context=request.app_context or {},
            conversation_history=conversation_history,
            user=user,
        )

        # Store assistant response
        assistant_msg = AssistantMessage(
            user_id=user.id,
            session_id=session_id,
            role="assistant",
            content=result.get("text", ""),
            tool_calls=json.dumps(result.get("tool_calls", [])),
        )
        db.add(assistant_msg)

        return JSONResponse({
            "session_id": session_id,
            "response": result.get("text", ""),
            "actions": result.get("actions", []),
            "compose_data": result.get("compose_data"),
            "search_results": result.get("search_results"),
            "open_email_id": result.get("open_email_id"),
            "filter_data": result.get("filter_data"),
            "tool_calls": result.get("tool_calls", []),
            "status": "success",
        })

    except Exception as e:
        logger.error(f"Assistant chat error: {e}")
        raise HTTPException(status_code=500, detail=f"Assistant error: {str(e)}")


@router.get("/context")
async def get_context(
    user: User = Depends(get_current_user),
):
    """
    Return current assistant context info.
    Frontend sends its current state; we acknowledge it here.
    """
    return JSONResponse({
        "user_email": user.email,
        "user_name": user.name,
    })


@router.delete("/history")
async def clear_history(
    session_id: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Clear conversation history for a session or all sessions."""
    from sqlalchemy import delete

    query = delete(AssistantMessage).where(AssistantMessage.user_id == user.id)
    if session_id:
        query = query.where(AssistantMessage.session_id == session_id)

    await db.execute(query)
    return JSONResponse({"success": True})
