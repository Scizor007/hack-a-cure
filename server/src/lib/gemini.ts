import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { SYSTEM_PROMPT } from "../prompts/systemPrompt.js";

export type GeminiAnswer = {
  answer: string;
  contexts: string[];
};

function buildModel() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY");
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          answer: { type: SchemaType.STRING },
          contexts: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        },
        required: ["answer", "contexts"],
      },
    },
  });
}

function coerceTopK(k: unknown, fallback = 5): number {
  const n = typeof k === "number" && Number.isFinite(k) ? Math.trunc(k) : fallback;
  return Math.max(0, Math.min(10, n));
}

function stripCodeFences(s: string): string {
  return s.replace(/^```(?:json)?\n?|```$/g, "").trim();
}

export async function answerWithGemini(
  userQuery: string,
  topK: number,
  timeoutMs = 55000
): Promise<GeminiAnswer> {
  const model = buildModel();

  const k = coerceTopK(topK);
  const timer = setTimeout(() => {/* timeout guard */}, timeoutMs);

  try {
    const prompt = `User question:\n${userQuery}\n\nK=${k}. Return at most K contexts.`;

    // Guard with a timeout using Promise.race for broader SDK compatibility
    const generation = model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out")), timeoutMs)
    );
    const result = await Promise.race([generation, timeoutPromise]);

    // With responseMimeType application/json, text() should be JSON
    const text = result.response.text();
    let parsed: GeminiAnswer | null = null;
    try {
      parsed = JSON.parse(stripCodeFences(text)) as GeminiAnswer;
    } catch (_e) {
      // Fallback: construct minimal shape
      parsed = { answer: text?.trim() || "", contexts: [] };
    }

    // Ensure shape and enforce topK
    const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
    const contextsArr = Array.isArray(parsed.contexts)
      ? parsed.contexts.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim())
      : [];

    return { answer, contexts: contextsArr.slice(0, k) };
  } finally {
    clearTimeout(timer);
  }
}
