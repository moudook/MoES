import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getClimateBaseline, anomalyOf } from '../src/services/climate.js';
import { archiveFixture } from './helpers.js';
import { makeFetchStub } from './helpers.js';

const place = { lat: 28.65, lon: 77.23 };

test('baseline averages 5 years of archive data', async () => {
  const stub = makeFetchStub({
    'archive-api': (url) => {
      const year = new URL(url).searchParams.get('start_date').slice(0, 4);
      return archiveFixture(year);
    },
  });
  const baseline = await getClimateBaseline(place, '2026-10-15', { fetchImpl: stub.fn, years: 5 });
  assert.equal(baseline.years.length, 5);
  assert.equal(baseline.mean.tmax, 31.9);
  assert.equal(baseline.mean.tmin, 20.8);
  assert.equal(baseline.mean.precip, 0);
  assert.equal(baseline.sampleCount, 5);
});

test('baseline returns null when fewer than 3 years available', async () => {
  const stub = makeFetchStub({ 'archive-api': () => null });
  const baseline = await getClimateBaseline(place, '2026-10-15', { fetchImpl: stub.fn, years: 5 });
  assert.equal(baseline, null);
});

test('anomaly computes difference vs baseline', () => {
  const baseline = { mean: { tmax: 31.9, tmin: 20.8, precip: 0 } };
  const anomaly = anomalyOf(baseline, { tmax: 34.2, tmin: 22.5, precipSum: 12 });
  assert.equal(anomaly.tmax, 2.3);
  assert.equal(anomaly.tmin, 1.7);
  assert.equal(anomaly.precip, 12);
});

test('anomaly null with missing inputs', () => {
  assert.equal(anomalyOf(null, { tmax: 30 }), null);
});
