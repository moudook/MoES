import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFetchStub, geoFixture, forecastFixture, airFixture, floodFixture } from './helpers.js';
import { TTLCache } from '../src/lib/net.js';

function freshEngine(Engine) {
  return new Engine({ cache: new TTLCache(60000) });
}

function installStubs(dailyOverrides) {
  const stub = makeFetchStub({
    'geocoding-api': () => geoFixture(),
    'api.open-meteo.com/v1/forecast': () => forecastFixture({ daily: dailyOverrides }),
    'air-quality-api': () => airFixture(),
    'flood-api': () => floodFixture(),
  });
  globalThis.fetch = stub.fn;
  return stub;
}

test('current weather answer contains live numbers', async () => {
  installStubs();
  const { Engine } = await import('../src/services/engine.js');
  const engine = freshEngine(Engine);
  const res = await engine.chat('current weather in Delhi');
  assert.equal(res.mode, 'deterministic');
  assert.match(res.text, /Delhi, India/);
  assert.match(res.text, /22°C/);
  assert.match(res.text, /96%/);
  assert.equal(res.place.name, 'Delhi');
  assert.equal(res.cards.current.temp, 22.2);
});

test('hindi query still gets an English deterministic answer and correct place', async () => {
  installStubs();
  const { Engine } = await import('../src/services/engine.js');
  const engine = freshEngine(Engine);
  const res = await engine.chat('delhi ka mausam batao');
  assert.equal(res.intent, 'weather');
  assert.equal(res.place.name, 'Delhi');
  assert.match(res.text, /right now/);
});

test('raincheck for tomorrow answers with probability', async () => {
  installStubs({ precipitation_probability_max: Array.from({ length: 16 }, (_, i) => (i === 1 ? 85 : 10)), precipitation_sum: [0, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
  const { Engine } = await import('../src/services/engine.js');
  const engine = freshEngine(Engine);
  const res = await engine.chat('will it rain tomorrow in Mumbai');
  assert.equal(res.intent, 'raincheck');
  assert.match(res.text, /Yes/);
  assert.match(res.text, /85%/);
});

test('alerts answer surfaces red alert with criteria', async () => {
  installStubs({ precipitation_sum: Array.from({ length: 16 }, (_, i) => (i === 0 ? 250 : 0)) });
  const { Engine } = await import('../src/services/engine.js');
  const engine = freshEngine(Engine);
  const res = await engine.chat('any alerts for Delhi');
  assert.equal(res.cards.worstSeverity, 'red');
  assert.ok(res.cards.alerts.some((a) => a.hazard === 'extremely_heavy_rain'));
  assert.match(res.text, /Extremely heavy rainfall/);
  assert.match(res.text, /criteria:/);
});

test('forecast answer lists three days', async () => {
  installStubs();
  const { Engine } = await import('../src/services/engine.js');
  const engine = freshEngine(Engine);
  const res = await engine.chat('7 day forecast chennai');
  assert.equal(res.intent, 'forecast');
  assert.match(res.text, /Today/);
  assert.ok(res.text.split('\n').length >= 4);
});

test('help and greeting short-circuit', async () => {
  installStubs();
  const { Engine } = await import('../src/services/engine.js');
  const engine = freshEngine(Engine);
  const help = await engine.chat('help');
  assert.match(help.text, /WeatherGPT/);
  const hello = await engine.chat('hello');
  assert.match(hello.text, /WeatherGPT/);
});

test('non-weather question gets a scope reply', async () => {
  installStubs();
  const { Engine } = await import('../src/services/engine.js');
  const engine = freshEngine(Engine);
  const res = await engine.chat('who will win the election');
  assert.equal(res.intent, 'unknown');
  assert.match(res.text, /weather, alerts, and climate only/i);
});

test('bare city name works', async () => {
  const stub = makeFetchStub({
    'geocoding-api': (url) => geoFixture(new URL(url).searchParams.get('name').toLowerCase() === 'mumbai' ? 'Mumbai' : 'Delhi'),
    'api.open-meteo.com/v1/forecast': () => forecastFixture(),
    'air-quality-api': () => airFixture(),
    'flood-api': () => floodFixture(),
  });
  globalThis.fetch = stub.fn;
  const { Engine } = await import('../src/services/engine.js');
  const engine = freshEngine(Engine);
  const res = await engine.chat('Mumbai');
  assert.equal(res.intent, 'weather');
  assert.equal(res.place.name, 'Mumbai');
});

test('unknown place is handled gracefully', async () => {
  const stub = makeFetchStub({
    'geocoding-api': () => ({ results: [] }),
  });
  globalThis.fetch = stub.fn;
  const { Engine } = await import('../src/services/engine.js');
  const engine = freshEngine(Engine);
  const res = await engine.chat('weather in zzzzzqqq notacity');
  assert.equal(res.place, null);
  assert.match(res.text, /could not find a place/i);
});

test('session remembers last place', async () => {
  installStubs();
  const { Engine } = await import('../src/services/engine.js');
  const engine = freshEngine(Engine);
  await engine.chat('weather in Delhi', 's1');
  const res = await engine.chat('will it rain tomorrow', 's1');
  assert.equal(res.place.name, 'Delhi');
  assert.equal(res.intent, 'raincheck');
});

test('data fetch failure is handled gracefully', async () => {
  const stub = makeFetchStub({
    'geocoding-api': () => geoFixture(),
    'api.open-meteo.com/v1/forecast': () => ({ error: 'down' }, 503),
    'air-quality-api': () => airFixture(),
    'flood-api': () => floodFixture(),
  });
  globalThis.fetch = stub.fn;
  const { Engine } = await import('../src/services/engine.js');
  const engine = freshEngine(Engine);
  const res = await engine.chat('weather in Delhi');
  assert.match(res.text, /temporarily unavailable/);
});
