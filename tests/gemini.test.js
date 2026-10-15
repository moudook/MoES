import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFetchStub, geoFixture, forecastFixture, airFixture } from './helpers.js';

const geminiBody = (parts) => ({ candidates: [{ content: { parts, role: 'model' } }] });

test('gemini function-call loop executes tools and returns final text', async () => {
  process.env.GEMINI_API_KEY = 'test-key-123';
  const { geminiAnswer } = await import('../src/services/gemini.js');

  const stub = makeFetchStub({
    'generativelanguage.googleapis.com': (url, opts) => {
      const body = JSON.parse(opts.body);
      const isFollowUp = body.contents.some((c) => c.parts?.some((p) => p.functionResponse));
      if (isFollowUp) {
        return geminiBody([{ text: 'Delhi mein abhi halki baarish ho rahi hai, 22°C.' }]);
      }
      return geminiBody([{ functionCall: { name: 'get_current_weather', args: { place: 'Delhi' } } }]);
    },
  });

  const executed = [];
  const result = await geminiAnswer({
    message: 'delhi ka mausam',
    toolExecutor: async ({ name, args }) => {
      executed.push({ name, args });
      return { place: args.place, current: { temperature_2m: 22.2 } };
    },
    deps: { fetchImpl: stub.fn },
  });

  assert.equal(result.mode, 'gemini');
  assert.equal(executed.length, 1);
  assert.equal(executed[0].name, 'get_current_weather');
  assert.equal(executed[0].args.place, 'Delhi');
  assert.equal(stub.calls.length, 2);
  assert.match(stub.calls[1].options.body, /functionResponse/);
  assert.match(result.text, /22°C/);
});

test('geminiAnswer throws when key is empty', async () => {
  const { geminiAnswer } = await import('../src/services/gemini.js');
  await assert.rejects(
    () => geminiAnswer({ message: 'hi', toolExecutor: async () => ({}), deps: { apiKey: '' } }),
    /GEMINI_API_KEY not configured/
  );
});

test('tool errors are returned to the model instead of crashing', async () => {
  process.env.GEMINI_API_KEY = 'test-key-123';
  const { geminiAnswer } = await import('../src/services/gemini.js');
  const stub = makeFetchStub({
    'generativelanguage.googleapis.com': (url, opts) => {
      const body = JSON.parse(opts.body);
      const isFollowUp = body.contents.some((c) => c.parts?.some((p) => p.functionResponse));
      if (isFollowUp) {
        assert.match(JSON.stringify(body), /"error":"place not found"/);
        return geminiBody([{ text: 'Sorry, that place was not found.' }]);
      }
      return geminiBody([{ functionCall: { name: 'get_alerts', args: { place: 'zzzz' } } }]);
    },
  });
  const result = await geminiAnswer({
    message: 'alerts in zzzz',
    toolExecutor: async () => {
      const error = new Error('place not found');
      throw error;
    },
    deps: { fetchImpl: stub.fn },
  });
  assert.match(result.text, /not found/);
});

test('summaryForContext bundles live grounding data', async () => {
  const { summaryForContext } = await import('../src/services/gemini.js');
  const { normalizeForecast } = await import('../src/services/weather.js');
  const summary = summaryForContext(
    { name: 'Delhi', label: 'Delhi, India' },
    normalizeForecast(forecastFixture()),
    airFixture(),
    [{ hazard: 'heavy_rain', severity: 'orange', title: 'Heavy rainfall', criteria: 'x', date: '2026-10-15' }]
  );
  assert.equal(summary.placeLabel, 'Delhi, India');
  assert.equal(summary.alerts[0].severity, 'orange');
  assert.equal(summary.current.temp, 22.2);
  assert.equal(summary.source, 'Open-Meteo NWP');
});
