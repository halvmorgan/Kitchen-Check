import { GoogleGenAI } from "@google/genai";
import "dotenv/config";

export interface Finding {
  title: string;
  category: "Cabinetry" | "Countertops" | "Layout" | "Finishes & Wear" | "Fixtures & Lighting";
  severity: "Low" | "Medium" | "High";
  detail: string;
}

export interface RoomAnalysisResult {
  score: number;
  roomType: string;
  styleEra: string;
  verdict: string;
  findings: Finding[];
  positives: string[];
  concerns: string[];
  costRange: string;
  costNote: string;
  bottomLine: string;
}

const PROMPT_INSTRUCTION = `You are an experienced kitchen and bath designer giving a friendly first look at one photo for a remodeling company. Describe ONLY what is clearly visible. Never invent problems or damage. If something cannot be judged from this photo (angle, lighting, clutter, partial view), say so plainly. If the photo is not a kitchen or bathroom, say that in the verdict and bottomLine and keep scores cautious. Do not state any home value, resale value or dollar amount of lost value; only describe general buyer appeal. Never comment on people who may appear in the photo. Give a realistic US remodel price ballpark in USD for this room type and the scope that fits what you see (e.g. refresh vs. mid-range vs. full remodel). Respond ONLY with raw JSON, no markdown, matching exactly:
{
 "score": number 0-100 (100 = fully modern, 0 = very dated),
 "roomType": string (e.g. "Kitchen", "Bathroom"),
 "styleEra": string (e.g. "Early-2000s Tuscan", "1990s builder-grade oak"),
 "verdict": string (short, e.g. "Fresh & Current", "Showing Its Age", "Ready for a Refresh", "Time for a Remodel"),
 "findings": [ { "title": string, "category": "Cabinetry" | "Countertops" | "Layout" | "Finishes & Wear" | "Fixtures & Lighting", "severity": "Low" | "Medium" | "High", "detail": string } ] (exactly 3),
 "positives": [string] (2-3),
 "concerns": [string] (2-3),
 "costRange": string (dollar range only, e.g. "$28,000–$55,000"),
 "costNote": string (the scope that range assumes, one short line),
 "bottomLine": string (exactly 2 sentences)
}`;

const MODELS = [
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-flash-lite-latest'
];

const RETRY_DELAYS = [0, 1500, 4000];

function isBusyError(err: unknown): boolean {
  if (!err) return false;
  const errorObj = err as Record<string, unknown>;
  const status = errorObj.status || errorObj.statusCode || errorObj.code;
  if (status === 503 || status === 429) return true;
  const msg = String(errorObj.message || err).toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('unavailable') ||
    msg.includes('resource_exhausted') ||
    msg.includes('overloaded') ||
    msg.includes('high demand')
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function analyzeRoom(base64Data: string, mimeType = 'image/jpeg'): Promise<RoomAnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY environment variable");
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Strip any data url prefix if present
  let cleanBase64 = base64Data;
  if (cleanBase64.includes(',')) {
    cleanBase64 = cleanBase64.split(',')[1];
  }
  cleanBase64 = cleanBase64.trim();

  let cleanMime = mimeType || 'image/jpeg';
  if (cleanMime.startsWith('data:')) {
    const extracted = cleanMime.split(';')[0].replace('data:', '');
    if (extracted) cleanMime = extracted;
  }

  let lastError: Error | null = null;
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
                data: cleanBase64,
              },
            },
            {
              text: PROMPT_INSTRUCTION,
            },
          ],
          config: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        });

        const rawText = response.text || "";
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
          throw new Error("Invalid response format received from room scan");
        }

        const jsonStr = rawText.substring(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(jsonStr) as RoomAnalysisResult;

        // Basic sanity enforcement
        if (typeof parsed.score !== 'number' || isNaN(parsed.score)) {
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
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (isBusyError(err)) {
          // Busy error, retry this model up to 3 times
          if (attempt === RETRY_DELAYS.length - 1) {
            // Reached max retries for this model, move to next model
            break;
          }
          continue;
        } else {
          // Non-busy error (e.g. model not found, client error), move to next model immediately
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
