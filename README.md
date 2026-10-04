# Home Finance Agent

A personal finance app that reads your bank transactions, categorizes each
one automatically, and keeps a dashboard of spend-by-category, savings-goal
progress, and money left for the month — accessible from your iPhone as an
installable web app.

Runs on Google Cloud / Firebase. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
for the full design and phased build plan.

## Status: Phase 1 complete; Phase 2 (bank sync) in progress — step 3 of 4 built

Data model, security rules, dashboard recomputation, and the installable
PWA (auth, dashboard, transactions, CSV import, settings) are built. Import
still means uploading a CSV export by hand, but each row is now categorized
automatically on arrival by a real ADK agent (`google-adk`, Python — `functions/categorize.py`)
— an exact-match cache for known merchants, and for a new one, an agent
that can consult how similar merchants were categorized before rather than
guessing blind (Gemini 3.5 Flash-Lite). Every answer is applied
automatically, with unsure ones marked "AI not sure"; you can change any
category afterwards. Salary/other income is entered per
month directly on the Dashboard, so reviewing an old month always shows
what actually applied then.

Phase 2 connects Revolut (via Enable Banking) for an automatic twice-daily
import of the EUR and GBP joint accounts, merged into one currency on the
dashboard. The currency merge (step 1), the Enable Banking application
(step 2, checked against the real account) and the connect flow plus
daily sync (step 3) are built; step 3 still needs deploying (SETUP.md
§10). The "reconnect before access expires" banner (step 4) comes next.
See [docs/ARCHITECTURE.md §11](docs/ARCHITECTURE.md#11-phased-build-plan).

**[SETUP.md](SETUP.md) has the step-by-step to get this running on your own
Firebase project and installed on your iPhone.**

## Repository layout

```
app/         React + Vite PWA (TypeScript) — dashboard (incl. per-month
             income), transactions, CSV import, settings
functions/   Cloud Functions (Python): an ADK categorization agent
             auto-categorizes each new transaction (exact-match cache,
             then the agent), learns from manual corrections, and
             recomputes the monthly dashboard on every transaction/income
             write; the Revolut connection and twice-daily bank sync
             (enable_banking.py, bank_sync.py)
scripts/     local test tools: the categorization agent, the Enable
             Banking API (test_enable_banking.py), the bank sync offline
             (test_bank_sync.py)
firestore.rules, firestore.indexes.json, firebase.json — Firebase config
docs/ARCHITECTURE.md — full architecture design + roadmap
SETUP.md     — how to deploy this to your own Firebase project
```

## Roadmap

- **Phase 2** — open banking sync (no more manual CSV export/upload).
  Steps 1-3 built (currency merge, Enable Banking application, connect
  flow + twice-daily sync); step 4, a reconnect reminder before Revolut's
  access expires, is next.
- **Phase 3 (stretch)** — a conversational "ask your finances" agent.
