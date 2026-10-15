import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config, geminiEnabled } from './config.js';
import { Engine } from './services/engine.js';
import { searchPlaces } from './services/geocode.js';
import { TTLCache } from './lib/net.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const PUBLIC_DIR = path.join(config.root, 'public');

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('cache-control', 'no-store');
  res.end(body);
}

function sendStatic(res, filePath) {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(PUBLIC_DIR))) {
    sendJson(res, 403, { error: 'forbidden' });
    return;
  }
  fs.readFile(resolved, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: 'not found' });
      return;
    }
    const type = MIME[path.extname(resolved)] || 'application/octet-stream';
    const isImage = /\.(jpg|jpeg|png|webp|avif|ico)$/i.test(resolved);
    res.statusCode = 200;
    res.setHeader('content-type', type);
    res.setHeader('cache-control', isImage ? 'public, max-age=86400' : 'no-cache');
    res.end(data);
  });
}

function logRequest(method, pathname, status, ms, note = '') {
  const line = `${new Date().toISOString()} ${method.padEnd(4)} ${status} ${String(Math.round(ms)).padStart(5)}ms ${pathname}${note ? ` — ${note}` : ''}`;
  if (status >= 400) console.error(`  ${line}`);
  else console.log(`  ${line}`);
}

function readBody(req, limitBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

export function createApp(engine = new Engine()) {
  return http.createServer(async (req, res) => {
    const started = Date.now();
    const requestPath = (req.url || '/').split('?')[0];

    res.on('finish', () => {
      logRequest(req.method, requestPath, res.statusCode, Date.now() - started);
    });

    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const route = `${req.method} ${url.pathname}`;

      if (route === 'GET /api/health') {
        sendJson(res, 200, { ok: true, uptime: process.uptime(), gemini: geminiEnabled(), version: '1.0.0' });
        return;
      }

      if (route === 'GET /api/config') {
        sendJson(res, 200, {
          gemini: geminiEnabled(),
          model: geminiEnabled() ? config.gemini.model : null,
          defaultPlace: config.defaultPlace,
          popularPlaces: config.popularPlaces,
        });
        return;
      }

      if (route === 'GET /api/places') {
        const q = url.searchParams.get('q') || '';
        const results = await searchPlaces(q, {
          cache: new TTLCache(config.cacheTtlMs),
          fetchImpl: globalThis.fetch,
          geocodingUrl: config.openMeteo.geocoding,
          countryBias: config.countryBias,
          count: 8,
        });
        sendJson(res, 200, {
          query: q,
          results: results.slice(0, 8).map((p) => ({
            name: p.name,
            label: [p.name, p.admin1, p.country].filter((v, i, a) => v && a.indexOf(v) === i).join(', '),
            lat: p.lat,
            lon: p.lon,
          })),
        });
        return;
      }

      if (route === 'POST /api/chat') {
        const body = await readBody(req);
        const message = String(body.message || '').trim();
        if (!message) {
          sendJson(res, 400, { error: 'message is required' });
          return;
        }
        const result = await engine.chat(message, String(body.sessionId || 'default'));
        sendJson(res, 200, result);
        return;
      }

      if (route === 'GET /api/weather' || route === 'GET /api/alerts') {
        const placeQuery = url.searchParams.get('place') || config.defaultPlace;
        const data = await engine.getPlaceData(placeQuery);
        if (!data) {
          sendJson(res, 404, { error: 'place not found', place: placeQuery });
          return;
        }
        if (route === 'GET /api/weather') {
          sendJson(res, 200, data);
          return;
        }
        sendJson(res, 200, { place: data.place, worstSeverity: data.cards?.worstSeverity || null, alerts: data.cards?.alerts || [] });
        return;
      }

      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        sendStatic(res, path.join(PUBLIC_DIR, 'index.html'));
        return;
      }

      if (req.method === 'GET' && url.pathname.startsWith('/')) {
        const safeName = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
        const filePath = path.join(PUBLIC_DIR, safeName);
        if (path.extname(filePath) && fs.existsSync(filePath)) {
          sendStatic(res, filePath);
          return;
        }
      }

      sendJson(res, 404, { error: 'not found', route, ms: Date.now() - started });
    } catch (error) {
      const status = error.message === 'Invalid JSON body' || error.message === 'Payload too large' ? 400 : 500;
      sendJson(res, status, { error: error.message || 'internal error' });
    }
  });
}

export function startServer() {
  const engine = new Engine();
  const server = createApp(engine);
  server.listen(config.port, config.host, () => {
    const addr = server.address();
    const shown = typeof addr === 'object' && addr ? addr.port : config.port;
    console.log(`WeatherGPT listening on http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${shown}`);
    console.log(`Gemini: ${geminiEnabled() ? `enabled (${config.gemini.model})` : 'not configured (deterministic engine active)'}`);

    /* Warm the cache for the default place. The first request otherwise
       pays for four upstream hosts at once and can take several seconds,
       which reads as a broken page to whoever opens it first. */
    engine.getPlaceData(config.defaultPlace).then(
      (data) => {
        if (data) console.log(`  cache warm · ${data.place.label} · ${data.meta.latencyMs}ms`);
      },
      (error) => console.warn(`  cache warm skipped: ${error.message}`),
    );
  });
  server.on('error', (error) => {
    console.error('Server error:', error.message);
    process.exitCode = 1;
  });
  return server;
}

const invokedAsMain =
  typeof import.meta.main === 'boolean'
    ? import.meta.main
    : process.argv[1]
      ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
      : false;

if (invokedAsMain) {
  startServer();
}
