"""
AI service using Groq (replaces Gemini).
Groq has an OpenAI-compatible API and supports parallel function calling.
The output structure is identical to the previous Gemini implementation
so no other file needs to change.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from groq import AsyncGroq

from config import settings
from agents.mail_tools import MAIL_TOOLS

logger = logging.getLogger(__name__)

# Groq client singleton
_client: Optional[AsyncGroq] = None


def get_groq_client() -> AsyncGroq:
    global _client
    if _client is None:
        _client = AsyncGroq(api_key=settings.groq_api_key)
    return _client


# ── Convert our tool definitions into Groq/OpenAI tool format ──────────────

def build_groq_tools() -> list:
    """
    Groq uses the same tool schema as OpenAI:
    {"type": "function", "function": {"name": ..., "description": ..., "parameters": ...}}
    """
    return [
        {
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["parameters"],
            },
        }
        for tool in MAIL_TOOLS
    ]


SYSTEM_PROMPT = """You are Nebula Mail Assistant, an AI assistant integrated into an email application.

You can DIRECTLY CONTROL the email application by calling tools. You are not just a chatbot.

When a user asks you to do something with their email:
1. First understand their intent clearly
2. Use get_current_context() if you need to know the current state
3. Call the appropriate tools to execute the action
4. Always tell the user what you are doing (e.g., "Opening compose form...", "Searching for emails...")
5. NEVER invent email IDs, addresses, or content - only use real data from search results
6. For sending emails, ALWAYS ask for explicit confirmation before calling send_email()
7. When showing email search results, tell the user what you found and ask what they'd like to do

Important rules:
- Never call send_email() unless the user has explicitly said "yes, send it" or "confirm" or similar
- When asked to reply, fill the form but wait for confirmation before sending
- When searching, show results to the user and let them choose
- Keep responses concise and action-oriented
- Always announce what action you are taking

