import { test } from 'node:test';
import assert from 'node:assert/strict';
import { understand } from '../src/services/dialog.js';

test('understands English current weather query with place', () => {
  const nlu = understand('current weather in Delhi');
  assert.equal(nlu.intent, 'weather');
  assert.equal(nlu.dayOffset, 0);
  assert.deepEqual(nlu.placeCandidates[0], 'delhi');
  assert.equal(nlu.lang, 'en');
});

test('extracts place and day from raincheck', () => {
  const nlu = understand('will it rain tomorrow in Mumbai');
  assert.equal(nlu.intent, 'raincheck');
  assert.equal(nlu.dayOffset, 1);
  assert.ok(nlu.placeCandidates.some((c) => c.includes('mumbai')));
  assert.ok(nlu.params.includes('rain'));
});

test('detects alerts intent and place', () => {
  const nlu = understand('any alerts for Kolkata');
  assert.equal(nlu.intent, 'alerts');
  assert.ok(nlu.placeCandidates.some((c) => c.includes('kolkata')));
});

test('detects climate intent', () => {
  const nlu = understand('climate analysis pune');
  assert.equal(nlu.intent, 'climate');
  assert.ok(nlu.placeCandidates.some((c) => c.includes('pune')));
});

test('understands Hinglish query', () => {
  const nlu = understand('delhi ka mausam batao');
  assert.equal(nlu.intent, 'weather');
  assert.ok(nlu.placeCandidates.some((c) => c.includes('delhi')));
});

test('understands Hindi Devanagari query', () => {
  const nlu = understand('दिल्ली में कल बारिश होगी क्या');
  assert.equal(nlu.lang, 'hi');
  assert.equal(nlu.dayOffset, 1);
  assert.ok(nlu.placeCandidates.some((c) => c.includes('दिल्ली')));
});

test('understands N-day forecast', () => {
  const nlu = understand('chennai 7 day forecast');
  assert.equal(nlu.intent, 'forecast');
  assert.ok(nlu.placeCandidates.some((c) => c.includes('chennai')));
});

test('quoted place takes priority', () => {
  const nlu = understand('weather in "New Delhi" please');
  assert.deepEqual(nlu.placeCandidates[0], 'New Delhi');
});

test('help intent', () => {
  const nlu = understand('help');
  assert.equal(nlu.intent, 'help');
});

test('greeting intent', () => {
  const nlu = understand('hello');
  assert.equal(nlu.intent, 'greeting');
});

test('params detection', () => {
  const nlu = understand('wind and humidity in goa');
  assert.ok(nlu.params.includes('wind'));
  assert.ok(nlu.params.includes('humidity'));
});

test('empty text still parses to default weather intent', () => {
  const nlu = understand('');
  assert.equal(nlu.intent, 'weather');
});
