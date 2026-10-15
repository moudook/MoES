import { buildQuery, fetchJSON } from '../lib/net.js';
import { config } from '../config.js';
import { mean, shiftDate } from '../lib/format.js';

export function getClimateBaseline(place, localDate, deps = {}) {
  const {
    fetchImpl = globalThis.fetch,
    timeoutMs = config.httpTimeoutMs,
    years = 5,
    baseUrl = config.openMeteo.archive,
  } = deps;

  const target = localDate.slice(0, 10);
  const year = Number(target.slice(0, 4));
  const mmdd = target.slice(5);
  const calls = [];
  for (let i = 1; i <= years; i += 1) {
    const base = `${year - i}-${mmdd}`;
    const start = shiftDate(base, -1);
    const end = shiftDate(base, 1);
    const url = `${baseUrl}?${buildQuery({
      latitude: place.lat,
      longitude: place.lon,
      start_date: start,
      end_date: end,
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
      timezone: 'auto',
    })}`;
    calls.push(fetchJSON(url, { timeoutMs, fetchImpl }).then((data) => ({
      year: year - i,
      tmax: data?.daily?.temperature_2m_max || [],
      tmin: data?.daily?.temperature_2m_min || [],
      precip: data?.daily?.precipitation_sum || [],
    })).catch(() => null));
  }
  return Promise.all(calls).then((results) => {
    const ok = results.filter(Boolean);
    if (ok.length < 3) return null;
    const tmax = ok.flatMap((r) => r.tmax.filter((v) => v != null));
    const tmin = ok.flatMap((r) => r.tmin.filter((v) => v != null));
    const precip = ok.flatMap((r) => r.precip.filter((v) => v != null));
    return {
      years: ok.map((r) => r.year).sort(),
      sampleCount: ok.length,
      mean: {
        tmax: round1(mean(tmax)),
        tmin: round1(mean(tmin)),
        precip: round1(mean(precip)),
      },
      units: { temp: '°C', precip: 'mm/day' },
    };
  });
}

function round1(v) {
  return v == null ? null : Math.round(v * 10) / 10;
}

export function anomalyOf(baseline, today) {
  if (!baseline || !today) return null;
  const round2 = (v) => (v == null ? null : Math.round(v * 10) / 10);
  return {
    tmax: today.tmax != null && baseline.mean.tmax != null ? round2(today.tmax - baseline.mean.tmax) : null,
    tmin: today.tmin != null && baseline.mean.tmin != null ? round2(today.tmin - baseline.mean.tmin) : null,
    precip: today.precipSum != null && baseline.mean.precip != null ? round2(today.precipSum - baseline.mean.precip) : null,
  };
}
