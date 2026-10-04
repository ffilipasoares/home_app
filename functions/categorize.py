"""The categorization agent: a real google-adk `LlmAgent`, not a bare
structured-output call. See docs/ARCHITECTURE.md §5 for the reasoning —
this project switched to Python specifically because google-adk's Python
SDK is the flagship/most mature ADK implementation.
"""

import os
from typing import TypedDict

from google import genai
from google.adk.agents import LlmAgent
from google.adk.models import Gemini
from google.adk.runners import InMemoryRunner
from google.genai import types

from schema import CategoryDef, CategoryRule

# Gemini 3.5 Flash-Lite: the newest *stable* Flash-Lite (released July
# 2026). Chosen over gemini-2.5-flash-lite, which Vertex AI retires on
# 20 October 2026, and over the newer gemini-3.x-flash models, which are
# "short-term availability" releases retired again within months. At a
# few hundred short calls a month the cost is fractions of a cent. Override
# with CATEGORIZATION_MODEL in functions/.env; no other code needs to change.
MODEL = os.environ.get("CATEGORIZATION_MODEL", "gemini-3.5-flash-lite")
PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCLOUD_PROJECT")
# The global endpoint serves every current Gemini model; regional ones
# (e.g. us-central1) don't always carry the newest.
LOCATION = os.environ.get("VERTEX_LOCATION", "global")

CONFIDENCE_THRESHOLD = 0.7

# Hard cap on tool-call rounds for one categorization run — a safety net
# against a pathological non-converging loop, not a limit this task should
# ever actually hit.
MAX_EVENTS = 20


# A bank sync can create ~100 transactions at once, each starting its own
# categorization; retry rate-limit (429) and transient errors with backoff
# instead of giving up on the first one.
_RETRY = types.HttpRetryOptions(attempts=6, initial_delay=2.0, max_delay=60.0, http_status_codes=[429, 500, 502, 503, 504])

_SPECIAL_HINTS = {
    "income": "salary or other income received",
    "savings": "money moved to savings or investments (e.g. a broker such as Trading 212)",
}


class CategorizationResult(TypedDict):
    category: str
    confidence: float


class CategorizationError(Exception):
    """The agent couldn't produce an answer (model/API failure, or it never
    recorded a valid category). The message says why."""


async def categorize_transaction(
    merchant: str,
    amount: float,
    categories: list[CategoryDef],
    recent_rules: list[CategoryRule],
) -> CategorizationResult:
    """
    Raises CategorizationError when no answer could be produced.

    A real ADK agent — not a bare structured-output call. It decides for
    itself, via a tool it can choose to call or skip, how to arrive at an
    answer: it may consult how similar merchants were categorized before
    (recent_rules), then commits its final answer through a tool call
    rather than free text.

    Called only on a confirmed cache miss (see category_rules.py,
    find_exact_category_rule) — an exact match is a deterministic lookup
    with nothing to reason about, so it's checked before this and never
    costs a model call.
    """
    # Every category is a valid answer, including the special income and
    # savings ones: salary detection and savings-goal progress depend on
    # transactions landing in them.
    choices = categories
    if not choices:
        raise CategorizationError("No categories configured (Settings).")
    valid_ids = {c["id"] for c in choices}

    captured: CategorizationResult | None = None

    def list_recently_categorized_merchants() -> list[dict[str, str]]:
        """Returns merchants confirmed before and the category each was
        assigned, in case this transaction's merchant is similar to one of
        them (e.g. the same company, a different branch or reference
        number). Call this if the merchant name doesn't obviously match a
        category on its own."""
        return [{"merchant": r["merchantNormalized"], "category": r["category"]} for r in recent_rules]

    def record_categorization(category: str, confidence: float) -> dict[str, object]:
        """Submits your final answer: exactly one category id from the
        list you were given, and your confidence (0 to 1) that it's
        correct. Call this exactly once, as your last step."""
        nonlocal captured
        if category not in valid_ids:
            return {"error": f"'{category}' is not a valid category id. Valid ids: {sorted(valid_ids)}"}
        captured = {"category": category, "confidence": max(0.0, min(1.0, confidence))}
        return {"acknowledged": True}

    category_list = "\n".join(
        f"- {c['id']}: {c['label']}" + (f" ({_SPECIAL_HINTS[c['special']]})" if c.get("special") in _SPECIAL_HINTS else "")
        for c in choices
    )
    prompt = f'Merchant/description: "{merchant}"\nAmount: {amount} (negative = money out, positive = money in)'

    try:
        client = genai.Client(
            vertexai=True, project=PROJECT, location=LOCATION, http_options=types.HttpOptions(retry_options=_RETRY)
        )
        model = Gemini(model=MODEL, client=client)
        agent = LlmAgent(
            name="transaction_categorizer",
            model=model,
            instruction=(
                "You categorize one bank transaction at a time for a personal finance app.\n"
                "You may call list_recently_categorized_merchants if this merchant looks similar to one\n"
                "categorized before (e.g. the same company, a different branch/reference number).\n"
                "Then pick the single best-fitting category from the list below and call\n"
                "record_categorization with your choice and an honest confidence score (0 to 1).\n"
                "Call record_categorization exactly once, as your final step.\n"
                "Never invent a category id that isn't in the list below.\n\n"
                "Categories (id: label):\n" + category_list
            ),
            tools=[list_recently_categorized_merchants, record_categorization],
        )

        # In-memory/ephemeral: each categorization is one independent,
        # stateless decision — there's no conversation to persist across
        # calls, so a durable SessionService (Firestore- or Vertex-backed)
        # would just be overhead with nothing to keep.
        runner = InMemoryRunner(agent=agent, app_name="categorizer")
        session = await runner.session_service.create_session(app_name="categorizer", user_id="categorizer")

        events = 0
        async for _event in runner.run_async(
            user_id="categorizer",
            session_id=session.id,
            new_message=types.Content(parts=[types.Part(text=prompt)]),
        ):
            events += 1
            if events > MAX_EVENTS:
                break  # never expected to trip — see MAX_EVENTS
    except Exception as err:  # noqa: BLE001 - reported to the caller, which records it on the transaction
        print(f"categorize_transaction agent run failed ({MODEL} @ {LOCATION}): {err}")
        raise CategorizationError(f"{type(err).__name__}: {err}"[:300]) from err

    if captured is None:
        raise CategorizationError("The model finished without choosing a category.")
    return captured
