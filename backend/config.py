"""
Application configuration loaded from environment variables.
Never hardcode secrets here - use the .env file.
"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Google OAuth
    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str = "http://localhost:8000/auth/google/callback"

    # Google Cloud
    google_cloud_project_id: str = ""

    # Groq AI (replaces Gemini)
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"

    # App security - used for signing session cookies
    secret_key: str = "change-this-in-production-use-long-random-string"

    # CORS - frontend URL
    frontend_url: str = "http://localhost:5173"

    # Pub/Sub
    pubsub_topic: str = ""
    pubsub_subscription: str = ""

    # Environment
    environment: str = "development"

    # Gmail OAuth scopes – use full canonical URLs to match what Google returns
    gmail_scopes: list[str] = [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.modify",
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
    ]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


# Single shared settings instance
settings = Settings()
