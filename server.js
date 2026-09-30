// server.ts
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

// src/server/analyze.ts
import { GoogleGenAI } from "@google/genai";
import "dotenv/config";
var PROMPT_INSTRUCTION = `You are an experienced kitchen and bath designer giving a friendly first look at one photo for a remodeling company. Describe ONLY what is clearly visible. Never invent problems or damage. If something cannot be judged from this photo (angle, lighting, clutter, partial view), say so plainly. If the photo is not a kitchen or bathroom, say that in the verdict and bottomLine and keep scores cautious. Do not state any home value, resale value or dollar amount of lost value; only describe general buyer appeal. Never comment on people who may appear in the photo. Give a realistic US remodel price ballpark in USD for this room type and the scope that fits what you see (e.g. refresh vs. mid-range vs. full remodel). Respond ONLY with raw JSON, no markdown, matching exactly:
{
 "score": number 0-100 (100 = fully modern, 0 = very dated),
 "roomType": string (e.g. "Kitchen", "Bathroom"),
 "styleEra": string (e.g. "Early-2000s Tuscan", "1990s builder-grade oak"),
 "verdict": string (short, e.g. "Fresh & Current", "Showing Its Age", "Ready for a Refresh", "Time for a Remodel"),
 "findings": [ { "title": string, "category": "Cabinetry" | "Countertops" | "Layout" | "Finishes & Wear" | "Fixtures & Lighting", "severity": "Low" | "Medium" | "High", "detail": string } ] (exactly 3),
 "positives": [string] (2-3),
 "concerns": [string] (2-3),
 "costRange": string (dollar range only, e.g. "$28,000\u2013$55,000"),
 "costNote": string (the scope that range assumes, one short line),
 "bottomLine": string (exactly 2 sentences)
}`;
var MODELS = [
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-flash-lite-latest"
];
var RETRY_DELAYS = [0, 1500, 4e3];
function isBusyError(err) {
  if (!err) return false;
  const errorObj = err;
  const status = errorObj.status || errorObj.statusCode || errorObj.code;
  if (status === 503 || status === 429) return true;
  const msg = String(errorObj.message || err).toLowerCase();
  return msg.includes("503") || msg.includes("429") || msg.includes("unavailable") || msg.includes("resource_exhausted") || msg.includes("overloaded") || msg.includes("high demand");
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function analyzeRoom(base64Data, mimeType = "image/jpeg") {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable");
  }
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
  let cleanBase64 = base64Data;
  if (cleanBase64.includes(",")) {
    cleanBase64 = cleanBase64.split(",")[1];
  }
  cleanBase64 = cleanBase64.trim();
  let cleanMime = mimeType || "image/jpeg";
  if (cleanMime.startsWith("data:")) {
    const extracted = cleanMime.split(";")[0].replace("data:", "");
    if (extracted) cleanMime = extracted;
  }
  let lastError = null;
  let allFailuresWereBusy = true;
  for (const modelName of MODELS) {
    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      const waitTime = RETRY_DELAYS[attempt];
      if (waitTime > 0) {
        await delay(waitTime);
      }
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              inlineData: {
                mimeType: cleanMime,
                data: cleanBase64
              }
            },
            {
              text: PROMPT_INSTRUCTION
            }
          ],
          config: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        });
        const rawText = response.text || "";
        const firstBrace = rawText.indexOf("{");
        const lastBrace = rawText.lastIndexOf("}");
        if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
          throw new Error("Invalid response format received from room scan");
        }
        const jsonStr = rawText.substring(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(jsonStr);
        if (typeof parsed.score !== "number" || isNaN(parsed.score)) {
          parsed.score = 50;
        } else {
          parsed.score = Math.max(0, Math.min(100, Math.round(parsed.score)));
        }
        if (!Array.isArray(parsed.findings)) {
          parsed.findings = [];
        }
        if (!Array.isArray(parsed.positives)) {
          parsed.positives = [];
        }
        if (!Array.isArray(parsed.concerns)) {
          parsed.concerns = [];
        }
        return parsed;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (isBusyError(err)) {
          if (attempt === RETRY_DELAYS.length - 1) {
            break;
          }
          continue;
        } else {
          allFailuresWereBusy = false;
          break;
        }
      }
    }
  }
  if (allFailuresWereBusy) {
    throw new Error("Our room scanner is very busy right now. Please wait a minute and try again.");
  }
  throw new Error(lastError?.message || "Room analysis failed. Please try again with another photo.");
}

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var port = parseInt(process.env.PORT || "3000", 10);
app.use(express.json({ limit: "30mb" }));
app.post("/api/analyze-room", async (req, res) => {
  try {
    const { base64, mimeType } = req.body;
    if (!base64) {
      return res.status(400).json({ error: "No image data provided" });
    }
    const result = await analyzeRoom(base64, mimeType);
    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Room analysis failed";
    return res.status(500).json({ error: message });
  }
});
var distPath = path.join(__dirname, "dist");
app.use(express.static(distPath));
app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});
app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on http://0.0.0.0:${port}`);
});