Current date: {current_date}
"""

# Models to try in order if one is overloaded or unavailable
# Updated Nov 2026 – fetched live from Groq API
FALLBACK_MODELS = [
    "openai/gpt-oss-120b",   # primary – largest, best tool use
    "openai/gpt-oss-20b",    # faster/cheaper fallback
    "qwen/qwen3.8-27b",      # last resort
]


async def process_assistant_message(
    user_message: str,
    app_context: dict,
    conversation_history: list,
    user,
) -> dict:
    """
    Process a user message through Groq with function calling.

    Returns a dict with:
      text            – assistant reply text
      actions         – list of frontend action objects
      tool_calls      – list of {tool, args} dicts (for display)
      compose_data    – filled compose form data or None
      search_results  – list of emails or None
      open_email_id   – email ID to open or None
      filter_data     – applied filter info or None
      status          – "success"
    """
    client = get_groq_client()
    tools = build_groq_tools()

    current_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    system = SYSTEM_PROMPT.format(current_date=current_date)

    # Inject current app state into system prompt
    context_block = (
        f"\nCurrent application state:\n"
        f"- View: {app_context.get('current_view', 'inbox')}\n"
        f"- Open email ID: {app_context.get('current_email_id') or 'none'}\n"
        f"- Open email subject: {app_context.get('current_email_subject') or 'none'}\n"
        f"- Open email from: {app_context.get('current_email_sender') or 'none'}\n"
        f"- Active filters: {json.dumps(app_context.get('active_filters', {}))}\n"
        f"- Compose data: {json.dumps(app_context.get('compose_data', {}))}\n"
    )

    # Build messages array in OpenAI format
    messages = [{"role": "system", "content": system + context_block}]

    # Add recent conversation history (last 10 turns)
    for msg in conversation_history[-10:]:
        messages.append({
            "role": msg["role"],        # "user" | "assistant"
            "content": msg["content"],
        })

    # Add the new user message
    messages.append({"role": "user", "content": user_message})

    # Response accumulators
    response_text = ""
    actions = []
    tool_calls_made = []
    compose_data = None
    search_results = None
    open_email_id = None
    filter_data = None

    # Pick from configured model and use fallback list
    model_list = [settings.groq_model] + [
        m for m in FALLBACK_MODELS if m != settings.groq_model
    ]
    # Deduplicate preserving order
    seen: set = set()
    model_list = [m for m in model_list if not (m in seen or seen.add(m))]

    response = None
    last_error = None

    for model_name in model_list:
        for attempt in range(3):
            try:
                response = await client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    tools=tools,
                    tool_choice="auto",
                    temperature=0.1,
                    max_tokens=2048,
                )
                settings.groq_model = model_name  # remember working model
                break  # success – exit retry loop

            except Exception as e:
                last_error = e
                err_str = str(e).lower()

                # Rate limit / overload – wait and retry same model
                if any(k in err_str for k in ("rate_limit", "429", "503", "overloaded", "unavailable")):
                    wait = 2 ** attempt  # 1 s → 2 s → 4 s
                    logger.warning(
                        f"Groq {model_name} overloaded (attempt {attempt+1}/3), "
                        f"retrying in {wait}s"
                    )
                    await asyncio.sleep(wait)
                    continue

                # Model gone / decommissioned / not found – skip to next model
                if any(k in err_str for k in (
                    "model_not_found", "404", "not found",
                    "decommissioned", "model_decommissioned",
                    "no longer supported",
                )):
                    logger.warning(f"Groq model {model_name} unavailable/decommissioned, trying next")
                    break  # exit retry loop → outer loop picks next model

                # Anything else (auth, bad request) – fail immediately
                logger.error(f"Groq non-retryable error: {e}")
                response_text = f"I encountered an error: {e}. Please try again."
                break

        if response is not None:
            break  # exit model fallback loop

    if response is None:
        logger.error(f"All Groq models/retries exhausted. Last: {last_error}")
        response_text = (
            "The AI service is temporarily unavailable. "
            "Please wait a few seconds and try again."
        )

    # ── Process the Groq response ────────────────────────────────────────────
    if response:
        try:
            choice = response.choices[0]
            msg = choice.message

            # Collect text reply
            if msg.content:
                response_text += msg.content

            # Process tool calls if any
            if msg.tool_calls:
                # Build a follow-up messages list for multi-turn tool execution
                tool_messages = list(messages)
                tool_messages.append({
                    "role": "assistant",
                    "content": msg.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in msg.tool_calls
                    ],
                })

                for tc in msg.tool_calls:
                    tool_name = tc.function.name
                    try:
                        tool_args = json.loads(tc.function.arguments)
                    except (json.JSONDecodeError, TypeError):
                        tool_args = {}

                    tool_calls_made.append({"tool": tool_name, "args": tool_args})

                    # Execute the tool
                    tool_result = await execute_tool(
                        tool_name=tool_name,
                        tool_args=tool_args,
                        user=user,
                        app_context=app_context,
                    )

                    # Collect frontend actions
                    if tool_result.get("action"):
                        actions.append(tool_result["action"])
                    if tool_result.get("compose_data"):
                        compose_data = tool_result["compose_data"]
                    if tool_result.get("search_results") is not None:
                        search_results = tool_result["search_results"]
                    if tool_result.get("open_email_id"):
                        open_email_id = tool_result["open_email_id"]
                    if tool_result.get("filter_data"):
                        filter_data = tool_result["filter_data"]

                    # Append tool result so Groq can compose a final reply
                    tool_messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": tool_result.get("message", "Done."),
                    })

                # Get Groq's final text reply after all tool executions
                try:
                    follow_up = await client.chat.completions.create(
                        model=settings.groq_model,
                        messages=tool_messages,
                        temperature=0.1,
                        max_tokens=1024,
                    )
                    final_text = follow_up.choices[0].message.content or ""
                    if final_text:
                        response_text = final_text  # replace with the polished reply
                except Exception as e:
                    logger.warning(f"Follow-up Groq call failed: {e}")
                    # Fall back to tool result messages concatenated
                    if not response_text:
                        response_text = " ".join(
                            t.get("message", "") for t in
                            [await execute_tool(tc.function.name, {}, user, app_context)
                             for tc in (msg.tool_calls or [])]
                        )

        except Exception as e:
            logger.error(f"Error processing Groq response: {e}")
            response_text = f"I encountered an error processing the response: {e}. Please try again."

    return {
        "text": response_text.strip(),
        "actions": actions,
        "tool_calls": tool_calls_made,
        "compose_data": compose_data,
        "search_results": search_results,
        "open_email_id": open_email_id,
        "filter_data": filter_data,
        "status": "success",
    }


# ── Tool executor (unchanged logic, just moved here) ─────────────────────────

async def execute_tool(tool_name: str, tool_args: dict, user, app_context: dict) -> dict:
    """Execute a named AI tool and return a result dict with action + message."""
    from services.gmail_service import (
        get_email_by_id,
        search_emails as gmail_search,
        send_email as gmail_send,
        mark_email_read as gmail_mark_read,
        mark_email_unread as gmail_mark_unread,
    )
    from datetime import timedelta

    logger.info(f"Tool: {tool_name} | args: {tool_args}")

    if tool_name == "open_compose":
        return {"action": {"type": "navigate", "view": "compose"},
                "message": "Opening compose window..."}

    elif tool_name == "fill_email_form":
        data = {
            "to":      tool_args.get("to", ""),
            "subject": tool_args.get("subject", ""),
            "body":    tool_args.get("body", ""),
            "cc":      tool_args.get("cc", ""),
            "bcc":     tool_args.get("bcc", ""),
        }
        return {"action": {"type": "fill_compose", "data": data},
                "compose_data": data,
                "message": "Filling email form..."}

    elif tool_name == "send_email":
        if not tool_args.get("confirmed", False):
            return {"action": {"type": "request_confirmation", "action_type": "send"},
                    "message": "Please confirm: Should I send this email?"}

        cd = app_context.get("compose_data", {})
        if not cd.get("to"):
            return {"message": "No compose data found. Please fill the email form first."}
        try:
            result = await gmail_send(
                user=user, to=cd["to"],
                subject=cd.get("subject", ""), body=cd.get("body", ""),
                cc=cd.get("cc"), bcc=cd.get("bcc"),
                reply_to_message_id=cd.get("reply_to_message_id"),
                thread_id=cd.get("thread_id"),
            )
            return {"action": {"type": "email_sent", "message_id": result.get("message_id")},
                    "message": f"✓ Email sent to {cd['to']}!"}
        except Exception as e:
            return {"message": f"Failed to send: {e}"}

    elif tool_name == "search_emails":
        try:
            results = await gmail_search(
                user=user,
                query=tool_args.get("query"),
                sender=tool_args.get("sender"),
                keyword=tool_args.get("keyword"),
                date_after=tool_args.get("date_after"),
                date_before=tool_args.get("date_before"),
            )
            return {
                "action": {"type": "update_email_list",
                           "emails": results["emails"],
                           "query": results.get("query", "")},
                "search_results": results["emails"],
                "message": f"Found {results.get('result_size', 0)} email(s).",
            }
        except Exception as e:
            return {"message": f"Search failed: {e}"}

    elif tool_name == "filter_emails":
        now = datetime.now(timezone.utc)
        date_after = None
        dr = tool_args.get("date_range")
        if dr == "last_7_days":
            date_after = (now - timedelta(days=7)).strftime("%Y/%m/%d")
        elif dr == "last_10_days":
            date_after = (now - timedelta(days=10)).strftime("%Y/%m/%d")
        elif dr == "last_30_days":
            date_after = (now - timedelta(days=30)).strftime("%Y/%m/%d")

        read_status = tool_args.get("read_status", "all")
        query_parts = []
        if read_status == "unread":
            query_parts.append("is:unread")
        elif read_status == "read":
            query_parts.append("is:read")

        try:
            results = await gmail_search(
                user=user,
                query=" ".join(query_parts) or None,
                sender=tool_args.get("sender"),
                keyword=tool_args.get("keyword"),
                date_after=date_after,
            )
            filter_info = {"date_range": dr, "read_status": read_status,
                           "sender": tool_args.get("sender"),
                           "keyword": tool_args.get("keyword")}
            return {
                "action": {"type": "update_email_list",
                           "emails": results["emails"],
                           "filters": filter_info},
                "search_results": results["emails"],
                "filter_data": filter_info,
                "message": f"Filter applied. Showing {results.get('result_size', 0)} email(s).",
            }
        except Exception as e:
            return {"message": f"Filter failed: {e}"}

    elif tool_name == "open_email":
        email_id = tool_args.get("email_id", "")
        if not email_id:
            return {"message": "No email ID provided."}
        try:
            email = await get_email_by_id(user=user, email_id=email_id)
            return {"action": {"type": "open_email", "email_id": email_id, "email": email},
                    "open_email_id": email_id,
                    "message": f"Opening: {email.get('subject', '')}"}
        except Exception as e:
            return {"message": f"Could not open email: {e}"}

    elif tool_name == "reply_to_email":
        email_id = tool_args.get("email_id") or app_context.get("current_email_id", "")
        if not email_id:
            return {"message": "No email is open to reply to."}
        try:
            email = await get_email_by_id(user=user, email_id=email_id)

            # Use provided body or build a sensible reply quote
            reply_body = tool_args.get("body", "")
            if not reply_body:
                # Build a quoted reply block so the user can see what they're replying to
                original_snippet = email.get("body_plain") or email.get("snippet") or ""
                if original_snippet:
                    quoted = "\n".join(f"> {line}" for line in original_snippet[:500].splitlines())
                    reply_body = f"\n\n--- Original message from {email.get('sender_name', email.get('sender_email', ''))} ---\n{quoted}"
                else:
                    reply_body = ""

            data = {
                "to": email.get("sender_email", ""),
                "subject": email.get("subject", "").lstrip("Re: ") and f"Re: {email.get('subject', '')}",
                "body": reply_body,
                "reply_to_message_id": email.get("id"),
                "thread_id": email.get("thread_id"),
                "is_reply": True,
            }
            # Ensure subject has Re: prefix exactly once
            subj = email.get("subject", "")
            data["subject"] = subj if subj.startswith("Re:") else f"Re: {subj}"

            return {"action": {"type": "open_reply", "compose_data": data},
                    "compose_data": data,
                    "message": f"Reply form opened for email from {email.get('sender_name') or email.get('sender_email', '')}. Add your message and confirm to send."}
        except Exception as e:
            return {"message": f"Could not prepare reply: {e}"}

    elif tool_name == "forward_email":
        email_id = tool_args.get("email_id") or app_context.get("current_email_id", "")
        recipient = tool_args.get("recipient", "")
        if not email_id:
            return {"message": "No email specified to forward."}
        try:
            email = await get_email_by_id(user=user, email_id=email_id)
            body = (
                f"\n\n---------- Forwarded message ----------\n"
                f"From: {email.get('sender_email', '')}\n"
                f"Date: {email.get('date', '')}\n"
                f"Subject: {email.get('subject', '')}\n\n"
                f"{email.get('body_plain', email.get('snippet', ''))}"
            )
            data = {"to": recipient, "subject": f"Fwd: {email.get('subject', '')}",
                    "body": body, "is_forward": True}
            return {"action": {"type": "open_compose", "compose_data": data},
                    "compose_data": data,
                    "message": f"Preparing to forward to {recipient}..."}
        except Exception as e:
            return {"message": f"Could not forward: {e}"}

    elif tool_name == "navigate_to_view":
        view = tool_args.get("view", "inbox")
        return {"action": {"type": "navigate", "view": view},
                "message": f"Navigating to {view}..."}

    elif tool_name == "get_current_context":
        return {"message": (
            f"Currently in {app_context.get('current_view', 'inbox')} view. "
            f"Open email: {app_context.get('current_email_subject') or 'none'}. "
            f"From: {app_context.get('current_email_sender') or 'none'}."
        )}

    elif tool_name == "mark_email_read":
        try:
            await gmail_mark_read(user=user, email_id=tool_args.get("email_id", ""))
            return {"action": {"type": "update_email_status",
                               "email_id": tool_args.get("email_id"), "is_unread": False},
                    "message": "Marked as read."}
        except Exception as e:
            return {"message": f"Could not mark as read: {e}"}

    elif tool_name == "mark_email_unread":
        try:
            await gmail_mark_unread(user=user, email_id=tool_args.get("email_id", ""))
            return {"action": {"type": "update_email_status",
                               "email_id": tool_args.get("email_id"), "is_unread": True},
                    "message": "Marked as unread."}
        except Exception as e:
            return {"message": f"Could not mark as unread: {e}"}

    return {"message": f"Unknown tool: {tool_name}"}
