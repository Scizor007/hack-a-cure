# Hack-a-Cure Query API (Gemini-backed)

A minimal Express + TypeScript service that implements the required POST endpoint and forwards questions to Google Gemini (no RAG). Returns the exact shape:

```json
{
  "answer": "string",
  "contexts": ["string", "..."]
}
```

## API Contract

- Method: POST
- URL: /query (deploy this as your `submission_url`)
- Request (application/json):
  ```json
  { "query": "string", "top_k": 5 }
  ```
- Response (application/json):
  ```json
  { "answer": "string", "contexts": ["string", "..."] }
  ```
- Timeout: 60s enforced server-side
- Status: 200 on success; 4xx for bad input; 503/504 on upstream/timeout errors

## How it works

- No retrieval is performed. The service sends your question to Gemini with a strong system prompt that:
  - enforces a concise, faithful answer
  - asks for up to `top_k` short supporting context snippets
  - enforces strict JSON output via response schema
- The service returns the `answer` and `contexts` as-is (sliced to `top_k`).

## Folder Structure

```
server/
  .env.example           # Template for secrets
  package.json           # Scripts and deps
  tsconfig.json          # TS config
  .gitignore             # Ignores build artifacts and env
  README.md              # This file
  src/
    index.ts             # Express app and /query route
    lib/
      gemini.ts          # Gemini client and structured output
    prompts/
      systemPrompt.ts    # System instruction for Gemini
```

## Prerequisites

- Node.js 18+
- A Google Generative AI API key

## Setup (Windows PowerShell)

```powershell
# From the server/ folder
copy .env.example .env
# Edit .env and set GOOGLE_API_KEY

# Install dependencies
npm install

# Start in dev mode (auto-reload)
npm run dev

# Or build and run
npm run build
node dist/index.js
```

The server listens on http://localhost:3000 by default. Set `PORT` in `.env` to change.

## Example Request

```powershell
curl -X POST http://localhost:3000/query `
  -H "Content-Type: application/json" `
  -d '{"query":"When to give Tdap booster?","top_k":3}'
```

Example response:
```json
{
  "answer": "Tdap booster is recommended once every 10 years in adulthood.",
  "contexts": [
    "Adults should receive a Td or Tdap booster every 10 years.",
    "A single Tdap dose is recommended in adulthood, with Td or Tdap thereafter."
  ]
}
```

## Notes

- The service enforces a 60s timeout window. Upstream calls use a ~55s abort to ensure room for response.
- If the model returns invalid JSON, the service falls back to a minimal shape with an empty `contexts` array.
- To maximize scoring:
  - keep `top_k` small (3–5)
  - ask focused questions
  - ensure `GOOGLE_API_KEY` is valid

## Deploy to Render

You have two easy options.

### Option A — Render Blueprint (render.yaml)

This repo includes a `render.yaml` at the repo root so Render can auto-provision the service from the `server/` folder.

Steps:
1. Push this repo to GitHub.
2. In Render, click New → Blueprint.
3. Connect your GitHub repo and select the branch.
4. Review the plan. The blueprint sets:
  - rootDir: `server`
  - buildCommand: `npm install && npm run build`
  - startCommand: `node dist/index.js`
  - healthCheckPath: `/health`
5. Before deploy, add an Environment Variable:
  - `GOOGLE_API_KEY` = your Google Generative AI API key
  (Do not set `PORT`; Render injects it automatically.)
6. Deploy. Your public URL will be shown in the dashboard.

### Option B — Manual Web Service

1. Push this repo to GitHub.
2. In Render, click New → Web Service.
3. Choose your repo and branch.
4. Environment = Node, Build Command:
  - `npm install && npm run build`
5. Start Command:
  - `node dist/index.js`
6. If using a monorepo, under Advanced, set Root Directory to `server`.
7. Add Environment Variable:
  - `GOOGLE_API_KEY` = your key
8. Save & Deploy.

Health check: Render will GET `/health` to confirm the app is up.

After deploy, test your public endpoint:

```powershell
curl.exe -sS -X POST "https://<your-render-subdomain>.onrender.com/query" `
  -H "Content-Type: application/json" `
  --data-binary '{"query":"When to give Tdap booster?","top_k":3}'
```

Or with PowerShell-native:

```powershell
$body = @{ query = "When to give Tdap booster?"; top_k = 3 } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "https://<your-render-subdomain>.onrender.com/query" -Method Post -ContentType "application/json" -Body $body
```
