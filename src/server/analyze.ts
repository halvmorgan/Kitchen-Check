import { GoogleGenAI } from "@google/genai";
import "dotenv/config";
import crypto from "crypto";
import { Firestore } from "@google-cloud/firestore";

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


// ---------------------------------------------------------------------------
// Lead delivery: send each consult request to GoHighLevel.
// Secrets (AI Studio > Secrets): GHL_PRIVATE_TOKEN (required), GHL_LOCATION_ID (optional),
// LEAD_TAG (optional). For a paying client's copy, use THEIR token and location ID.
// ---------------------------------------------------------------------------
const GHL_API = 'https://services.leadconnectorhq.com';
const GHL_DEFAULT_LOCATION = '8wtMUEAdUnx0Y7nVe93R'; // Ecentra Concierge
const leadHits = new Map<string, number[]>();

function clip(v: unknown, max: number): string {
  return String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

async function ghl(pathname: string, token: string, body: unknown): Promise<any> {
  const r = await fetch(GHL_API + pathname, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Version: '2021-07-28',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!r.ok) throw new Error(`GHL ${pathname} ${r.status}: ${text.slice(0, 300)}`);
  return data;
}

export async function deliverLead(body: any, ip: string): Promise<Record<string, unknown>> {
  try {
    const now = Date.now();
    const hits = (leadHits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
    if (hits.length >= 8) return { ok: false, error: 'Too many requests. Please try again later.' };
    hits.push(now);
    leadHits.set(ip, hits);

    const b = body || {};
    if (b.website) return { ok: true }; // honeypot
    const name = clip(b.name, 100);
    const phone = clip(b.phone, 30);
    const email = clip(b.email, 120);
    if (!name || phone.replace(/\D/g, '').length < 10 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'Please check your name, phone and email.' };
    }
    const r = b.report || {};
    const note = [
      'Kitchen Check request',
      `Room: ${clip(r.roomType, 60)} | Style: ${clip(r.styleEra, 80)}`,
      `Modern Score: ${clip(r.score, 5)}/100 (${clip(r.verdict, 60)})`,
      `Price ballpark: ${clip(r.costRange, 60)} ${clip(r.costNote, 120)}`,
      `Bottom line: ${clip(r.bottomLine, 400)}`,
      `Page: ${clip(b.page, 200)}`,
      'Consent: agreed to be contacted by phone, text or email.',
    ].join('\n');

    const token = process.env.GHL_PRIVATE_TOKEN;
    if (!token) {
      console.warn('[lead] GHL_PRIVATE_TOKEN not set; lead not delivered:', name, email);
      return { ok: true, delivered: false, reason: 'not configured' };
    }
    const parts = name.split(/\s+/);
    const up = await ghl('/contacts/upsert', token, {
      locationId: process.env.GHL_LOCATION_ID || GHL_DEFAULT_LOCATION,
      name,
      firstName: parts[0],
      lastName: parts.slice(1).join(' ') || undefined,
      email,
      phone,
      source: 'Kitchen Check',
      tags: [process.env.LEAD_TAG || 'kitchen check demo'],
    });
    const contactId = up?.contact?.id;
    if (contactId) {
      try { await ghl(`/contacts/${contactId}/notes`, token, { body: note }); } catch (e) { console.warn('[lead] note failed', e); }
    }
    return { ok: true, delivered: Boolean(contactId) };
  } catch (err) {
    console.error('[lead] failed', err);
    return { ok: false, error: 'Could not send right now.' };
  }
}

// ---------------------------------------------------------------------------
// Founding-price counter for ecentraconcierge.com/kitchen-check.
// Secret: STRIPE_READ_KEY (restricted key, Payment Links = Read only).
// ---------------------------------------------------------------------------
const FOUNDING_LINK_ID = 'plink_1ULgygLBhUGNbXujmlV8jdvY';
const FOUNDING_LIMIT = 5;
let foundingCache: { at: number; data: Record<string, unknown> } | null = null;

export async function foundingStatus(): Promise<Record<string, unknown>> {
  try {
    if (foundingCache && Date.now() - foundingCache.at < 60 * 1000) return foundingCache.data;
    const key = process.env.STRIPE_READ_KEY;
    if (!key) return { configured: false, limit: FOUNDING_LIMIT };
    const r = await fetch(`https://api.stripe.com/v1/payment_links/${FOUNDING_LINK_ID}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) return { configured: true, error: `stripe ${r.status}`, limit: FOUNDING_LIMIT };
    const link: any = await r.json();
    const limit = Number(link?.restrictions?.completed_sessions?.limit) || FOUNDING_LIMIT;
    const sold = Number(link?.restrictions?.completed_sessions?.count) || 0;
    const data = { configured: true, limit, sold, left: Math.max(0, limit - sold), active: Boolean(link?.active) };
    foundingCache = { at: Date.now(), data };
    return data;
  } catch {
    return { configured: true, error: 'unavailable', limit: FOUNDING_LIMIT };
  }
}


// ======================================================================
// Free demo gate: each remodeler gets ONE free room check (name + company + email).
// The owner passcode (APP_ACCESS_PASSCODE secret) gets unlimited demos (50/day).
// Stored in Firestore database "default": kc_tokens (by token hash) and kc_leads (by email hash).
// ======================================================================
const KC_TOKENS = 'kc_tokens';
const KC_LEADS = 'kc_leads';
const DEMO_TTL_MS = 48 * 60 * 60 * 1000;
const OWNER_TTL_MS = 12 * 60 * 60 * 1000;
const OWNER_DAILY = 50;
let _kcdb: Firestore | null = null;
const kcdb = () => (_kcdb ??= new Firestore({ databaseId: process.env.FIRESTORE_DATABASE_ID || 'default', ignoreUndefinedProperties: true }));
const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const today = () => new Date().toISOString().slice(0, 10);
const demoIpHits = new Map<string, { count: number; day: string }>();
const ownerTries = new Map<string, { count: number; first: number }>();
const str = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
const USED = 'You have already used your free room check. See the founding offer below, or contact Ecentra Concierge.';

type TokenDoc = { role: 'demo' | 'owner'; uses: number; maxUses: number; expiresAt: number; day?: string; email?: string };

const newToken = async (doc: TokenDoc) => {
  const token = crypto.randomBytes(32).toString('hex');
  await kcdb().collection(KC_TOKENS).doc(sha(token)).set({ ...doc, createdAt: Date.now() });
  return token;
};

export async function requestDemo(body: any, ip: string): Promise<Record<string, unknown>> {
  const name = str(body?.name, 80);
  const company = str(body?.company, 120);
  const email = str(body?.email, 160).toLowerCase();
  const phone = str(body?.phone, 40);
  const offer = body?.offer === 'b' ? 'b' : 'a';
  if (!name || !company) return { ok: false, error: 'Please enter your name and company.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: 'Please enter a valid email address.' };
  const hit = demoIpHits.get(ip);
  if (hit && hit.day === today() && hit.count >= 3) {
    return { ok: false, error: 'Too many demo requests from this connection today. Please try again tomorrow.' };
  }
  try {
    const leadRef = kcdb().collection(KC_LEADS).doc(sha(email));
    const lead = await leadRef.get();
    if (lead.exists) {
      const prev = lead.data() as { tokenHash?: string };
      if (prev.tokenHash) {
        const t = await kcdb().collection(KC_TOKENS).doc(prev.tokenHash).get();
        const td = t.data() as TokenDoc | undefined;
        if (td && td.uses >= td.maxUses) return { ok: false, demoUsed: true, error: USED };
        if (t.exists) await t.ref.update({ maxUses: 0 }); // retire the old unused token
      }
    }
    const token = await newToken({ role: 'demo', uses: 0, maxUses: 1, expiresAt: Date.now() + DEMO_TTL_MS, email });
    await leadRef.set(
      { name, company, email, phone, offer, tokenHash: sha(token), createdAt: lead.exists ? (lead.data() as any).createdAt : Date.now(), lastRequestAt: Date.now(), ip },
      { merge: true }
    );
    demoIpHits.set(ip, { count: (hit && hit.day === today() ? hit.count : 0) + 1, day: today() });
    return { ok: true, token, role: 'demo' };
  } catch (e: unknown) {
    console.error('[kc demo] request failed:', (e as Error)?.message);
    return { ok: false, error: 'Free demos are not available right now. Please try again later.' };
  }
}

export async function ownerAccess(body: any, ip: string): Promise<Record<string, unknown>> {
  const expected = (process.env.APP_ACCESS_PASSCODE || '').trim();
  if (!expected) return { ok: false, error: 'Owner access is not set up.' };
  const now = Date.now();
  const a = ownerTries.get(ip);
  if (a && now - a.first < 15 * 60 * 1000 && a.count >= 10) return { ok: false, error: 'Too many tries. Please wait 15 minutes.' };
  const given = str(body?.passcode, 200);
  const ok = given.length > 0 && crypto.timingSafeEqual(Buffer.from(sha(given)), Buffer.from(sha(expected)));
  if (!ok) {
    if (!a || now - a.first >= 15 * 60 * 1000) ownerTries.set(ip, { count: 1, first: now });
    else a.count++;
    return { ok: false, error: 'Incorrect code.' };
  }
  ownerTries.delete(ip);
  try {
    const token = await newToken({ role: 'owner', uses: 0, maxUses: OWNER_DAILY, expiresAt: now + OWNER_TTL_MS, day: today() });
    return { ok: true, token, role: 'owner' };
  } catch (e: unknown) {
    console.error('[kc owner] failed:', (e as Error)?.message);
    return { ok: false, error: 'Not available right now. Please try again later.' };
  }
}

// Use up one room check before analyzing. Returns refund() to give it back if the analysis fails.
export async function claimRoomCheck(token: string): Promise<{ ok: true; refund: () => Promise<void> } | { ok: false; [k: string]: unknown }> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return { ok: false, authRequired: true, error: 'Please start your free demo first.' };
  const ref = kcdb().collection(KC_TOKENS).doc(sha(token));
  try {
    const result = await kcdb().runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists) return { ok: false, authRequired: true, error: 'Please start your free demo first.' };
      const d = snap.data() as TokenDoc;
      if (Date.now() > d.expiresAt) return { ok: false, authRequired: true, error: 'Your demo access has expired. Please start again.' };
      let uses = d.uses || 0;
      if (d.role === 'owner' && d.day !== today()) uses = 0;
      if (uses >= d.maxUses) {
        return d.role === 'owner'
          ? { ok: false, error: 'Daily limit reached. Please try again tomorrow.' }
          : { ok: false, demoUsed: true, error: USED };
      }
      t.update(ref, { uses: uses + 1, day: today(), lastUsedAt: Date.now() });
      return { ok: true };
    });
    if (!result.ok) return result as { ok: false };
    return {
      ok: true,
      refund: async () => {
        try {
          await kcdb().runTransaction(async (t) => {
            const s = await t.get(ref);
            const d = s.data() as TokenDoc | undefined;
            if (d && d.uses > 0) t.update(ref, { uses: d.uses - 1 });
          });
        } catch (e: unknown) {
          console.error('[kc demo] refund failed:', (e as Error)?.message);
        }
      },
    };
  } catch (e: unknown) {
    console.error('[kc demo] claim failed:', (e as Error)?.message);
    return { ok: false, error: 'The room check is not available right now. Please try again later.' };
  }
}
