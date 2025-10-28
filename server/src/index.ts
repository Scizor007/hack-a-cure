import dotenv from "dotenv";
import path from "path";
import express, { Request, Response, NextFunction } from "express";
import { answerWithGemini } from "./lib/gemini";

// Load .env from the project root (one level up from compiled dist folder)
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const app = express();
app.use(express.json({ limit: "1mb" }));

// Ensure request timeouts don't exceed 60s
app.use((req: Request, res: Response, next: NextFunction) => {
  // Node.js / Express default is higher; enforce 60s overall
  req.setTimeout(60000);
  res.setTimeout(60000);
  next();
});

// Health endpoint (optional)
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// Debug: list available Gemini models (helps choose a valid model ID for this API key)
app.get("/debug/models", async (_req: Request, res: Response) => {
  try {
    const key = process.env.GOOGLE_API_KEY;
    if (!key) return res.status(500).json({ error: "missing_api_key" });
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const json = await resp.json();
    res.status(resp.ok ? 200 : 502).json(json);
  } catch (e: any) {
    res.status(502).json({ error: "model_list_error", message: e?.message || String(e) });
  }
});

// POST /query per evaluator spec
app.post("/query", async (req: Request, res: Response) => {
  try {
    const { query, top_k } = req.body || {};
    if (!query || typeof query !== "string" || !query.trim()) {
      return res.status(400).json({ error: "query is required" });
    }
    const k = Number.isInteger(top_k) ? (top_k as number) : 5;

    const { answer, contexts } = await answerWithGemini(query, k, 55000);

    // Success shape: { answer: string, contexts: string[] }
    return res.status(200).json({ answer, contexts });
  } catch (err: any) {
    const message =
      (err && (err.message || err.toString())) || "Unexpected error";
    const status = message.includes("abort") ? 504 : 503;
    return res.status(status).json({ error: "upstream_error", message });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
