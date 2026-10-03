import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { analyzeRoom, deliverLead, foundingStatus, requestDemo, ownerAccess, claimRoomCheck } from './src/server/analyze.ts';

function roomAnalysisDevPlugin(): Plugin {
  return {
    name: 'room-analysis-dev-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/lead' && req.method === 'POST') {
          const chunks: Buffer[] = [];
          req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          req.on('end', async () => {
            let body: any = {};
            try { body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}'); } catch { body = {}; }
            const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
            const result = await deliverLead(body, ip);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          });
          return;
        }
        if ((req.url === '/api/demo-request' || req.url === '/api/owner-access') && req.method === 'POST') {
          const chunks: Buffer[] = [];
          req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          req.on('end', async () => {
            let body: any = {};
            try { body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}'); } catch { body = {}; }
            const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
            const result = req.url === '/api/demo-request' ? await requestDemo(body, ip) : await ownerAccess(body, ip);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          });
          return;
        }
        if (req.url === '/api/founding' && req.method === 'GET') {
          foundingStatus().then((result) => {
            res.statusCode = 200;
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          });
          return;
        }
        if (req.url === '/api/analyze-room' && req.method === 'POST') {
          const chunks: Buffer[] = [];
          req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          req.on('end', async () => {
            try {
              const bodyStr = Buffer.concat(chunks).toString('utf-8');
              const { base64, mimeType } = JSON.parse(bodyStr);
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              if (!base64) {
                res.end(JSON.stringify({ error: 'No image data provided' }));
                return;
              }
              const claim = await claimRoomCheck(String(req.headers['x-kc-token'] || ''));
              if (!claim.ok) {
                res.end(JSON.stringify(claim));
                return;
              }
              try {
                const result = await analyzeRoom(base64, mimeType);
                res.end(JSON.stringify(result));
              } catch (e: unknown) {
                await claim.refund();
                throw e;
              }
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Room analysis failed';
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: message }));
            }
          });
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), roomAnalysisDevPlugin()],
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

