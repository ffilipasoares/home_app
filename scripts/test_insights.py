#!/usr/bin/env python3
"""Dev-only script to exercise the "ask your finances" agent directly —
no Firestore emulator, no deployed callable, just the agent against your
real Firestore data (it still reads real data, so use a real uid/project).

Setup (once):
    gcloud auth application-default login
    gcloud config set project <your-firebase-project-id>

Run:
    cd functions && source venv/bin/activate && cd ..
    GOOGLE_CLOUD_PROJECT=<your-firebase-project-id> python3 scripts/test_insights.py <your-uid> "How was this month?"

Find your uid in Firebase Console -> Authentication -> Users, or the
`users/{uid}` document id in Firestore.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "functions"))

import firebase_admin  # noqa: E402

firebase_admin.initialize_app()

from insights import answer_question  # noqa: E402


async def main() -> None:
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <uid> <question>")
        sys.exit(1)
    uid, question = sys.argv[1], " ".join(sys.argv[2:])
    answer = await answer_question(uid, question, [])
    print(answer)


if __name__ == "__main__":
    asyncio.run(main())
