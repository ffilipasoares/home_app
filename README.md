# Home Finance Agent

A personal finance app that reads your bank transactions, categorizes each
one (with a "needed" vs "discretionary" tag), and keeps a dashboard of
spend-by-category, savings-goal progress, and money left for the month —
accessible from your iPhone as an installable web app.

Runs on Google Cloud / Firebase. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
for the full design and phased build plan.

## Status: Phase 0 complete

Data model, security rules, dashboard recomputation, and the installable
PWA (auth, dashboard, transactions, manual CSV import, settings) are built.
There's no automatic bank sync or AI categorization yet — you import a CSV
export and categorize each transaction yourself; the dashboard aggregates
update automatically. That's intentional: it proves the data model and UI
before any bank credentials or Gemini calls are in the picture.

**[SETUP.md](SETUP.md) has the step-by-step to get this running on your own
Firebase project and installed on your iPhone.**

## Repository layout

```
app/         React + Vite PWA — dashboard, transactions, CSV import, settings
functions/   Cloud Function that recomputes the monthly dashboard on every
             transaction write, and learns a merchant → category rule from
             manual edits
firestore.rules, firestore.indexes.json, firebase.json — Firebase config
docs/ARCHITECTURE.md — full architecture design + roadmap
SETUP.md     — how to deploy this to your own Firebase project
```

## Roadmap

- **Phase 1** — an ADK + Gemini agent that categorizes imported transactions
  automatically, using the same learned-rule cache manual edits already
  write to.
- **Phase 2** — open banking sync (no more manual CSV export/upload).
- **Phase 3 (stretch)** — a conversational "ask your finances" agent.
