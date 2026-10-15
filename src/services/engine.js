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
} from './respond.js';

const sharedCache = new TTLCache(config.cacheTtlMs);

function localeFor(place) {
  return {
    cache: sharedCache,
    geocodingUrl: config.openMeteo.geocoding,
    timeoutMs: config.httpTimeoutMs,
    countryBias: config.countryBias,
    fetchImpl: globalThis.fetch,
  };
}

export class Engine {
  constructor(deps = {}) {
    this.deps = deps;
    this.sessions = new Map();
  }

  async fetchBundle(place) {
    const deps = { cache: sharedCache, fetchImpl: globalThis.fetch, timeoutMs: config.httpTimeoutMs, geocodingUrl: config.openMeteo.geocoding, countryBias: config.countryBias, ...this.deps };
    const started = Date.now();
    const settled = await Promise.allSettled([
      getForecast(place, deps),
      getAirQuality(place, deps).catch(() => null),
      getRiverTrend(place, deps).catch(() => null),
    ]);
    const [forecastSettled, air, river] = settled;
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
      return this.finalize({ text: composeHelp(nlu.lang), nlu, mode: 'deterministic', started, place: session.place });
    }
    if (nlu.intent === 'greeting') {
      const text = nlu.lang === 'hi'
        ? '🙏 नमस्ते! मैं WeatherGPT हूँ। किसी स्थान का मौसम, अलर्ट या जलवायु जानकारी पूछें — "दिल्ली का मौसम", "कल मुंबई में बारिश?", "कोलकाता अलर्ट"।'
        : nlu.lang === 'hinglish'
          ? '🙏 Namaste! Main WeatherGPT hoon. Kisi jagah ka mausam, alerts ya jalvayu poochho — "delhi ka mausam", "kal mumbai mein baarish?", "kolkata alerts".'
          : 'Hi! I am WeatherGPT. Ask about weather, alerts, or climate anywhere — try "current weather in Delhi", "will it rain tomorrow in Mumbai", "any alerts for Kolkata".';
      return this.finalize({ text, nlu, mode: 'deterministic', started, place: session.place });
    }
    if (nlu.intent === 'nosupport') {
      return this.finalize({ text: composeNosupport(nlu.lang), nlu, mode: 'deterministic', started, place: session.place });
    }

    let place = null;
    const candidates = nlu.placeCandidates.slice(0, 5);
    for (const candidate of candidates) {
      place = await resolvePlace(candidate, { cache: sharedCache, fetchImpl: globalThis.fetch, geocodingUrl: config.openMeteo.geocoding, countryBias: config.countryBias, timeoutMs: config.httpTimeoutMs });
      if (place) break;
    }
    if (!place && session.place) place = session.place;
    if (!place) {
      place = await resolvePlace(config.defaultPlace, { cache: sharedCache, fetchImpl: globalThis.fetch, geocodingUrl: config.openMeteo.geocoding, countryBias: config.countryBias, timeoutMs: config.httpTimeoutMs });
    }
    if (!place) {
      const text = nlu.lang === 'hi'
        ? '❌ यह स्थान नहीं मिला। कृपया स्पष्ट शहर/राज्य नाम लिखें, जैसे "मुंबई", "गुवाहाटी, असम"।'
        : `I could not find a place matching that. Try a well-known city name like "Mumbai", "Guwahati", "Pune".`;
      return this.finalize({ text, nlu, mode: 'deterministic', started, place: null });
    }
    place.label = placeLabel(place);
    session.place = place;

    let bundle;
    try {
      bundle = await this.fetchBundle(place);
    } catch (error) {
      const text = nlu.lang === 'hi'
        ? '⚠️ मौसम डेटा सेवा अभी उपलब्ध नहीं है (NWP API)। कृपया थोड़ी देर बाद पुनः प्रयास करें।'
        : `⚠️ The weather data service is temporarily unavailable (NWP API). Please try again in a moment. (${error.message})`;
      return this.finalize({ text, nlu, mode: 'deterministic', started, place, error: error.message });
    }

    const todayStr = bundle.forecast.current?.time?.slice(0, 10) || bundle.forecast.daily[0].date;
    const today = bundle.forecast.daily.find((d) => d.date === todayStr) || bundle.forecast.daily[0];
    const alerts = buildAlerts(bundle.forecast, { place, from: 0, to: 2, riverTrend: bundle.river?.trend ?? null });
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
            const p = await resolvePlace(args.place, { cache: sharedCache, fetchImpl: globalThis.fetch, geocodingUrl: config.openMeteo.geocoding, countryBias: config.countryBias });
            if (!p) return { error: 'place not found' };
            const b = await this.fetchBundle(p);
            return name === 'get_air_quality'
              ? { place: p.name, air: b.air }
              : { place: p.name, current: b.forecast.current, tz: b.forecast.tz };
          }
          if (name === 'get_forecast') {
            const p = await resolvePlace(args.place, { cache: sharedCache, fetchImpl: globalThis.fetch, geocodingUrl: config.openMeteo.geocoding, countryBias: config.countryBias });
            if (!p) return { error: 'place not found' };
            const b = await this.fetchBundle(p);
            return { place: p.name, days: b.forecast.daily.slice(0, args.days) };
          }
          if (name === 'get_alerts') {
            const p = await resolvePlace(args.place, { cache: sharedCache, fetchImpl: globalThis.fetch, geocodingUrl: config.openMeteo.geocoding, countryBias: config.countryBias });
            if (!p) return { error: 'place not found' };
            const b = await this.fetchBundle(p);
            return { place: p.name, alerts: buildAlerts(b.forecast, { place: p, from: 0, to: 2 }) };
          }
          if (name === 'get_climate_anomaly') {
            const p = await resolvePlace(args.place, { cache: sharedCache, fetchImpl: globalThis.fetch, geocodingUrl: config.openMeteo.geocoding, countryBias: config.countryBias });
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
        titleHi: a.titleHi,
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
    const place = await resolvePlace(query, { cache: sharedCache, fetchImpl: globalThis.fetch, geocodingUrl: config.openMeteo.geocoding, countryBias: config.countryBias, timeoutMs: config.httpTimeoutMs });
    if (!place) return null;
    place.label = placeLabel(place);
    const bundle = await this.fetchBundle(place);
    const todayStr = bundle.forecast.current?.time?.slice(0, 10) || bundle.forecast.daily[0].date;
    const alerts = buildAlerts(bundle.forecast, { place, from: 0, to: 2, riverTrend: bundle.river?.trend ?? null });
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
