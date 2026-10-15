import { buildQuery, fetchJSON, TTLCache } from '../lib/net.js';
import { config } from '../config.js';

export function normalizePlaceInput(raw) {
  return String(raw || '')
    .replace(/[?!.,;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseResults(data) {
  return (data.results || []).map((r) => ({
    name: r.name,
    admin1: r.admin1 || null,
    country: r.country || null,
    countryCode: r.country_code || null,
    lat: Number(r.latitude),
    lon: Number(r.longitude),
    timezone: r.timezone || null,
    population: r.population || 0,
    featureCode: r.feature_code || null,
  }));
}

export function rankPlaces(places, countryBias = 'IN') {
  return [...places].sort((a, b) => {
    if (countryBias) {
      const aIn = a.countryCode === countryBias ? 1 : 0;
      const bIn = b.countryCode === countryBias ? 1 : 0;
      if (aIn !== bIn) return bIn - aIn;
    }
    if ((b.population || 0) !== (a.population || 0)) return (b.population || 0) - (a.population || 0);
    return a.name.localeCompare(b.name);
  });
}

export async function searchPlaces(query, deps = {}) {
  const { cache, fetchImpl = globalThis.fetch, timeoutMs = 8000, count = 10, language = 'en', countryBias = 'IN' } = deps;
  const name = normalizePlaceInput(query);
  if (!name) return [];
  const key = `geo:${name.toLowerCase()}`;
  const cached = cache?.get(key);
  if (cached) return cached;
  const baseUrl = deps.geocodingUrl || config.openMeteo.geocoding;
  const url = `${baseUrl}?${buildQuery({ name, count, language, format: 'json' })}`;
  const data = await fetchJSON(url, { timeoutMs, fetchImpl });
  const ranked = rankPlaces(parseResults(data), countryBias);
  cache?.set(key, ranked);
  return ranked;
}

export async function resolvePlace(query, deps = {}) {
  const places = await searchPlaces(query, deps);
  return places[0] || null;
}

export function placeLabel(place) {
  if (!place) return null;
  const parts = [place.name];
  if (place.admin1 && place.admin1 !== place.name) parts.push(place.admin1);
  if (place.country) parts.push(place.country);
  return parts.join(', ');
}
