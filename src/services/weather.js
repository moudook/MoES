import { buildQuery, fetchJSON, TTLCache, ApiError } from '../lib/net.js';
import { config } from '../config.js';

const CURRENT_FIELDS = 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
const DAILY_FIELDS = 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,rain_sum,precipitation_hours,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant';
const HOURLY_FIELDS = 'temperature_2m,precipitation_probability,weather_code';

export function normalizeForecast(raw) {
  if (!raw || !raw.daily || !Array.isArray(raw.daily.time) || raw.daily.time.length === 0) {
    throw new ApiError('Forecast response missing daily data', 502, 'forecast');
  }
  const d = raw.daily;
  const daily = d.time.map((date, i) => ({
    date,
    code: d.weather_code?.[i] ?? null,
    tmax: d.temperature_2m_max?.[i] ?? null,
    tmin: d.temperature_2m_min?.[i] ?? null,
    sunrise: d.sunrise?.[i] ?? null,
    sunset: d.sunset?.[i] ?? null,
    uv: d.uv_index_max?.[i] ?? null,
    precipSum: d.precipitation_sum?.[i] ?? null,
    rainSum: d.rain_sum?.[i] ?? null,
    precipHours: d.precipitation_hours?.[i] ?? null,
    pop: d.precipitation_probability_max?.[i] ?? null,
    windMax: d.wind_speed_10m_max?.[i] ?? null,
    gustMax: d.wind_gusts_10m_max?.[i] ?? null,
    windDir: d.wind_direction_10m_dominant?.[i] ?? null,
  }));

  const hourly = [];
  if (raw.hourly && Array.isArray(raw.hourly.time)) {
    raw.hourly.time.forEach((time, i) => {
      hourly.push({
        time,
        temp: raw.hourly.temperature_2m?.[i] ?? null,
        pop: raw.hourly.precipitation_probability?.[i] ?? null,
        code: raw.hourly.weather_code?.[i] ?? null,
      });
    });
  }

  const c = raw.current || {};
  return {
    current: {
      time: c.time ?? null,
      temp: c.temperature_2m ?? null,
      feelsLike: c.apparent_temperature ?? null,
      humidity: c.relative_humidity_2m ?? null,
      isDay: c.is_day === 1,
      precipitation: c.precipitation ?? null,
      code: c.weather_code ?? null,
      cloudCover: c.cloud_cover ?? null,
      pressure: c.pressure_msl ?? null,
      windSpeed: c.wind_speed_10m ?? null,
      windDir: c.wind_direction_10m ?? null,
      windGust: c.wind_gusts_10m ?? null,
    },
    daily,
    hourly,
    tz: raw.timezone || null,
    elevation: raw.elevation ?? null,
    lat: raw.latitude ?? null,
    lon: raw.longitude ?? null,
  };
}

export async function getForecast(place, deps = {}) {
  const {
    cache = new TTLCache(config.cacheTtlMs),
    fetchImpl = globalThis.fetch,
    timeoutMs = config.httpTimeoutMs,
    days = 16,
    baseUrl = config.openMeteo.forecast,
  } = deps;
  const key = `wx:${Number(place.lat).toFixed(2)}:${Number(place.lon).toFixed(2)}:${days}`;
  const cached = cache.get(key);
  if (cached) return { ...cached, cached: true };

  const url = `${baseUrl}?${buildQuery({
    latitude: place.lat,
    longitude: place.lon,
    current: CURRENT_FIELDS,
    hourly: HOURLY_FIELDS,
    daily: DAILY_FIELDS,
    timezone: 'auto',
    forecast_days: days,
  })}`;
  const raw = await fetchJSON(url, { timeoutMs, fetchImpl });
  const forecast = normalizeForecast(raw);
  cache.set(key, forecast);
  return { ...forecast, cached: false };
}

export async function getAirQuality(place, deps = {}) {
  const { cache = new TTLCache(config.cacheTtlMs), fetchImpl = globalThis.fetch, timeoutMs = config.httpTimeoutMs, baseUrl = config.openMeteo.airQuality } = deps;
  const key = `aq:${Number(place.lat).toFixed(2)}:${Number(place.lon).toFixed(2)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const url = `${baseUrl}?${buildQuery({
    latitude: place.lat,
    longitude: place.lon,
    current: 'european_aqi,us_aqi,pm10,pm2_5,ozone',
    timezone: 'auto',
  })}`;
  const data = await fetchJSON(url, { timeoutMs, fetchImpl });
  const c = data?.current || {};
  const result = {
    aqi: c.us_aqi ?? c.european_aqi ?? null,
    aqiUnit: c.us_aqi != null ? 'US AQI' : 'EU AQI',
    pm25: c.pm2_5 ?? null,
    pm10: c.pm10 ?? null,
    ozone: c.ozone ?? null,
  };
  if (result.aqi == null) return null;
  cache.set(key, result);
  return result;
}

export async function getRiverTrend(place, deps = {}) {
  const { cache = new TTLCache(config.cacheTtlMs), fetchImpl = globalThis.fetch, timeoutMs = config.httpTimeoutMs, baseUrl = config.openMeteo.flood } = deps;
  const key = `flood:${Number(place.lat).toFixed(2)}:${Number(place.lon).toFixed(2)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const url = `${baseUrl}?${buildQuery({ latitude: place.lat, longitude: place.lon, daily: 'river_discharge', forecast_days: 5 })}`;
  const data = await fetchJSON(url, { timeoutMs, fetchImpl });
  const values = (data?.daily?.river_discharge || []).filter((v) => v != null);
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  if (first == null || first <= 0) return null;
  const trend = (last - first) / first;
  const result = { values, trend: Math.round(trend * 1000) / 1000 };
  cache.set(key, result);
  return result;
}

export function findDay(forecast, dateStr) {
  if (!dateStr) return null;
  return forecast.daily.find((d) => d.date === dateStr) || null;
}

export function dayByOffset(forecast, offset, todayStr) {
  const target = forecast.daily.find((d) => d.date === todayStr);
  if (!target) return null;
  const idx = forecast.daily.indexOf(target);
  return forecast.daily[Math.min(Math.max(idx + offset, 0), forecast.daily.length - 1)];
}

export function chartSeries(forecast, startIndex = 0, count = 7) {
  const days = forecast.daily.slice(startIndex, startIndex + count);
  return {
    labels: days.map((d) => d.date),
    tmax: days.map((d) => d.tmax),
    tmin: days.map((d) => d.tmin),
    rain: days.map((d) => d.rainSum ?? d.precipSum ?? 0),
    pop: days.map((d) => d.pop ?? 0),
  };
}
