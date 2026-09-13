# Setup

Gets the Firestore data model, security rules, Cloud Functions (automatic
categorization + dashboard recompute), and installable PWA running
end-to-end. No bank integration yet — that's Phase 2 (see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).

## 1. Prerequisites

- Node.js 20+ (this repo was built/tested on Node 22) — for `app/`, the PWA.
- Python 3.11+ — for `functions/`, the backend (Cloud Functions + the
  categorization agent).
- The Firebase CLI: `npm install -g firebase-tools`, then `firebase login`
  (keep it reasonably current — Python Cloud Functions support needs a
  recent-ish version).

## 2. Create the Firebase project

1. [Firebase Console](https://console.firebase.google.com/) → **Add project**.
   Analytics is optional — skip it for a personal project.
2. **Build → Firestore Database → Create database** → Native mode → pick a
   region near you → any starting rules (we deploy our own in step 6).
3. **Build → Authentication → Get started → Sign-in method** → enable
   **Google** as a provider, set a support email (your own is fine).
4. **Project settings → Your apps → Add app → Web** (`</>` icon). Register
   it (any nickname), skip the hosting-setup prompt, and copy the
   `firebaseConfig` values it shows you — you'll need them in step 4 below.
5. **Upgrade to the Blaze (pay-as-you-go) plan** — bottom-left of Firebase
   Console, "Upgrade". Cloud Functions (2nd gen, what this repo uses)
   requires Blaze even though your actual usage stays inside the free tier
   at this volume (see [docs/ARCHITECTURE.md §10](docs/ARCHITECTURE.md#10-cost-estimate)).
   This is the one step where Firebase and Google Cloud billing are
   literally the same account — it'll ask you to link a billing account
   (a card on file), same as any GCP project.

## 3. Enable Gemini access for the categorization function

This is genuinely GCP Console, not Firebase Console — Vertex AI never got
a Firebase Console page (see the earlier discussion in this project on
what lives where):

1. [Enable the Vertex AI API](https://console.cloud.google.com/flows/enableapi?apiid=aiplatform.googleapis.com)
   for your project (pick the same project id from step 2).
2. Grant the Cloud Function's runtime service account the **Vertex AI
   User** role, so it's allowed to call Gemini:
   ```bash
   PROJECT_ID="your-firebase-project-id"
   PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
   gcloud projects add-iam-policy-binding "$PROJECT_ID" \
     --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
     --role="roles/aiplatform.user"
   ```
   (That's the default compute service account 2nd-gen Cloud Functions run
   as unless you've configured a custom one.)

No API key to manage — the function authenticates as its own service
account automatically.

## 4. Configure the app

```bash
cd app
cp .env.example .env.local
```

Fill in `.env.local` with the `firebaseConfig` values from step 2.4.
`VITE_ALLOWED_EMAIL` is already set to `filipaferreirasoares12@gmail.com` —
leave it if that's the Google account you'll sign in with, otherwise change
it **and** update the matching email literal in `firestore.rules` at the
repo root (both must match — the rules file is the one that actually
enforces it).

## 5. Point the Firebase CLI at your project

From the repository root (if you're still inside `app/` from step 4, that's
just `cd ..`):

```bash
cp .firebaserc.example .firebaserc
```

Edit `.firebaserc` and replace `your-firebase-project-id` with the project
id shown in Firebase Console → Project settings (or run `firebase use --add`
and pick it interactively instead).

## 6. Install dependencies

```bash
cd app && npm install && cd ..

cd functions
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

Keep that virtual environment activated (or re-activate it) for any local
Python work in `functions/` — the Firebase CLI's Python function support
expects `requirements.txt` in `functions/` regardless, and will manage its
own build environment at deploy time.

## 7. Deploy

```bash
# Security rules + indexes first
firebase deploy --only firestore:rules,firestore:indexes

# Cloud Functions (categorization + dashboard recompute)
firebase deploy --only functions

# Build and deploy the PWA
cd app && npm run build && cd ..
firebase deploy --only hosting
```

Firebase prints a Hosting URL like `https://<project-id>.web.app` — that's
the app.

## 8. Install it on your iPhone

Open the Hosting URL in **Safari** (not Chrome — only Safari exposes
"Add to Home Screen" on iOS), sign in with your Google account, then tap
the Share icon → **Add to Home Screen**. It now opens full-screen from your
home screen like an installed app.

## 9. Try it end-to-end

1. **Dashboard** → for the current month, enter your **Salary** (or leave
   it blank once a "Salary"-categorized transaction shows up — see below)
   and, if relevant, a partner's contribution under "Other income". This is
   per-month data on purpose, so it's a habit each month, not a one-time
   setting.
2. **Settings** → set your savings goal, add **Rent** (or any other cost
   that never shows up as a transaction here) under "Fixed monthly
   expenses", and check the category list matches how you actually want to
   track spending — "Reset to defaults" gets you back to Salary / Food /
   Transport / Needs / Invest / Entertainment / Others if you've drifted.
3. **Import** → upload a CSV export from your bank → confirm the column
   mapping (it guesses date/description/amount from common header names,
   English and Portuguese) → Import. Each row is auto-categorized on
   arrival: a known merchant is instant and free (the learned-rules cache),
   an unfamiliar one gets a Gemini call and either lands categorized or as
   a pre-filled suggestion flagged "confirm suggestion".
4. **Transactions** → tap **Confirm** on any suggestion that looks right,
   or change the category first if it doesn't — either way, that teaches
   the cache for next time. A transaction whose *date* doesn't match the
   month it should count toward (e.g. a salary paid the 25th of the prior
   month) can be moved via the "Counts toward…" disclosure on its row.
5. **Dashboard** → updates within a couple of seconds of each save.

## Local development

```bash
cd app && npm run dev
```

This runs against your **real** Firestore/Auth (no emulator wired up yet)
— fine for a single-user personal project, just know that anything you do
in dev writes real data. `firebase emulators:start` covers Auth + Firestore
+ Functions fully offline if you'd rather develop against a sandbox (the
Vertex AI call in `functions/categorize.py` won't work in the emulator
without its own credentials setup, though — cache-hit categorization and
everything else will).

## Cost

Hosting, Firestore, Auth, and the Cloud Functions all sit inside Firebase/
GCP's always-free tier at single-user volume; Gemini calls (mostly avoided
after the first month or two, once common merchants are cached) run to
cents — see [docs/ARCHITECTURE.md §10](docs/ARCHITECTURE.md#10-cost-estimate).

## What's next

- **Phase 2** — open banking sync, so statements land automatically instead
  of via CSV upload.
- **Phase 3 (stretch)** — a conversational "ask your finances" feature.
