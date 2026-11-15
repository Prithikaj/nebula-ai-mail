"""
Tests for Gmail service layer.
Uses mocked Gmail API calls - no real emails are sent during testing.
"""
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from services.gmail_service import (
    parse_sender,
    parse_email_headers,
    decode_email_body,
    sanitize_html,
    format_email_message,
)


class TestParseSender:
    def test_full_name_and_email(self):
        name, email = parse_sender("John Doe <john@example.com>")
        assert name == "John Doe"
        assert email == "john@example.com"

    def test_email_only(self):
        name, email = parse_sender("john@example.com")
        assert email == "john@example.com"

    def test_quoted_name(self):
        name, email = parse_sender('"Jane Smith" <jane@example.com>')
        assert name == "Jane Smith"
        assert email == "jane@example.com"


class TestParseEmailHeaders:
    def test_extracts_common_headers(self):
        headers = [
            {"name": "From", "value": "Alice <alice@example.com>"},
            {"name": "To", "value": "Bob <bob@example.com>"},
            {"name": "Subject", "value": "Hello"},
            {"name": "Date", "value": "Mon, 1 Jan 2024 10:00:00 +0000"},
        ]
        result = parse_email_headers(headers)
        assert result["from"] == "Alice <alice@example.com>"
        assert result["to"] == "Bob <bob@example.com>"
        assert result["subject"] == "Hello"

    def test_case_insensitive(self):
        headers = [{"name": "SUBJECT", "value": "Test"}]
        result = parse_email_headers(headers)
        assert result["subject"] == "Test"


class TestSanitizeHtml:
    def test_strips_script_tags(self):
        html = '<p>Hello</p><script>alert("xss")</script>'
        result = sanitize_html(html)
        assert "<script>" not in result
        assert "Hello" in result

    def test_allows_safe_tags(self):
        html = "<p><b>Bold</b> and <a href='https://example.com'>link</a></p>"
        result = sanitize_html(html)
        assert "<b>" in result
        assert "<a" in result

    def test_empty_string(self):
        assert sanitize_html("") == ""

    def test_none_returns_empty(self):
        assert sanitize_html(None) == ""


class TestFormatEmailMessage:
    def test_basic_format(self):
        message = {
            "id": "msg123",
            "threadId": "thread456",
            "labelIds": ["INBOX", "UNREAD"],
            "snippet": "Email preview",
            "payload": {
                "mimeType": "text/plain",
                "headers": [
                    {"name": "From", "value": "Alice <alice@example.com>"},
                    {"name": "To", "value": "bob@example.com"},
                    {"name": "Subject", "value": "Test Subject"},
                    {"name": "Date", "value": "Mon, 1 Jan 2024"},
                ],
                "body": {"data": "SGVsbG8gV29ybGQ="},  # "Hello World" in base64
            },
        }
        result = format_email_message(message)
        assert result["id"] == "msg123"
        assert result["subject"] == "Test Subject"
        assert result["sender_email"] == "alice@example.com"
        assert result["sender_name"] == "Alice"
        assert result["is_unread"] is True
        assert "Hello World" in result["body_plain"]


class TestDecodeEmailBody:
    def test_plain_text(self):
        import base64
        text = "Hello, World!"
        encoded = base64.urlsafe_b64encode(text.encode()).decode()
        payload = {
            "mimeType": "text/plain",
            "body": {"data": encoded},
        }
        plain, html = decode_email_body(payload)
        assert plain == text
        assert html == ""

    def test_multipart(self):
        import base64
        plain_text = "Plain version"
        html_text = "<p>HTML version</p>"
        payload = {
            "mimeType": "multipart/alternative",
            "parts": [
                {
                    "mimeType": "text/plain",
                    "body": {"data": base64.urlsafe_b64encode(plain_text.encode()).decode()},
                },
                {
                    "mimeType": "text/html",
                    "body": {"data": base64.urlsafe_b64encode(html_text.encode()).decode()},
                },
            ],
        }
        plain, html = decode_email_body(payload)
        assert plain == plain_text
        assert html == html_text
