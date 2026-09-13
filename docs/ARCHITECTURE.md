# Architecture Design — Home Finance Agent

Status: **Phase 0 built and running** (manual CSV import + manual
categorization; no agent yet). Last updated 2026-09-13.

## 1. Goal & scope

Build a personal system that, once a day:

1. Pulls new bank transactions automatically (open banking, no manual export).
2. Categorizes each transaction, learning from corrections over time instead
   of re-guessing every merchant.
3. Maintains a monthly dashboard: spend by category, savings-goal progress,
   and money left (income − expenses − fixed items − savings goal).
4. Is reachable from an iPhone as an installable app.

This is a joint-account budget, not a single-salary one: only one partner's
salary typically lands in the tracked account, and some recurring costs
(e.g. rent) are paid from a different account entirely and never appear as
a transaction here at all. §6–§8 cover how the data model accounts for
that — a general "fixed monthly items" mechanism (Settings-configured, not
detected) rather than assuming every relevant amount shows up in this
account's statement.

Single user, low transaction volume (tens–low hundreds/month), no real-time
requirement. That last point matters: it rules out several "always-on"
patterns and makes the cheapest, most boring option the right one almost
everywhere.

## 2. High-level architecture

```mermaid
flowchart TB
    subgraph Bank["Your Bank"]
        B[Bank account]
    end

    subgraph OB["Open Banking Aggregator (PSD2)"]
        OBA[GoCardless Bank Account Data /\nEnable Banking]
    end

    subgraph GCP["Google Cloud Project"]
        SCHED[Cloud Scheduler\ndaily cron] -->|OIDC-authenticated trigger| JOB
        JOB[Cloud Run Job\nADK agent pipeline] -->|fetch transactions| OBA
        JOB -->|Gemini: parse / categorize| GEMINI[Gemini API\nVertex AI]
        JOB -->|read/write| FS[(Firestore\ntransactions, rules,\ndashboards, settings)]
        SM[Secret Manager\nbank tokens, API keys] -.-> JOB

        FS <-->|read dashboards,\nedit category, edit goals| WEBSDK[Firestore Web SDK]
        CF[Cloud Function\non category edit] -->|recompute month,\nupdate learned rule| FS

        HOST[Firebase Hosting\nPWA static assets] --> WEBSDK
        AUTH[Firebase Auth\nGoogle sign-in, 1 user] --> WEBSDK
    end

    OBA -->|read-only, consented| B
    IPHONE[iPhone — installed PWA] -->|HTTPS| HOST
    IPHONE -->|HTTPS| WEBSDK
    IPHONE -->|sign in| AUTH
```

Two independent halves, joined only by Firestore:

- **Batch pipeline** (server-side, once a day): sync → parse → categorize →
  store → aggregate. Nothing here is user-facing or latency-sensitive.
- **Dashboard app** (client-side, on-demand): a PWA that reads/writes
  Firestore directly through the Firebase Web SDK — no custom API server
  needed for the parts that are just CRUD, which removes an entire service
  to run, patch, and pay for.

## 3. Why these building blocks

### 3.1 Agent framework: Google ADK — as a library, not deployed to Agent Engine

Google's stack offers two layers here and it's worth separating them:

- **ADK (Agent Development Kit)** — an open-source (Apache-2.0) Python/Go/
  Java/TS framework for structuring an agent as a model + a set of typed
  tools + orchestration/tracing. This is a **code structure**, not a hosting
  choice — the same agent can run locally, in a container, or managed.
- **Vertex AI Agent Engine** — a managed *runtime* for agents (ADK,
  LangGraph, CrewAI, …) with autoscaling, sessions, and a "Memory Bank"
  for long-lived conversational memory.

Agent Engine earns its cost for **interactive, multi-turn, long-lived
conversational agents** — it bills stored session events/memories
($0.25 per 1,000, since Feb 2026) on top of vCPU/GB-hour runtime, which
is money spent on a capability (durable multi-turn memory across a chat UI)
this pipeline doesn't need: it's one deterministic batch run a day with no
back-and-forth conversation.

