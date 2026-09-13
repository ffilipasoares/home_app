import { GoogleGenAI, Type } from "@google/genai";
import type { CategoryDef } from "./types";

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

let client: GoogleGenAI | undefined;
function getClient(): GoogleGenAI {
  // Lazy singleton: constructing this reads env vars that may not be set
  // yet at module-load time in some test harnesses, and there's no reason
  // to pay for it on a cold start that never actually calls Gemini (a
  // categoryRules cache hit skips this file entirely).
  if (!client) {
    client = new GoogleGenAI({ vertexai: true, project: PROJECT, location: LOCATION });
  }
  return client;
}

/**
 * Asks Gemini to pick the best-fit category for one transaction from the
 * user's own category list. Structured output (responseSchema), never
 * free-text parsing — and the returned category id is checked against the
 * allowed list afterward, so a malformed or hallucinated response degrades
 * to "no confident answer" (returns null) rather than writing a category
 * that doesn't exist in Settings.
 */
export async function categorizeTransaction(
  merchant: string,
  amount: number,
  categories: CategoryDef[],
): Promise<CategorizationResult | null> {
  // Salary/Invest are categories the user assigns deliberately (they carry
  // special meaning for the money-left math) — never something to guess.
  const choices = categories.filter((c) => !c.special);
  if (choices.length === 0) return null;

  const categoryList = choices.map((c) => `- ${c.id}: ${c.label}`).join("\n");
  const prompt = [
    "Categorize this bank transaction into exactly one of the categories listed below.",
    `Merchant/description: "${merchant}"`,
    `Amount: ${amount} (negative = money out, positive = money in)`,
    "",
    "Categories (id: label):",
    categoryList,
    "",
    "Respond with the category id and your confidence (0 to 1) that it's correct.",
  ].join("\n");

  try {
    const response = await getClient().models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING, enum: choices.map((c) => c.id) },
            confidence: { type: Type.NUMBER },
          },
          required: ["category", "confidence"],
        },
      },
    });

    const text = response.text;
    if (!text) return null;
    const parsed = JSON.parse(text) as { category?: string; confidence?: number };
    if (!parsed.category || !choices.some((c) => c.id === parsed.category)) return null;
    const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
    return { category: parsed.category, confidence };
  } catch (err) {
    // Leaves the transaction uncategorized (needsReview stays true) —
    // there's no retry loop here, so a transient failure just means a
    // human confirms this one transaction instead of the agent.
    console.error("categorizeTransaction failed", err);
    return null;
  }
}
