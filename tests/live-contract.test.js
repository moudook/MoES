import { test } from 'node:test';
import assert from 'node:assert/strict';

/* Contract tests against the LIVE Open-Meteo API.
   Off by default so `npm test` stays hermetic and offline:

       LIVE_TESTS=1 npm test          (PowerShell: $env:LIVE_TESTS=1; npm test)

   Why this exists: everything else in the suite mocks the network, which
   means a silent upstream change — a renamed field, a moved endpoint — would
   not fail until a judge asked a question on stage. These tests assert the
   shape the interface actually depends on. */

const live = process.env.LIVE_TESTS === '1';

const place = { name: 'New Delhi', lat: 28.6139, lon: 77.209 };

test('geocoding returns the fields the engine ranks on', { skip: !live }, async () => {
  const { searchPlaces } = await import('../src/services/geocode.js');
  const results = await searchPlaces('delhi');

  assert.ok(results.length > 0, 'no geocoding results for delhi');
  const top = results[0];
  for (const field of ['name', 'lat', 'lon', 'countryCode', 'timezone']) {
    assert.ok(top[field] !== undefined && top[field] !== null, `missing ${field}`);
  }
  assert.ok(top.countryCode === 'IN', `India bias broken: got ${top.countryCode}`);
  assert.ok(Math.abs(top.lat - 28.6) < 1, `latitude drifted: ${top.lat}`);
});

test('forecast normalises into every field the panels read', { skip: !live }, async () => {
  const { getForecast } = await import('../src/services/weather.js');

  const forecast = await getForecast(place, { cache: undefined });

  assert.equal(forecast.daily.length, 16, 'expected a 16 day series');
  assert.ok(forecast.tz, 'timezone missing');

  for (const field of ['time', 'temp', 'feelsLike', 'humidity', 'windSpeed', 'code']) {
    assert.ok(forecast.current[field] !== undefined && forecast.current[field] !== null, `current.${field} missing`);
  }

  const today = forecast.daily[0];
  for (const field of ['date', 'code', 'tmax', 'tmin', 'precipSum', 'pop', 'gustMax', 'windMax']) {
    assert.ok(today[field] !== undefined && today[field] !== null, `daily.${field} missing`);
  }

  assert.match(String(today.date), /^\d{4}-\d{2}-\d{2}$/, 'date is not ISO shaped');
  assert.ok(today.tmax >= today.tmin, 'tmax below tmin on today');
  assert.ok(forecast.hourly.length > 24, 'hourly series too short');
});

test('air quality still reports an index the interface can name', { skip: !live }, async () => {
  const { getAirQuality } = await import('../src/services/weather.js');
  const air = await getAirQuality(place, { cache: undefined });

  assert.ok(air === null || typeof air.aqi === 'number', 'air quality came back in an unknown shape');
});

test('the alert engine still runs on live forecast data without throwing', { skip: !live }, async () => {
  const { getForecast } = await import('../src/services/weather.js');
  const { buildAlerts } = await import('../src/services/alerts.js');

  const forecast = await getForecast(place, { cache: undefined });
  const alerts = buildAlerts(forecast, { place, from: 0, to: 2 });

  assert.ok(Array.isArray(alerts), 'alerts must always be an array');
  for (const alert of alerts) {
    assert.ok(['yellow', 'orange', 'red'].includes(alert.severity), `bad severity ${alert.severity}`);
    assert.ok(alert.criteria && alert.criteria.length > 10, 'alert without an auditable criterion');
    assert.ok(alert.advisory?.general, 'alert without advisory text');
    assert.match(alert.id, /-\d{4}-\d{2}-\d{2}$/, 'alert id is not date-stamped');
  }
});

test('a chat request completes end to end against live upstreams', { skip: !live }, async () => {
  const { Engine } = await import('../src/services/engine.js');
  const { TTLCache } = await import('../src/lib/net.js');
  const { config } = await import('../src/config.js');

  const previous = config.gemini.apiKey;
  config.gemini.apiKey = '';
  const engine = new Engine({ cache: new TTLCache(1000) });

  try {
    const result = await engine.chat('current weather in Delhi');
    assert.equal(result.mode, 'deterministic');
    assert.equal(result.place.name, 'Delhi');
    assert.match(result.text, /\d/);
    assert.ok(result.cards.chart.labels.length === 7, 'chart series not seven days');
    assert.ok(Array.isArray(result.cards.alerts), 'alerts missing from the response');
  } finally {
    config.gemini.apiKey = previous;
  }
});