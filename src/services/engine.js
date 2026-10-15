import { config, geminiEnabled } from '../config.js';
import { TTLCache } from '../lib/net.js';
import { resolvePlace, placeLabel } from './geocode.js';
import { getForecast, getAirQuality, getRiverTrend, dayByOffset, chartSeries } from './weather.js';
import { getClimateBaseline, anomalyOf } from './climate.js';
import { buildAlerts, highestSeverity } from './alerts.js';
import { understand } from './dialog.js';
import { geminiAnswer, summaryForContext } from './gemini.js';
import {
  composeCurrent,
  composeRainCheck,
  composeForecast,
  composeAlerts,
  composeClimate,
  composeHelp,
  composeNosupport,
  composeGreeting,
  composePlaceNotFound,
  composeDataUnavailable,
} from './respond.js';

const sharedCache = new TTLCache(config.cacheTtlMs);

export class Engine {
  constructor(deps = {}) {
    this.deps = deps;
    this.sessions = new Map();
    this.cache = deps.cache || sharedCache;
  }

  depsFor() {
    return {
      cache: this.cache,
      fetchImpl: globalThis.fetch,
      geocodingUrl: config.openMeteo.geocoding,
      countryBias: config.countryBias,
      timeoutMs: config.httpTimeoutMs,
      ...this.deps,
    };
  }

  async fetchBundle(place) {
    const deps = this.depsFor();
    const started = Date.now();
    const settled = await Promise.allSettled([
      getForecast(place, deps),
      getAirQuality(place, deps).catch(() => null),
      getRiverTrend(place, deps).catch(() => null),
    ]);
    const [forecastSettled, airSettled, riverSettled] = settled;
    const air = airSettled.status === 'fulfilled' ? airSettled.value : null;
    const river = riverSettled.status === 'fulfilled' ? riverSettled.value : null;
    const forecast = forecastSettled.status === 'fulfilled' ? forecastSettled.value : null;
    if (!forecast) {
      const reason = forecastSettled.reason;
      throw new Error(reason?.message || 'Weather data fetch failed');
    }
    return {
      forecast,
      air,
      river,
      latencyMs: Date.now() - started,
    };
  }

