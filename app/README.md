# app

The PWA frontend (React + Vite + TypeScript). See the repo root
[README.md](../README.md) and [SETUP.md](../SETUP.md) for what this is and
how to configure/deploy it — this folder has no separate setup of its own
beyond `npm install`.

```bash
npm install
npm run dev     # local dev server, talks to your real Firebase project
npm run build   # production build -> dist/, deployed via `firebase deploy --only hosting`
npm run lint
```
