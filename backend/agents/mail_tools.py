"""
AI Tool definitions for Gemini function calling.
Each tool here maps to an action the AI assistant can take in the application.
The LLM calls these tools; the backend executes them and returns structured results.
"""

# Tool definitions in Gemini function-calling format
# These are sent to Gemini so it knows what actions it can take.

MAIL_TOOLS = [
    {
        "name": "open_compose",
        "description": "Navigate to the email compose view to start writing a new email.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "fill_email_form",
        "description": (
            "Fill the email compose form fields with the provided values. "
            "Call this after open_compose to populate the form visibly. "
            "Only provide fields that you have values for."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "to": {
                    "type": "string",
                    "description": "Recipient email address(es), comma-separated if multiple.",
                },
                "subject": {
                    "type": "string",
                    "description": "Email subject line.",
                },
                "body": {
                    "type": "string",
                    "description": "Email body content.",
                },
                "cc": {
                    "type": "string",
                    "description": "CC email address(es), comma-separated if multiple.",
                },
                "bcc": {
                    "type": "string",
                    "description": "BCC email address(es), comma-separated if multiple.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "send_email",
        "description": (
            "Send the currently composed email. "
            "IMPORTANT: Only call this tool AFTER the user has explicitly confirmed they want to send. "
            "Never send without user confirmation. "
            "Always ask 'Should I send this email?' before calling this tool."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "confirmed": {
                    "type": "boolean",
                    "description": "Must be true - confirms user has explicitly approved sending.",
                },
            },
            "required": ["confirmed"],
        },
    },
    {
        "name": "search_emails",
        "description": (
            "Search for emails in the user's Gmail account using filters. "
            "Returns matching emails and updates the main email list in the UI."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "sender": {
                    "type": "string",
                    "description": "Filter by sender email address or name.",
                },
                "keyword": {
                    "type": "string",
                    "description": "Search keyword to match in subject or body.",
                },
                "date_after": {
                    "type": "string",
                    "description": "Only show emails after this date. Format: YYYY/MM/DD",
                },
                "date_before": {
                    "type": "string",
                    "description": "Only show emails before this date. Format: YYYY/MM/DD",
                },
                "query": {
                    "type": "string",
                    "description": "Raw Gmail search query (advanced users). E.g. 'is:unread label:inbox'",
                },
            },
            "required": [],
        },
    },
    {
        "name": "filter_emails",
        "description": (
            "Apply filters to the inbox view to show a subset of emails. "
            "Updates the main inbox UI with filtered results."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "date_range": {
                    "type": "string",
                    "description": "Date range filter. Options: 'last_7_days', 'last_10_days', 'last_30_days'",
                    "enum": ["last_7_days", "last_10_days", "last_30_days"],
                },
                "sender": {
                    "type": "string",
                    "description": "Filter by sender email or name.",
                },
                "keyword": {
                    "type": "string",
                    "description": "Filter by keyword in subject or body.",
                },
                "read_status": {
                    "type": "string",
                    "description": "Filter by read status.",
                    "enum": ["read", "unread", "all"],
                },
            },
            "required": [],
        },
    },
    {
        "name": "open_email",
        "description": "Open a specific email in the detail view by its ID.",
        "parameters": {
            "type": "object",
            "properties": {
                "email_id": {
                    "type": "string",
                    "description": "The Gmail message ID of the email to open.",
                },
            },
            "required": ["email_id"],
        },
    },
    {
        "name": "reply_to_email",
        "description": (
            "Prepare a reply to a specific email. "
            "Opens the compose form pre-filled with the original sender's address and Re: subject. "
            "Does NOT send - requires user confirmation."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "email_id": {
                    "type": "string",
                    "description": "The Gmail message ID of the email to reply to.",
                },
                "body": {
                    "type": "string",
                    "description": "Suggested reply body text.",
                },
            },
            "required": ["email_id"],
        },
    },
    {
        "name": "forward_email",
        "description": (
            "Prepare a forwarded version of an email. "
            "Opens the compose form pre-filled with the original email content and new recipient."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "email_id": {
                    "type": "string",
                    "description": "The Gmail message ID of the email to forward.",
                },
                "recipient": {
                    "type": "string",
                    "description": "Email address to forward to.",
                },
            },
            "required": ["email_id", "recipient"],
        },
    },
    {
        "name": "navigate_to_view",
        "description": "Navigate to a specific application view.",
        "parameters": {
            "type": "object",
            "properties": {
                "view": {
                    "type": "string",
                    "description": "The view to navigate to.",
                    "enum": ["inbox", "sent", "compose", "search", "settings"],
                },
            },
            "required": ["view"],
        },
    },
    {
        "name": "get_current_context",
        "description": (
            "Get the current application context: which view is active, "
            "which email is open, and what filters are applied. "
            "Call this when you need to understand the user's current state before acting."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "mark_email_read",
        "description": "Mark a specific email as read.",
        "parameters": {
            "type": "object",
            "properties": {
                "email_id": {
                    "type": "string",
                    "description": "The Gmail message ID to mark as read.",
                },
            },
            "required": ["email_id"],
        },
    },
    {
        "name": "mark_email_unread",
        "description": "Mark a specific email as unread.",
        "parameters": {
            "type": "object",
            "properties": {
                "email_id": {
                    "type": "string",
                    "description": "The Gmail message ID to mark as unread.",
                },
            },
            "required": ["email_id"],
        },
    },
]