**Recommendation:** build the pipeline as an ADK agent (tools = fetch
transactions, categorize, write to Firestore, recompute dashboard — see
§5) for the structure, tracing, and testability ADK gives you, but run it
as a plain **Cloud Run Job** invoked by Cloud Scheduler, not deployed onto
Agent Engine. A few minutes of compute once a day sits inside Cloud Run's
always-free tier; Agent Engine's session/memory billing buys you nothing
here.

Keep Agent Engine in your back pocket for a genuine future use case:
a **"ask your finances"** chat feature in the dashboard ("how much did I
spend on dining out in June vs May?") is exactly the interactive,
session-carrying agent Agent Engine is built for. That's a clean phase-3
add-on (§8), not part of the MVP.

### 3.2 Model choice: cheapest tier that clears the bar, with escalation for the hard cases

The task per transaction is bounded classification (pick 1 of ~14 known
categories + a boolean), plus, for statement parsing, structured extraction
from tabular/PDF input — neither needs frontier reasoning.

Current Gemini lineup and pricing (per 1M tokens, input/output; Sep 2026):

| Model | Input | Output | Fit |
|---|---|---|---|
| Gemini 3.1 Pro | $2.00 | $12.00 | Overkill — reserve for nothing in this project |
| Gemini 3.x Flash (3.5–3.8) | $0.75–$1.50 | $3.75–$7.50 | Good, but pricier than needed for pure classification |
| **Gemini 3.5 Flash-Lite (GA)** | **$0.30** | **$2.50** | **Default for this project** |
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 | Fallback if Flash-Lite 3.5 proves unnecessary for accuracy |

**Recommendation:** **Gemini 3.5 Flash-Lite** for both statement parsing and
categorization, called through Vertex AI (keeps everything in one GCP
project/billing/IAM boundary, no separate API key to manage). Add one
cheap reliability trick instead of reaching for a bigger model:

- **Confidence-gated escalation** — the categorization tool asks for a
  `confidence` field in its structured output; anything below a threshold
  (or any transaction the merchant-rule cache and the model disagree on)
  gets a second pass on a stronger model (Gemini 3.x Flash) or is simply
  flagged `needs_review` and shown to you in the dashboard to confirm once.
  At tens of transactions a month, this costs cents either way — the point
  is to spend the extra tokens only where they change the answer.
- **Merchant-rule cache** (§5) means most transactions never hit the model
  at all after the first month, once recurring merchants (your supermarket,
  utility company, phone plan) are learned.

This is the "best available that's *enough*" reading of the brief: default
to the cheapest tier that structurally fits the task, and spend more only
adaptively, on the transactions that actually need it.

### 3.3 Ingestion: open banking aggregator (PSD2)

You chose automatic sync over manual upload. In the EU this means going
through a licensed PSD2 aggregator rather than talking to your bank
directly (banks don't hand out stable personal API keys). Current options:

| Provider | Status (Sep 2026) | Notes |
|---|---|---|
| GoCardless Bank Account Data (ex-Nordigen) | **Closed to new signups** — being wound down | Only usable if you already hold credentials from before the freeze |
| **Enable Banking** | Self-serve, closest free/cheap replacement | Recommended default — confirm your specific bank is covered |
| Tink (Visa) / TrueLayer | Enterprise-priced, built for fintechs | Overkill/cost-prohibitive for a single-user personal project |

**Recommendation:** start with **Enable Banking** (or GoCardless if you
already have a grandfathered account) — confirm your bank's coverage
during setup, since exact bank support varies by provider. Whichever is
picked, the integration is the same shape:

- One-time (then periodic, per PSD2 SCA rules — typically ~90 days) consent
  flow: you authenticate with your bank once via the aggregator's hosted
  redirect; the resulting token is stored in **Secret Manager**, never in
  Firestore or code.
- The daily Cloud Run Job calls the aggregator's read-only transactions
  endpoint with a `since` cursor (last synced transaction date/id, stored
  per account in Firestore) — so it only pulls what's new.
- Treat the consent-expiry date as data: surface "reconnect your bank" as a
  dashboard banner when it's within a week of expiring, since a lapsed
  consent silently stops the daily sync otherwise.
- Keep a manual CSV/PDF upload path as a fallback tool in the agent (same
  parsing step, different source) for any account the aggregator doesn't
  cover, or for bootstrapping history before the first consent completes.

### 3.4 Data store: Firestore

A single-user, low-volume, document-shaped dataset (transactions, learned
rules, monthly rollups, settings) is a textbook Firestore fit: generous
always-free tier, native Firebase Auth + security-rules integration so the
PWA can read/write it directly with no custom API server, and no schema
migrations to run for a personal project. See §6 for the collection
layout.

### 3.5 Frontend: installable PWA on Firebase Hosting

For "an app I can access on my iPhone" without building/signing/
distributing a native app:

- A PWA (manifest.json + service worker) hosted on **Firebase Hosting**,
  added to the iPhone home screen via Safari's "Add to Home Screen" —
  opens full-screen, no browser chrome, behaves like an installed app.
- **Firebase Authentication** (Google sign-in) gates access; Firestore
  **security rules** hard-restrict every read/write to your own `uid`
  (belt-and-suspenders alongside only your account ever being granted
  access).
- The dashboard, transaction list, category edits, and savings-goal/salary
  settings all read/write Firestore directly via the client SDK — no
  backend API needed for these. A **Cloud Function** Firestore trigger
  (`onUpdate` on a transaction's category) does two things server-side:
  writes/updates the merchant → category learned rule, and recomputes that
  month's dashboard rollup — so a manual correction immediately improves
  future auto-categorization and is reflected on the dashboard.
- Charting: bar/donut for spend-by-category, a progress bar for the
  savings goal, a single "money left" stat tile — plain Recharts/Chart.js
  is more than enough; no separate BI tool needed for one user's dashboard.

## 4. Data flow (daily run)

```mermaid
sequenceDiagram
    participant Sched as Cloud Scheduler
    participant Job as Cloud Run Job (ADK agent)
    participant OB as Open Banking API
    participant Gemini as Gemini 3.5 Flash-Lite
    participant FS as Firestore

    Sched->>Job: trigger (OIDC), once/day
    Job->>FS: read last sync cursor per account
    Job->>OB: fetch transactions since cursor
    OB-->>Job: new transactions
    loop each transaction
        Job->>FS: lookup merchant in categoryRules cache
        alt cache hit, high trust
            FS-->>Job: category
        else cache miss / ambiguous
            Job->>Gemini: categorize(transaction, taxonomy)
            Gemini-->>Job: category, confidence
            Job->>FS: upsert categoryRules (if confidence high)
        end
        Job->>FS: upsert transaction (idempotent by external tx id)
    end
    Job->>FS: recompute month's dashboard rollup (incl. Settings' fixed items)
    Job->>FS: update sync cursor
```

Idempotency: every transaction is keyed by the aggregator's stable
external transaction id, so a retried or overlapping run never
double-counts — a write is always an upsert, never an append.

## 5. Agent tools (ADK)

The pipeline is one ADK agent with these tools; each is a small, testable,
independently-loggable function — this is what ADK's structure buys you
over a single monolithic script:

| Tool | Purpose |
|---|---|
| `fetch_new_transactions(account_id, since_cursor)` | Calls the open banking API (or parses an uploaded CSV/PDF as fallback) |
| `lookup_category_rule(merchant_normalized)` | Firestore cache lookup — avoids an LLM call for known merchants |
| `categorize_transaction(transaction, taxonomy)` | Gemini structured-output call → `{category, confidence}` |
| `save_category_rule(merchant_normalized, category)` | Writes/updates the learned cache when confidence is high |
| `detect_salary(transactions, predefined_default)` | Heuristic (recurring largest monthly credit against the "income"-special category) with a pre-defined fallback value you set in Settings |
| `upsert_transactions(transactions)` | Idempotent Firestore batch write |
| `recompute_dashboard(month)` | Aggregates totals by category, income vs. expenses, fixed items from Settings, savings-goal progress, money left — this exact logic already lives in `functions/src/dashboard.ts` (Phase 0's Cloud Function), so Phase 1 just calls the same function instead of re-implementing it |

Structured output (JSON schema / controlled generation) is used for every
Gemini call — never free-text parsing — so a malformed model response is a
validation error you can retry or flag, not a silent bad write.

## 6. Firestore data model

```
users/{uid}
  defaultSalary, savingsGoal: { type: "fixed"|"percent", value },
  fixedExpenses: [ { id, label, amount }, ... ],   -- e.g. rent, paid from another account
  fixedIncomes:  [ { id, label, amount }, ... ]    -- e.g. a partner's contribution that never lands here

users/{uid}/settings/categories        (single doc)
  categories: [ { id, label, special?: "income"|"savings" }, ... ]   -- editable, seeded from §7

users/{uid}/accounts/{accountId}
  provider, consentExpiresAt, lastSyncCursor, bankName

users/{uid}/transactions/{externalTxId}
  date, amount, currency, merchantRaw, merchantNormalized,
  category, needsReview: bool, source: "auto"|"manual-edit"|"manual-import",
  confidence, month: "YYYY-MM", accountId

users/{uid}/categoryRules/{merchantNormalized}
  category, timesConfirmed, lastUpdated

users/{uid}/dashboards/{YYYY-MM}
  salary, totalsByCategory: { [categoryId]: amount }, totalExpenses,
  fixedExpensesTotal, fixedIncomesTotal, savingsGoalTarget, savingsActual,
  moneyLeft, needsReviewCount, updatedAt
```

Firestore security rules: every path above scoped to
`request.auth.uid == uid` **and** the one allow-listed account email —
deny-by-default for everyone/everything else.

## 7. Default category taxonomy

A starting set, fully editable in Settings (rename, add, remove, or reset
to this list) — nothing is hardcoded in the agent, it reads the taxonomy
from `users/{uid}/settings/categories`. No needed/discretionary split —
that distinction wasn't pulling its weight in practice, so it was dropped
after Phase 0 testing:

| Category | Special role |
|---|---|
| Salary | *Excluded from spend* — feeds the salary figure (`special: "income"`) |
| Food | — |
| Transport | — |
| Needs | — |
| Invest | *Excluded from spend* — tracked against the savings goal (`special: "savings"`) |
| Entertainment | — |
| Others | Default fallback for anything uncategorized |

## 8. Dashboard contents & the "money left" formula

- Expenses by category (this month, from categorized transactions only),
  as a bar chart.
- Savings goal progress: target for the month vs amount actually moved to
  "Invest" — a comparison, not a deduction (see below).
- Fixed monthly items (rent, a partner's contribution, etc. — configured
  in Settings, never detected from a transaction) shown as their own list
  so the money-left number is traceable to something other than "trust me".
- **Money left** = `(salary + Σfixed incomes) − Σ(expenses) − Σfixed
  expenses` — plainly income minus real spend, where `salary` is the
  auto-detected "income"-category credit for the month, falling back to
  your pre-defined default if none was detected (editable in Settings
  either way — auto-detection should never silently override a number you
  set yourself without showing it to you first). The savings goal is
  **not** subtracted here — it's a target you're compared against via the
  savings meter, not a guaranteed outflow, so it shouldn't shrink a number
  that's supposed to mean "what's actually left."
- Trend view across the last N months (same rollup collection, just a
  range query) — not built yet, still a Phase 0 gap.

## 9. Security & privacy notes

- Bank tokens and any API keys live only in **Secret Manager**, read only
  by the Cloud Run Job's service account (least-privilege IAM — no other
  identity in the project can read those secrets).
- Firestore is reachable only via the client SDK from an authenticated,
  allow-listed Firebase Auth user (you), enforced in security rules — the
  Cloud Run Job's service account is the only other principal with write
  access, and only to this project's Firestore.
- No third party ever receives your data except the two you've explicitly
  chosen to: the open banking aggregator (read-only, consented, revocable)
  and the Gemini API (transaction text/PDF, for parsing/categorization —
  no bank credentials ever go there).
- Everything is encrypted in transit (TLS) and at rest (default GCP/
  Firebase encryption) with no extra setup.
- A stale/expired bank consent should fail loudly (dashboard banner + a
  Cloud Monitoring alert if the daily job errors), not silently stop
  syncing.

## 10. Cost estimate

At this volume, nearly everything sits inside Google Cloud's always-free
tiers:

| Component | Expected cost |
|---|---|
| Cloud Run Job (few minutes/day) | $0 (well under the always-free tier) |
| Cloud Scheduler (1 job) | $0 (3 jobs free) |
| Firestore (reads/writes/storage for one user) | $0 (far under the daily free quota) |
| Firebase Hosting + Auth | $0 (free tier covers a personal PWA) |
| Gemini 3.5 Flash-Lite (tens–hundreds of tx/month, mostly cache hits after month 1) | Cents/month |
| Open banking aggregator | $0–~€3/mo depending on provider tier chosen |
| Secret Manager | $0 (a handful of secrets, free tier) |

Realistic total: **under $1–2/month**, likely $0 most months.

## 11. Phased build plan

1. **Phase 0 — data model + dashboard, manual CSV import.** Stand up
   Firestore, security rules, the PWA (auth, dashboard, settings, manual
   transaction categorization UI), seeded with a CSV export you upload by
   hand. Proves the data model and UI end-to-end with zero bank-integration
   risk.
2. **Phase 1 — ADK categorization agent, still on manual input.** Build the
   agent tools (§5) against the same CSV path; validate categorization
   quality and the learned-rule cache before any bank credentials are in
   play.
3. **Phase 2 — open banking sync.** Add the aggregator consent flow, the
   daily Cloud Scheduler → Cloud Run Job trigger, and cursor-based
   incremental fetch. This is the step gated on confirming your bank's
   coverage with the chosen provider.
4. **Phase 3 (stretch) — conversational "ask your finances".** A chat
   affordance in the dashboard ("how much on dining out in June vs May?"),
   backed by the same ADK tools but this time genuinely worth deploying to
   **Vertex AI Agent Engine** for its session/memory management.

## 12. Open questions to confirm before Phase 2

- Which bank(s) and which aggregator (Enable Banking vs. any existing
  GoCardless access) — needs a coverage check for your specific bank.
- Is one "Salary" category (matching whichever partner's income actually
  lands in this account) still enough once bank sync is live, or does the
  agent need to distinguish multiple real income transactions by payer?
- `needs_review` transactions are excluded from `totalsByCategory` /
  `totalExpenses` until categorized (settled by the Phase 0 implementation)
  — revisit only if that undercounts spend in a way that's actually
  confusing in practice.

---

Sources consulted: [Google ADK overview](https://developers.googleblog.com/en/agent-development-kit-easy-to-build-multi-agent-applications/) ·
[Vertex AI Agent Builder 2026 guide](https://uibakery.io/blog/vertex-ai-agent-builder) ·
[Gemini API pricing, Sep 2026](https://www.cloudzero.com/blog/gemini-pricing/) ·
[Vertex AI pricing](https://cloud.google.com/vertex-ai/pricing) ·
[GoCardless Bank Account Data status](https://www.openbankingtracker.com/guides/free-open-banking-apis) ·
[Firebase Hosting + PWA](https://firebase.google.com/docs/hosting).
