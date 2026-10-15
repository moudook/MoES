import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFetchStub, geoFixture, forecastFixture, airFixture } from './helpers.js';
import { Engine } from '../src/services/engine.js';
import { TTLCache } from '../src/lib/net.js';

const REAL_FETCH = globalThis.fetch;

function stubUp() {
  const stub = makeFetchStub({
    'geocoding-api': () => geoFixture(),
    'api.open-meteo.com/v1/forecast': () => forecastFixture(),
    'air-quality-api': () => airFixture(),
    'flood-api': () => ({ daily: { river_discharge: [3, 3, 3, 3, 3] } }),
  });
  globalThis.fetch = stub.fn;
  return stub;
}

async function startServer() {
  const { createApp } = await import('../src/server.js');
  const engine = new Engine({ cache: new TTLCache(60000) });
  const server = createApp(engine);
  await new Promise((resolve) => server.listen(0, resolve));
  return server;
}

async function stopServer(server) {
  if (server.closeAllConnections) server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}

async function get(server, path, options = {}) {
  const port = server.address().port;
  const res = await REAL_FETCH(`http://127.0.0.1:${port}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', connection: 'close', ...(options.headers || {}) },
  });
  return res;
}

test('health endpoint reports ok', async () => {
  const server = await startServer();
  const res = await get(server, '/api/health');
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.ok, true);
  await stopServer(server);
});

test('POST /api/chat returns deterministic answer', async () => {
  stubUp();
  const server = await startServer();
  const res = await get(server, '/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message: 'current weather in Delhi' }),
  });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.match(data.text, /Delhi/);
  assert.equal(data.mode, 'deterministic');
  await stopServer(server);
});

test('POST /api/chat rejects empty message', async () => {
  const server = await startServer();
  const res = await get(server, '/api/chat', { method: 'POST', body: JSON.stringify({}) });
  assert.equal(res.status, 400);
  await stopServer(server);
});

test('POST /api/chat rejects invalid JSON', async () => {
  const server = await startServer();
  const res = await get(server, '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', connection: 'close' },
    body: '{not-json',
  });
  assert.equal(res.status, 400);
  await stopServer(server);
});

test('GET /api/weather returns cards', async () => {
  stubUp();
  const server = await startServer();
  const res = await get(server, '/api/weather?place=Delhi');
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.place.name, 'Delhi');
  assert.equal(data.cards.current.temp, 22.2);
  assert.equal(data.cards.chart.labels.length, 7);
  await stopServer(server);
});

test('GET /api/alerts returns alert list', async () => {
  stubUp();
  const server = await startServer();
  const res = await get(server, '/api/alerts?place=Delhi');
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(data.alerts));
  await stopServer(server);
});

test('GET /api/places returns suggestions', async () => {
  stubUp();
  const server = await startServer();
  const res = await get(server, '/api/places?q=del');
  const data = await res.json();
  assert.equal(data.results[0].name, 'Delhi');
  await stopServer(server);
});

test('GET /api/weather unknown place returns 404', async () => {
  const stub = makeFetchStub({ 'geocoding-api': () => ({ results: [] }) });
  globalThis.fetch = stub.fn;
  const server = await startServer();
  const res = await get(server, '/api/weather?place=zzznotacity');
  const data = await res.json();
  assert.equal(res.status, 404);
  assert.equal(data.error, 'place not found');
  await stopServer(server);
});

test('GET / serves the chat UI', async () => {
  const server = await startServer();
  const res = await get(server, '/');
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /WeatherGPT/);
  assert.match(html, /app\.js/);
  await stopServer(server);
});

test('GET /styles.css and /app.js are served', async () => {
  const server = await startServer();
  const css = await get(server, '/styles.css');
  const js = await get(server, '/app.js');
  assert.equal(css.status, 200);
  assert.equal(js.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
  assert.match(js.headers.get('content-type'), /javascript/);
  await stopServer(server);
});

test('unknown route returns JSON 404', async () => {
  const server = await startServer();
  const res = await get(server, '/api/nothing-here');
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'not found');
  await stopServer(server);
});
