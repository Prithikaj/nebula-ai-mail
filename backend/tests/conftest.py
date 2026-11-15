"""
Pytest configuration and shared fixtures.
"""
import os
import pytest

# Set test environment variables before importing app
os.environ.setdefault("GOOGLE_CLIENT_ID", "test_client_id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test_client_secret")
os.environ.setdefault("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")
os.environ.setdefault("GOOGLE_CLOUD_PROJECT_ID", "test_project")
os.environ.setdefault("GEMINI_API_KEY", "test_gemini_key")
os.environ.setdefault("SECRET_KEY", "test_secret_key_for_testing_only_32chars")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")
