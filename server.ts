import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { analyzeRoom, deliverLead, foundingStatus, requestDemo, ownerAccess, claimRoomCheck } from './src/server/analyze.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '30mb' }));

const clientIp = (req: express.Request) => String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();

// Free demo: name + company + email -> one room check
app.post('/api/demo-request', async (req, res) => {
  res.json(await requestDemo(req.body, clientIp(req)));
});
// Owner passcode -> unlimited demos
app.post('/api/owner-access', async (req, res) => {
  res.json(await ownerAccess(req.body, clientIp(req)));
});

// Errors are sent as 200 + { error } because the AI Studio preview replaces error pages.
app.post('/api/analyze-room', async (req, res) => {
  const { base64, mimeType } = req.body || {};
  if (!base64) {
    return res.json({ error: 'No image data provided' });
  }
  const claim = await claimRoomCheck(String(req.headers['x-kc-token'] || ''));
  if (!claim.ok) return res.json(claim);
  try {
    const result = await analyzeRoom(base64, mimeType);
    return res.json(result);
  } catch (err: unknown) {
    await claim.refund();
    const message = err instanceof Error ? err.message : 'Room analysis failed';
    return res.json({ error: message });
  }
});

// Lead delivery to GoHighLevel (see src/server/analyze.ts for secrets)
app.post('/api/lead', async (req, res) => {
  const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  res.json(await deliverLead(req.body, ip));
});

// Founding-price counter (used by ecentraconcierge.com/kitchen-check)
app.get('/api/founding', async (_req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'no-store');
  res.json(await foundingStatus());
});

// Serve production static assets from dist
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${port}`);
});
