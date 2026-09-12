# Home Finance Agent

A personal finance app that automatically reads your bank transactions, categorizes
each one (with a "needed" vs "discretionary" tag), and keeps a dashboard of
spend-by-category, savings-goal progress, and money left for the month —
accessible from your iPhone as an installable web app.

Runs entirely on Google Cloud, once a day (batch, not real-time), built around
Google's [Agent Development Kit (ADK)](https://google.github.io/adk-docs/) and
the Gemini API.

📄 **[Read the full architecture design →](docs/ARCHITECTURE.md)**

## Status

This repository currently contains the architecture design only — no code yet.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the proposed system design,
data model, ingestion approach, model choice, cost estimate, security notes, and
a phased build plan. Implementation follows once the design is reviewed.
