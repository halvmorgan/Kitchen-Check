import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { analyzeRoom } from './src/server/analyze.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '30mb' }));

app.post('/api/analyze-room', async (req, res) => {
  try {
    const { base64, mimeType } = req.body;
    if (!base64) {
      return res.status(400).json({ error: 'No image data provided' });
    }
    const result = await analyzeRoom(base64, mimeType);
    return res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Room analysis failed';
    return res.status(500).json({ error: message });
  }
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
