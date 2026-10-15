import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const dotEnv = loadDotEnv(path.join(ROOT, '.env'));
const env = new Proxy({}, {
  get(_t, prop) {
    const name = String(prop);
    if (process.env[name] != null) return process.env[name];
    if (dotEnv[name] != null) return dotEnv[name];
    return undefined;
  },
  has(_t, prop) {
    const name = String(prop);
    return process.env[name] != null || dotEnv[name] != null;
  },
});

const dataDirRaw = env.DATA_DIR || 'data';
const dataDir = path.isAbsolute(dataDirRaw) ? dataDirRaw : path.join(ROOT, dataDirRaw);

export const config = {
  root: ROOT,
  port: toInt(env.PORT, 3000),
  host: env.HOST || '0.0.0.0',
  defaultPlace: env.DEFAULT_PLACE || 'New Delhi, India',
  countryBias: env.COUNTRY_BIAS || 'IN',
  dataDir,
  cacheTtlMs: toInt(env.CACHE_TTL_MS, 10 * 60 * 1000),
  httpTimeoutMs: toInt(env.HTTP_TIMEOUT_MS, 8000),
  openMeteo: {
    forecast: env.OPEN_METEO_FORECAST_URL || 'https://api.open-meteo.com/v1/forecast',
    geocoding: env.OPEN_METEO_GEOCODING_URL || 'https://geocoding-api.open-meteo.com/v1/search',
    airQuality: env.OPEN_METEO_AIR_URL || 'https://air-quality-api.open-meteo.com/v1/air-quality',
    archive: env.OPEN_METEO_ARCHIVE_URL || 'https://archive-api.open-meteo.com/v1/archive',
    flood: env.OPEN_METEO_FLOOD_URL || 'https://flood-api.open-meteo.com/v1/flood',
  },
  gemini: {
    apiKey: env.GEMINI_API_KEY || '',
    model: env.GEMINI_MODEL || 'gemini-2.5-flash',
    baseUrl: env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
    maxToolRounds: toInt(env.GEMINI_MAX_TOOL_ROUNDS, 4),
  },
  email: {
    provider: (env.EMAIL_PROVIDER || 'dev').toLowerCase(),
    from: env.EMAIL_FROM || 'weathergpt@localhost',
    apiKey: env.EMAIL_API_KEY || env.RESEND_API_KEY || env.SENDGRID_API_KEY || '',
    defaultMinSeverity: (env.ALERT_MIN_SEVERITY || 'orange').toLowerCase(),
    admin: env.ALERT_ADMIN_EMAIL || '',
  },
  alertSweepMs: toInt(env.ALERT_SWEEP_MS, 5 * 60 * 1000),
  popularPlaces: (env.POPULAR_PLACES || 'New Delhi,Mumbai,Chennai,Kolkata,Bengaluru,Hyderabad,Pune,Ahmedabad,Guwahati,Bhubaneswar,Patna,Lucknow,Jaipur,Srinagar,Thiruvananthapuram,Kochi,Visakhapatnam,Chandigarh,Raipur,Dehradun').split(',').map((s) => s.trim()).filter(Boolean),
};

export function geminiEnabled() {
  return Boolean(config.gemini.apiKey);
}
