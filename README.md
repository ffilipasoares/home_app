# Home Finance Agent

A personal finance app that reads your bank transactions, categorizes each
one automatically, and keeps a dashboard of spend-by-category, savings-goal
progress, and money left for the month — accessible from your iPhone as an
installable web app.

Runs on Google Cloud / Firebase. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
for the full design and phased build plan.

## Status: Phase 1 complete; Phase 2 (bank sync) in progress — step 1 of 4

Data model, security rules, dashboard recomputation, and the installable
PWA (auth, dashboard, transactions, CSV import, settings) are built. Import
still means uploading a CSV export by hand, but each row is now categorized
automatically on arrival by a real ADK agent (`google-adk`, Python — `functions/categorize.py`)
— an exact-match cache for known merchants, and for a new one, an agent
that can consult how similar merchants were categorized before rather than
guessing blind, with anything low-confidence left as a pre-filled
suggestion you confirm with one tap. Salary/other income is entered per
month directly on the Dashboard, so reviewing an old month always shows
what actually applied then.

Phase 2 will connect Revolut (via Enable Banking) for automatic daily
sync, merging its EUR and GBP pockets into one currency for the
dashboard. Step 1 — the data model and currency-merge math
(`amountHome`, `functions/fx.py`) — is built and needs no bank connection
to work correctly for existing EUR data; the actual bank connection
(steps 2-4) comes next. See [docs/ARCHITECTURE.md §11](docs/ARCHITECTURE.md#11-phased-build-plan).

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
             write
firestore.rules, firestore.indexes.json, firebase.json — Firebase config
docs/ARCHITECTURE.md — full architecture design + roadmap
SETUP.md     — how to deploy this to your own Firebase project
```

## Roadmap

- **Phase 2** — open banking sync (no more manual CSV export/upload).
  Step 1 (data model + currency merge) done; connecting Revolut itself
  is next.
- **Phase 3 (stretch)** — a conversational "ask your finances" agent.
