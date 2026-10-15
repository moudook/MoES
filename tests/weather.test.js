import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFetchStub, forecastFixture, airFixture, floodFixture, geoFixture } from './helpers.js';

test('normalizeForecast maps daily arrays correctly', async () => {
  const { getForecast, normalizeForecast } = await import('../src/services/weather.js');
  const out = normalizeForecast(forecastFixture({ daily: { precipitation_sum: [200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } }));
  assert.equal(out.daily.length, 16);
  assert.equal(out.daily[0].precipSum, 200);
  assert.equal(out.current.temp, 22.2);
  assert.equal(out.current.windGust, 45.7);
  assert.equal(out.daily[0].code, 81);
  assert.equal(out.tz, 'Asia/Kolkata');
  assert.equal(out.hourly.length, 48);
});

test('normalizeForecast throws on missing daily', async () => {
  const { normalizeForecast } = await import('../src/services/weather.js');
  assert.throws(() => normalizeForecast({}), /missing daily data/);
});

test('getForecast caches by rounded coordinates', async () => {
  const { getForecast } = await import('../src/services/weather.js');
  const { TTLCache } = await import('../src/lib/net.js');
  const stub = makeFetchStub({ 'open-meteo.com/v1/forecast': () => forecastFixture() });
  globalThis.fetch = stub.fn;
  const place = { name: 'Delhi', lat: 28.65195, lon: 77.23149 };
  const cache = new TTLCache(60000);
  const first = await getForecast(place, { cache, fetchImpl: stub.fn });
  const second = await getForecast({ ...place, lat: 28.6511, lon: 77.2311 }, { cache, fetchImpl: stub.fn });
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(stub.calls.length, 1);
});

test('getAirQuality parses us_aqi', async () => {
  const { getAirQuality } = await import('../src/services/weather.js');
  const stub = makeFetchStub({ 'air-quality-api': () => airFixture() });
  const air = await getAirQuality({ lat: 28.6, lon: 77.2 }, { cache: undefined, fetchImpl: stub.fn });
  assert.equal(air.aqi, 90);
  assert.equal(air.pm25, 40);
});

test('getRiverTrend computes trend ratio', async () => {
  const { getRiverTrend } = await import('../src/services/weather.js');
  const stub = makeFetchStub({ 'flood-api': () => floodFixture() });
  const r = await getRiverTrend({ lat: 25.6, lon: 84.9 }, { cache: undefined, fetchImpl: stub.fn });
  assert.equal(r.trend, 0);
});

test('getRiverTrend returns null when flat data missing', async () => {
  const { getRiverTrend } = await import('../src/services/weather.js');
  const stub = makeFetchStub({ 'flood-api': () => ({ error: 'no river' }) });
  const r = await getRiverTrend({ lat: 0, lon: 0 }, { cache: undefined, fetchImpl: stub.fn });
  assert.equal(r, null);
});

test('HTTP retry then 4xx surfaces ApiError', async () => {
  const { fetchJSON, ApiError } = await import('../src/lib/net.js');
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    return new Response(JSON.stringify({ error: 'nope' }), { status: 404 });
  };
  await assert.rejects(() => fetchJSON('https://example.com/x', { fetchImpl, retries: 1 }), (err) => err instanceof ApiError && err.status === 404);
  assert.equal(attempts, 1);
});

test('fetchJSON retries once on 5xx then succeeds', async () => {
  const { fetchJSON } = await import('../src/lib/net.js');
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts === 1) return new Response('boom', { status: 503 });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const data = await fetchJSON('https://example.com/y', { fetchImpl, retries: 1, backoffMs: 1 });
  assert.deepEqual(data, { ok: true });
  assert.equal(attempts, 2);
});

test('fetchJSON times out with AbortError', async () => {
  const { fetchJSON } = await import('../src/lib/net.js');
  const fetchImpl = (url, opts) => new Promise((resolve, reject) => {
    opts.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  await assert.rejects(() => fetchJSON('https://example.com/z', { fetchImpl, retries: 0, timeoutMs: 20 }), /aborted|The operation was aborted/i);
});

test('geocode search parses and ranks IN first', async () => {
  const { searchPlaces } = await import('../src/services/geocode.js');
  const { TTLCache } = await import('../src/lib/net.js');
  const stub = makeFetchStub({ 'geocoding-api': () => ({ results: [
    { name: 'Delhi', latitude: 42.27, longitude: -74.91, country: 'United States', country_code: 'US', population: 3157 },
    { name: 'Delhi', latitude: 28.65, longitude: 77.23, country: 'India', country_code: 'IN', population: 11034535, admin1: 'NCT of Delhi', timezone: 'Asia/Kolkata' },
  ] }) });
  const places = await searchPlaces('delhi', { cache: new TTLCache(60000), fetchImpl: stub.fn });
  assert.equal(places[0].countryCode, 'IN');
  assert.equal(places[0].name, 'Delhi');
});
