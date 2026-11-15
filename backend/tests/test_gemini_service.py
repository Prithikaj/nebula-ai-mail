"""
Tests for Gemini AI service and tool execution.
Mocks all external API calls.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestToolExecution:
    """Test that each AI tool produces the correct action structure."""

    @pytest.mark.asyncio
    async def test_open_compose_tool(self):
        from services.gemini_service import execute_tool
        result = await execute_tool("open_compose", {}, user=None, app_context={})
        assert result["action"]["type"] == "navigate"
        assert result["action"]["view"] == "compose"

    @pytest.mark.asyncio
    async def test_fill_email_form_tool(self):
        from services.gemini_service import execute_tool
        args = {"to": "test@example.com", "subject": "Hello", "body": "World"}
        result = await execute_tool("fill_email_form", args, user=None, app_context={})
        assert result["action"]["type"] == "fill_compose"
        assert result["compose_data"]["to"] == "test@example.com"
        assert result["compose_data"]["subject"] == "Hello"

    @pytest.mark.asyncio
    async def test_navigate_to_view_tool(self):
        from services.gemini_service import execute_tool
        result = await execute_tool("navigate_to_view", {"view": "sent"}, user=None, app_context={})
        assert result["action"]["type"] == "navigate"
        assert result["action"]["view"] == "sent"

    @pytest.mark.asyncio
    async def test_send_email_requires_confirmation(self):
        from services.gemini_service import execute_tool
        # Without confirmed=True, should request confirmation
        result = await execute_tool("send_email", {"confirmed": False}, user=None, app_context={})
        assert result["action"]["type"] == "request_confirmation"

    @pytest.mark.asyncio
    async def test_get_context_tool(self):
        from services.gemini_service import execute_tool
        ctx = {
            "current_view": "inbox",
            "current_email_subject": "Test Subject",
            "current_email_sender": "alice@example.com",
        }
        result = await execute_tool("get_current_context", {}, user=None, app_context=ctx)
        assert "inbox" in result["message"]

    @pytest.mark.asyncio
    async def test_filter_emails_last_7_days(self):
        """Filter tool should calculate date range and call Gmail search."""
        mock_user = MagicMock()

        with patch("services.gmail_service.search_emails", new_callable=AsyncMock) as mock_search:
            mock_search.return_value = {"emails": [], "result_size": 0, "query": "is:unread"}
            from services.gemini_service import execute_tool
            result = await execute_tool(
                "filter_emails",
                {"date_range": "last_7_days", "read_status": "unread"},
                user=mock_user,
                app_context={},
            )
            # Action type should be update_email_list
            assert result["action"]["type"] == "update_email_list"

    @pytest.mark.asyncio
    async def test_reply_to_email_uses_current_context(self):
        """When no email_id given, reply should use current open email from context."""
        mock_user = MagicMock()
        mock_email = {
            "id": "ctx_email_id",
            "thread_id": "thread1",
            "sender_email": "sender@example.com",
            "sender_name": "Sender",
            "subject": "Original Subject",
        }

        with patch("services.gmail_service.get_email_by_id", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_email
            from services.gemini_service import execute_tool
            result = await execute_tool(
                "reply_to_email",
                {"body": "My reply"},
                user=mock_user,
                app_context={"current_email_id": "ctx_email_id"},
            )
            assert result["compose_data"]["to"] == "sender@example.com"
            assert "Re:" in result["compose_data"]["subject"]


class TestMailToolDefinitions:
    def test_all_tools_have_required_fields(self):
        from agents.mail_tools import MAIL_TOOLS
        for tool in MAIL_TOOLS:
            assert "name" in tool, f"Tool missing 'name': {tool}"
            assert "description" in tool, f"Tool missing 'description': {tool}"
            assert "parameters" in tool, f"Tool missing 'parameters': {tool}"

    def test_tool_names_match_expected(self):
        from agents.mail_tools import MAIL_TOOLS
        expected = {
            "open_compose", "fill_email_form", "send_email", "search_emails",
            "filter_emails", "open_email", "reply_to_email", "forward_email",
            "navigate_to_view", "get_current_context", "mark_email_read", "mark_email_unread",
        }
        actual = {t["name"] for t in MAIL_TOOLS}
        assert actual == expected
