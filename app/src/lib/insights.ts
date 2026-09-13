import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

export type ChatTurn = { role: "user" | "assistant"; text: string };

type AskQuestionRequest = { question: string; history: ChatTurn[] };
type AskQuestionResponse = { answer: string };

const askQuestionCallable = httpsCallable<AskQuestionRequest, AskQuestionResponse>(functions, "ask_question");

/**
 * Calls the finance_assistant agent (functions/insights.py). No server-
 * side session — `history` is this chat's transcript so far, resent each
 * time; the backend is stateless per call (see docs/ARCHITECTURE.md §13).
 * Capped here too so a long-running chat doesn't grow the request
 * indefinitely — the backend caps it again defensively either way.
 */
export async function askQuestion(question: string, history: ChatTurn[]): Promise<string> {
  const result = await askQuestionCallable({ question, history: history.slice(-8) });
  return result.data.answer;
}
