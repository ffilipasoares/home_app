"""The "ask your finances" agent — a second, separate ADK agent from the
categorizer (functions/categorize.py). Different job, different tools:
read-only, answers free-form questions grounded in the user's own
Firestore data. See docs/ARCHITECTURE.md §13 for the design and why
conversation history is handled the way it is here.

Deliberately read-only: none of the tools below write anything. Worst
case a strange question just reads data it didn't need to, never
corrupts anything.
"""

import os
from datetime import date

from firebase_admin import firestore
from google import genai
from google.adk.agents import LlmAgent
from google.adk.models import Gemini
from google.adk.runners import InMemoryRunner
from google.cloud.firestore_v1.base_query import FieldFilter
from google.genai import types

# More reasoning-heavy than categorization (interpreting a question,
# comparing months, deciding what's worth mentioning) — worth the step up
# from the categorizer's Flash-Lite given how rarely this runs.
INSIGHTS_MODEL = os.environ.get("INSIGHTS_MODEL", "gemini-2.5-flash")
PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCLOUD_PROJECT")
LOCATION = os.environ.get("VERTEX_LOCATION", "us-central1")

MAX_EVENTS = 30
# The client already caps how much history it sends; this is a second,
# defensive cap so a misbehaving client can't blow up the prompt size.
MAX_HISTORY_TURNS = 8


async def answer_question(uid: str, question: str, history: list[dict[str, str]]) -> str:
    """
    Runs one turn of the finance_assistant agent for this user's question.

    `history` is the client-held conversation so far
    (`[{"role": "user"|"assistant", "text": ...}, ...]`) — there is no
    server-side session or persisted chat storage for this first version
    (see docs/ARCHITECTURE.md §13: ephemeral now, persisted chat history
    planned for a later version). Each call is a fresh, stateless agent
    run seeded with that history as plain conversational context, the
    same "no durable session" choice functions/categorize.py made for the
    same reason: nothing here needs to survive between calls except what
    the client already holds.

    Never raises — any failure (Firestore, the agent run, anything) comes
    back as a plain-language answer rather than a stack trace reaching the
    caller, same philosophy as the categorizer's failure handling.
    """
    try:
        return await _run(uid, question, history)
    except Exception as err:  # noqa: BLE001 - surface a plain answer rather than a stack trace to the user
        print(f"answer_question agent run failed: {err}")
        return "Sorry, something went wrong answering that — try again in a moment."


async def _run(uid: str, question: str, history: list[dict[str, str]]) -> str:
    """`uid` is never exposed to the model or accepted as a tool argument —
    every tool below closes over it directly, so there is no path (prompt
    injection included) by which this agent could read another user's data."""
    db = firestore.client()
    user_ref = db.collection("users").document(uid)

    def get_dashboard(month: str) -> dict:
        """Returns the computed monthly dashboard for the given YYYY-MM
        month: salary, spend by category, savings goal progress, money
        left. If that month has no dashboard yet, returns found=False —
        say so plainly rather than guessing a number."""
        snap = user_ref.collection("dashboards").document(month).get()
        if not snap.exists:
            return {"found": False, "month": month}
        return {"found": True, **snap.to_dict()}

    def list_transactions(month: str, category: str = "") -> list[dict]:
        """Returns categorized transactions for the given YYYY-MM month,
        optionally filtered to one category id (leave blank for all
        categories). Excludes transactions still flagged for review —
        they're not in the dashboard totals either. Call get_settings
        first if you need to match a category label to its id."""
        docs = user_ref.collection("transactions").where(filter=FieldFilter("month", "==", month)).stream()
        out = []
        for d in docs:
            tx = d.to_dict()
            if tx.get("needsReview") or not tx.get("category"):
                continue
            if category and tx["category"] != category:
                continue
            out.append(
                {
                    "date": tx.get("date"),
                    "merchant": tx.get("merchantRaw"),
                    "amount": tx.get("amount"),
                    "category": tx.get("category"),
                }
            )
        return out

    def list_available_months() -> list[str]:
        """Returns the YYYY-MM months that have a computed dashboard,
        most recent first — use this rather than assuming which months
        have data."""
        docs = user_ref.collection("dashboards").order_by("month", direction=firestore.Query.DESCENDING).stream()
        return [d.id for d in docs]

    def get_settings() -> dict:
        """Returns the category list (including which are marked income/
        savings), fixed monthly expenses, and the savings goal
        configuration — useful for explaining *why* a number is what it
        is, not just what it is."""
        settings_snap = user_ref.get()
        categories_snap = user_ref.collection("settings").document("categories").get()
        return {
            **(settings_snap.to_dict() or {}),
            "categories": (categories_snap.to_dict() or {}).get("categories", []),
        }

    history_text = "\n".join(f"{turn['role']}: {turn['text']}" for turn in history[-MAX_HISTORY_TURNS:])
    prompt = (f"Conversation so far:\n{history_text}\n\nNew question: {question}" if history_text else question)

    model = Gemini(model=INSIGHTS_MODEL, client=genai.Client(vertexai=True, project=PROJECT, location=LOCATION))
    agent = LlmAgent(
        name="finance_assistant",
        model=model,
        instruction=(
            "You answer questions about the user's own personal finances, grounded only in\n"
            "the tools below — never guess a number you could look up. Today's date is "
            f"{date.today().isoformat()}; resolve relative references ('last month', 'in July')\n"
            "into a YYYY-MM month yourself before calling a tool. If a month has no data, say so\n"
            "plainly rather than guessing. Keep answers short and concrete — lead with the number,\n"
            "then a brief note if it's useful. You cannot change anything — you can only look things up."
        ),
        tools=[get_dashboard, list_transactions, list_available_months, get_settings],
    )

    # In-memory/ephemeral, same reasoning as the categorizer: nothing here
    # needs to persist server-side between calls.
    runner = InMemoryRunner(agent=agent, app_name="finance_assistant")
    session = await runner.session_service.create_session(app_name="finance_assistant", user_id=uid)

    final_text = None
    events = 0
    async for event in runner.run_async(
        user_id=uid,
        session_id=session.id,
        new_message=types.Content(parts=[types.Part(text=prompt)]),
    ):
        events += 1
        if event.is_final_response() and event.content and event.content.parts:
            final_text = "".join(part.text or "" for part in event.content.parts)
        if events > MAX_EVENTS:
            break  # never expected to trip — same safety net as the categorizer

    return final_text or "I couldn't find a clear answer to that."
