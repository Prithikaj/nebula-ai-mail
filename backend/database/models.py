"""
SQLAlchemy ORM models for persistent application metadata.
We store OAuth tokens and assistant conversation history here.
Actual emails are fetched live from Gmail API, not stored in full.
"""

from sqlalchemy import Column, String, Text, DateTime, Boolean, Integer
from sqlalchemy.sql import func
from database.database import Base


class User(Base):
    """
    Stores authenticated user info and OAuth tokens.
    Tokens are encrypted-at-rest via the session mechanism.
    """
    __tablename__ = "users"

    id = Column(String, primary_key=True)          # Google user ID (sub claim)
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=True)
    picture = Column(String, nullable=True)        # Profile picture URL

    # OAuth tokens - stored securely, never exposed to frontend
    access_token = Column(Text, nullable=True)
    refresh_token = Column(Text, nullable=True)
    token_expiry = Column(DateTime, nullable=True)

    # Gmail push notification tracking
    gmail_history_id = Column(String, nullable=True)
    gmail_watch_expiry = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class EmailCache(Base):
    """
    Lightweight metadata cache for emails.
    Stores only IDs and thread IDs to speed up navigation.
    Full email content is always fetched fresh from Gmail.
    """
    __tablename__ = "email_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False)
    gmail_message_id = Column(String, nullable=False)
    thread_id = Column(String, nullable=True)
    label_ids = Column(Text, nullable=True)        # JSON string
    cached_at = Column(DateTime, server_default=func.now())


class AssistantMessage(Base):
    """
    Conversation history for the AI assistant.
    Stores user messages and assistant responses per session.
    """
    __tablename__ = "assistant_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False)
    session_id = Column(String, nullable=False)    # Groups messages into conversations
    role = Column(String, nullable=False)          # "user" or "assistant"
    content = Column(Text, nullable=False)
    tool_calls = Column(Text, nullable=True)       # JSON string of tool calls made
    created_at = Column(DateTime, server_default=func.now())
