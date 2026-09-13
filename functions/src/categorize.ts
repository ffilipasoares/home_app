import { Agent, FunctionTool, Gemini, InMemoryRunner } from "@google/adk";
import { z } from "zod";
import type { CategoryDef, CategoryRule } from "./types";

/**
 * A well-established, GA, cheap model — deliberately not the newest Flash-
 * Lite tier this project's architecture doc names as the long-run target
 * (docs/ARCHITECTURE.md §3.2), because that model's exact Vertex AI
 * resource id wasn't something to guess at rather than verify. Bump this
 * once you've confirmed the id you want in Vertex AI Model Garden — no
 * other code needs to change.
 */
const MODEL = process.env.CATEGORIZATION_MODEL || "gemini-2.5-flash-lite";
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
const LOCATION = process.env.VERTEX_LOCATION || "us-central1";

export const CONFIDENCE_THRESHOLD = 0.7;

export type CategorizationResult = { category: string; confidence: number };

/** Hard cap on tool-call rounds for one categorization run — a safety net against a pathological non-converging loop, not a limit this task should ever actually hit. */
const MAX_EVENTS = 20;

/**
 * A real ADK agent — not a bare structured-output call. It decides for
 * itself, via tools it can choose to call or skip, how to arrive at an
 * answer: it may consult how similar merchants were categorized before
 * (recentRules — useful precisely because "UBER EATS" has no exact-match
 * rule but "UBER" -> Transport does, a judgment a rigid lookup can't make),
 * then commits its final answer through a tool call rather than free text.
 * This is the standard ADK tool-calling loop (LlmAgent + FunctionTool +
 * Runner) — see docs/ARCHITECTURE.md §5 for why this replaced a plain
 * `generateContent` call.
 *
 * Called only on a confirmed cache miss (see categoryRules.ts,
 * findExactCategoryRule) — an exact match is a deterministic lookup with
 * nothing to reason about, so it's checked before this and never costs a
 * model call.
 */
export async function categorizeTransaction(
  merchant: string,
  amount: number,
  categories: CategoryDef[],
  recentRules: CategoryRule[],
): Promise<CategorizationResult | null> {
  const choices = categories.filter((c) => !c.special);
  if (choices.length === 0) return null;

  let captured: CategorizationResult | undefined;

  const historyTool = new FunctionTool({
    name: "list_recently_categorized_merchants",
    description:
      "Returns merchants confirmed before and the category each was assigned, in case this transaction's merchant is similar to one of them. Call this if the merchant name doesn't obviously match a category on its own.",
    execute: () =>
      recentRules.map((r) => ({ merchant: r.merchantNormalized, category: r.category })),
  });

  const recordTool = new FunctionTool({
    name: "record_categorization",
    description:
      "Submits your final answer: exactly one category id from the list you were given, and your confidence (0 to 1) that it's correct. Call this exactly once, as your last step.",
    parameters: z.object({
      category: z.enum(choices.map((c) => c.id) as [string, ...string[]]),
      confidence: z.number().min(0).max(1),
    }),
    execute: ({ category, confidence }) => {
      captured = { category, confidence };
      return { acknowledged: true };
    },
  });

  const categoryList = choices.map((c) => `- ${c.id}: ${c.label}`).join("\n");
  const agent = new Agent({
    name: "transaction_categorizer",
    model: new Gemini({ model: MODEL, vertexai: true, project: PROJECT, location: LOCATION }),
    instruction: [
      "You categorize one bank transaction at a time for a personal finance app.",
      "You may call list_recently_categorized_merchants if this merchant looks similar to one",
      "categorized before (e.g. the same company, a different branch/reference number).",
      "Then pick the single best-fitting category from the list below and call",
      "record_categorization with your choice and an honest confidence score (0 to 1).",
      "Call record_categorization exactly once, as your final step.",
      "Never invent a category id that isn't in the list below.",
      "",
      "Categories (id: label):",
      categoryList,
    ].join("\n"),
    tools: [historyTool, recordTool],
  });

  try {
    // Ephemeral/in-memory: each categorization is one independent, stateless
    // decision — there's no conversation to persist across calls, so a
    // durable SessionService (Firestore- or Vertex-backed) would just be
    // overhead with nothing to keep.
    const runner = new InMemoryRunner({ agent });
    let events = 0;
    for await (const _event of runner.runEphemeral({
      userId: "categorizer",
      newMessage: {
        parts: [
          {
            text: `Merchant/description: "${merchant}"\nAmount: ${amount} (negative = money out, positive = money in)`,
          },
        ],
      },
    })) {
      events += 1;
      if (events > MAX_EVENTS) break; // never expected to trip — see MAX_EVENTS
    }
  } catch (err) {
    console.error("categorizeTransaction agent run failed", err);
    return null;
  }

  if (!captured || !choices.some((c) => c.id === captured!.category)) return null;
  return { category: captured.category, confidence: Math.max(0, Math.min(1, captured.confidence)) };
}
