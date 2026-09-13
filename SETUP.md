# Setup — Phase 0

This gets the Firestore data model, security rules, Cloud Function, and
installable PWA (auth, dashboard, settings, manual CSV import + manual
categorization) running end-to-end. No bank integration yet — that's
Phase 2 (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).

## 1. Prerequisites

- Node.js 20+ (this repo was built/tested on Node 22).
- The Firebase CLI: `npm install -g firebase-tools`, then `firebase login`.

## 2. Create the Firebase project

1. [Firebase Console](https://console.firebase.google.com/) → **Add project**.
   Analytics is optional — skip it for a personal project.
2. **Build → Firestore Database → Create database** → Native mode → pick a
   region near you → any starting rules (we deploy our own in step 5).
3. **Build → Authentication → Get started → Sign-in method** → enable
   **Google** as a provider, set a support email (your own is fine).
4. **Project settings → Your apps → Add app → Web** (`</>` icon). Register
   it (any nickname), skip the hosting-setup prompt, and copy the
   `firebaseConfig` values it shows you — you'll need them in step 3 below.
5. **Upgrade to the Blaze (pay-as-you-go) plan** — bottom-left of Firebase
   Console, "Upgrade". Cloud Functions (2nd gen, what this repo uses)
   requires Blaze even though your actual usage stays inside the free tier
   at this volume (see [docs/ARCHITECTURE.md §10](docs/ARCHITECTURE.md#10-cost-estimate)).
   This is the one step where Firebase and Google Cloud billing are
   literally the same account — it'll ask you to link a billing account
   (a card on file), same as any GCP project. Nothing else in this setup
   needs the separate [Google Cloud Console](https://console.cloud.google.com/) —
   everything else here is fully covered by Firebase Console + CLI.

## 3. Configure the app

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

## 4. Point the Firebase CLI at your project

```bash
cd /path/to/home_app
cp .firebaserc.example .firebaserc
```

Edit `.firebaserc` and replace `your-firebase-project-id` with the project
id shown in Firebase Console → Project settings (or run `firebase use --add`
and pick it interactively instead).

## 5. Install dependencies

```bash
cd app && npm install && cd ..
cd functions && npm install && cd ..
```

## 6. Deploy

```bash
# Security rules + indexes first
firebase deploy --only firestore:rules,firestore:indexes

# Cloud Function (recomputes the dashboard on every transaction write)
firebase deploy --only functions

# Build and deploy the PWA
cd app && npm run build && cd ..
firebase deploy --only hosting
```

Firebase prints a Hosting URL like `https://<project-id>.web.app` — that's
the app.

## 7. Install it on your iPhone

Open the Hosting URL in **Safari** (not Chrome — only Safari exposes
"Add to Home Screen" on iOS), sign in with your Google account, then tap
the Share icon → **Add to Home Screen**. It now opens full-screen from your
home screen like an installed app.

## 8. Try it end-to-end

1. **Import** → upload a CSV export from your bank → confirm the column
   mapping (it guesses date/description/amount from common header names,
   English and Portuguese) → Import.
2. **Transactions** → assign a category + needed/discretionary to each
   imported row (they start flagged "needs review").
3. **Dashboard** → updates within a second or two of each save — the Cloud
   Function recomputes `dashboards/{month}` on every transaction write.
4. **Settings** → set your default salary and savings goal, and edit the
   default category list if you want different categories.

## Local development

```bash
cd app && npm run dev
```

This runs against your **real** Firestore/Auth (no emulator wired up yet)
— fine for a single-user personal project, just know that anything you do
in dev writes real data. `firebase emulators:start` covers Auth + Firestore
+ Functions fully offline if you'd rather develop against a sandbox.

## Cost

Everything here (Hosting, Firestore, Auth, one Cloud Function) sits inside
Firebase/GCP's always-free tier at single-user volume — see
[docs/ARCHITECTURE.md §10](docs/ARCHITECTURE.md#10-cost-estimate).

## What's next

- **Phase 1** — an ADK agent that categorizes imported transactions
  automatically (Gemini + the same `categoryRules` cache this phase already
  writes to from manual edits), still on manual CSV input.
- **Phase 2** — open banking sync, so statements land automatically instead
  of via CSV upload.