  async chat(message, sessionId = 'default') {
    const started = Date.now();
    const nlu = understand(message);
    const session = this.sessions.get(sessionId) || {};
    this.sessions.set(sessionId, session);

    if (nlu.intent === 'help') {
      return this.finalize({ text: composeHelp(), nlu, mode: 'deterministic', started, place: session.place });
    }
    if (nlu.intent === 'greeting') {
      return this.finalize({ text: composeGreeting(), nlu, mode: 'deterministic', started, place: session.place });
    }
    if (nlu.intent === 'nosupport') {
      return this.finalize({ text: composeNosupport(), nlu, mode: 'deterministic', started, place: session.place });
    }

    let place = null;
    const candidates = nlu.placeCandidates.slice(0, 5);
    for (const candidate of candidates) {
      place = await resolvePlace(candidate, this.depsFor());
      if (place) break;
    }
    if (!place && session.place) place = session.place;
    if (!place) {
      place = await resolvePlace(config.defaultPlace, this.depsFor());
    }
    if (!place) {
      return this.finalize({ text: composePlaceNotFound(), nlu, mode: 'deterministic', started, place: null });
    }
    place.label = placeLabel(place);
    session.place = place;

    let bundle;
    try {
      bundle = await this.fetchBundle(place);
    } catch (error) {
      return this.finalize({ text: composeDataUnavailable(error), nlu, mode: 'deterministic', started, place, error: error.message });
    }

    const todayStr = bundle.forecast.current?.time?.slice(0, 10) || bundle.forecast.daily[0].date;
    const today = bundle.forecast.daily.find((d) => d.date === todayStr) || bundle.forecast.daily[0];
    const startIdx = Math.max(0, bundle.forecast.daily.findIndex((d) => d.date === todayStr));
    const alerts = buildAlerts(bundle.forecast, { place, from: startIdx, to: startIdx + 2, riverTrend: bundle.river?.trend ?? null });
    const bundleForAnswers = {
      placeLabel: place.label,
      forecast: bundle.forecast,
      current: bundle.forecast.current,
      air: bundle.air,
      alerts,
      todayStr,
      today,
    };

    let text = null;
    let mode = 'deterministic';
    if (geminiEnabled()) {
      try {
        const context = {
          placeLabel: place.label,
          place: place.name,
          summary: summaryForContext(place, bundle.forecast, bundle.air, alerts),
        };
        const executor = async ({ name, args }) => {
          if (name === 'get_current_weather' || name === 'get_air_quality') {
            const p = await resolvePlace(args.place, this.depsFor());
            if (!p) return { error: 'place not found' };
            const b = await this.fetchBundle(p);
            return name === 'get_air_quality'
              ? { place: p.name, air: b.air }
              : { place: p.name, current: b.forecast.current, tz: b.forecast.tz };
          }
          if (name === 'get_forecast') {
            const p = await resolvePlace(args.place, this.depsFor());
            if (!p) return { error: 'place not found' };
            const b = await this.fetchBundle(p);
            return { place: p.name, days: b.forecast.daily.slice(0, args.days) };
          }
          if (name === 'get_alerts') {
            const p = await resolvePlace(args.place, this.depsFor());
            if (!p) return { error: 'place not found' };
            const b = await this.fetchBundle(p);
            return { place: p.name, alerts: buildAlerts(b.forecast, { place: p, from: 0, to: 2 }) };
          }
          if (name === 'get_climate_anomaly') {
            const p = await resolvePlace(args.place, this.depsFor());
            if (!p) return { error: 'place not found' };
            const climate = await getClimateBaseline(p, todayStr, { fetchImpl: globalThis.fetch, timeoutMs: config.httpTimeoutMs });
            const trip = await this.fetchBundle(p);
            const day0 = trip.forecast.daily[0];
            return { place: p.name, baseline: climate, anomaly: anomalyOf(climate, day0) };
          }
          return { error: 'unknown tool' };
        };
        const result = await geminiAnswer({
          message,
          context,
          history: [],
          toolExecutor: executor,
        });
        text = result.text;
        mode = 'gemini';
      } catch (error) {
        mode = 'deterministic-fallback';
        this.deps.onGeminiError?.(error);
      }
    }

    if (!text) {
      switch (nlu.intent) {
        case 'alerts':
          text = composeAlerts(nlu, bundleForAnswers);
          break;
        case 'climate':
          {
            const climate = await getClimateBaseline(place, todayStr, { fetchImpl: globalThis.fetch, timeoutMs: config.httpTimeoutMs });
            bundleForAnswers.climate = climate;
            bundleForAnswers.anomaly = anomalyOf(climate, today);
            text = composeClimate(nlu, bundleForAnswers);
          }
          break;
        case 'raincheck':
          text = composeRainCheck(nlu, bundleForAnswers);
          break;
        case 'forecast':
          text = composeForecast(nlu, bundleForAnswers);
          break;
        default:
          text = composeCurrent(nlu, bundleForAnswers);
          break;
      }
    }

    return this.finalize({
      text,
      nlu,
      mode,
      started,
      place,
      bundle,
      alerts,
      todayStr,
      today,
    });
  }

  finalize(parts) {
    const { text, nlu, mode, started, place, bundle, alerts, todayStr, today } = parts;
    const cards = bundle && place ? {
      place: { name: place.name, label: place.label, tz: bundle.forecast.tz, elevation: bundle.forecast.elevation, lat: place.lat, lon: place.lon },
      current: bundle.forecast.current,
      today,
      chart: chartSeries(bundle.forecast, 0, 7),
      air: bundle.air || null,
      river: bundle.river || null,
      alerts: (alerts || []).map((a) => ({
        id: a.id,
        hazard: a.hazard,
        severity: a.severity,
        title: a.title,
        criteria: a.criteria,
        date: a.date,
        advisory: a.advisory,
      })),
      worstSeverity: highestSeverity(alerts || []),
    } : null;
    return {
      text,
      mode,
      lang: nlu?.lang || 'en',
      intent: nlu?.intent || 'weather',
      place: place ? { name: place.name, label: place.label, lat: place.lat, lon: place.lon, country: place.country, timezone: place.timezone } : null,
      cards,
      meta: { latencyMs: Date.now() - started, gemini: geminiEnabled() },
    };
  }

  async getPlaceData(query) {
    const place = await resolvePlace(query, this.depsFor());
    if (!place) return null;
    place.label = placeLabel(place);
    const bundle = await this.fetchBundle(place);
    const todayStr = bundle.forecast.current?.time?.slice(0, 10) || bundle.forecast.daily[0].date;
    const startIdx = Math.max(0, bundle.forecast.daily.findIndex((d) => d.date === todayStr));
    const alerts = buildAlerts(bundle.forecast, { place, from: startIdx, to: startIdx + 2, riverTrend: bundle.river?.trend ?? null });
    return this.finalize({
      text: '',
      nlu: { lang: 'en', intent: 'data' },
      mode: 'data',
      started: Date.now(),
      place,
      bundle,
      alerts,
      todayStr,
    });
  }
}

export { sharedCache };
