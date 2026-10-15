import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessDay, worstSeverity } from '../src/lib/imd.js';

function day(overrides = {}) {
  return {
    date: '2026-06-15',
    code: 3,
    tmax: 33,
    tmin: 24,
    precipSum: 0,
    pop: 10,
    gustMax: 25,
    ...overrides,
  };
}

test('no alerts on a mild day', () => {
  assert.deepEqual(assessDay(day()), []);
});

test('heavy rain gives orange (>=64.5mm)', () => {
  const alerts = assessDay(day({ precipSum: 80 }));
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, 'orange');
  assert.equal(alerts[0].hazard, 'heavy_rain');
  assert.match(alerts[0].criteria, /IMD orange criterion/);
});

test('very heavy rain gives red (>=115.5mm)', () => {
  const alerts = assessDay(day({ precipSum: 130 }));
  assert.equal(alerts[0].severity, 'red');
  assert.equal(alerts[0].hazard, 'very_heavy_rain');
});

test('extremely heavy rain gives red (>=204.5mm)', () => {
  const alerts = assessDay(day({ precipSum: 260 }));
  assert.equal(alerts[0].hazard, 'extremely_heavy_rain');
  assert.equal(alerts[0].severity, 'red');
});

test('isolated heavy rain yellow watch', () => {
  const alerts = assessDay(day({ precipSum: 40, pop: 60 }));
  assert.equal(alerts[0].severity, 'yellow');
  assert.equal(alerts[0].hazard, 'isolated_heavy_rain');
});

test('thunderstorm yellow watch by WMO code', () => {
  const alerts = assessDay(day({ code: 95 }));
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, 'yellow');
});

test('thunderstorm with heavy rain escalates to orange', () => {
  const alerts = assessDay(day({ code: 95, precipSum: 60 }));
  const t = alerts.find((a) => a.hazard === 'thunderstorm');
  assert.equal(t.severity, 'orange');
});

test('heatwave thresholds in heat season', () => {
  assert.equal(assessDay(day({ tmax: 39 })).length, 0);
  assert.equal(assessDay(day({ tmax: 41 }))[0].severity, 'yellow');
  assert.equal(assessDay(day({ tmax: 43 }))[0].severity, 'orange');
  assert.equal(assessDay(day({ tmax: 46 }))[0].severity, 'red');
});

test('no heat alerts outside heat season', () => {
  assert.deepEqual(assessDay(day({ date: '2026-01-15', tmax: 46 })), []);
});

test('cold wave only in cold season', () => {
  const jan = assessDay(day({ date: '2026-01-15', tmin: 3 }));
  assert.equal(jan[0].severity, 'red');
  assert.equal(jan[0].hazard, 'coldwave');
  const jul = assessDay(day({ date: '2026-07-15', tmin: 3 }));
  assert.equal(jul.length, 0);
});

test('squall and cyclonic wind thresholds', () => {
  assert.equal(assessDay(day({ gustMax: 70 }))[0].severity, 'orange');
  const red = assessDay(day({ gustMax: 95 }));
  assert.equal(red[0].severity, 'red');
  assert.equal(red[0].hazard, 'squall_cyclonic');
});

test('flood watch requires rising river plus heavy rain', () => {
  const none = assessDay(day({ precipSum: 10 }), { riverTrend: 0.9 });
  assert.ok(!none.some((a) => a.hazard === 'flood_watch'));
  const flood = assessDay(day({ precipSum: 80 }), { riverTrend: 0.9 });
  assert.ok(flood.some((a) => a.hazard === 'flood_watch' && a.severity === 'orange'));
});

test('fog watch in cold season', () => {
  const alerts = assessDay(day({ date: '2026-01-10', code: 45 }));
  assert.ok(alerts.some((a) => a.hazard === 'fog'));
});

test('worstSeverity picks max', () => {
  assert.equal(worstSeverity([{ severity: 'yellow' }, { severity: 'red' }, { severity: 'orange' }]), 'red');
  assert.equal(worstSeverity([]), null);
});

test('alert ids are stable per hazard/severity/date', () => {
  const a = assessDay(day({ precipSum: 120 }))[0];
  const b = assessDay(day({ precipSum: 120 }))[0];
  assert.equal(a.id, b.id);
});
