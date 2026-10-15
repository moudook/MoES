# WeatherGPT

**Conversational AI for Weather Forecasting, Alerts, and Climate Information**

Problem statement: **SIH26068 · Ministry of Earth Sciences (MoES) · India Meteorological Department · Theme: Disaster Management**

WeatherGPT is a full-stack conversational weather-intelligence platform. Ask anything about weather
in plain language (English, Hindi or Hinglish) and it fetches live NWP (numerical weather
prediction) model data, evaluates it with **IMD alert criteria**, compares it against
historical climate baselines, and answers conversationally — with sector-wise advisories for
farmers, aviation, urban and health stakeholders.

- **Zero paid dependencies** — runs on free APIs only, no package install required (`node src/server.js`)
- **Works without any API key** — deterministic multilingual engine handles everything out of the box
- **Gemini-ready** — set `GEMINI_API_KEY` (free tier) and the same queries are answered by the LLM with function calling, in the user's own language

## Quickstart

```bash
node src/server.js          # start (no npm install needed — zero dependencies)
# open http://localhost:3000
```

```bash
node src/cli.js "current weather in Mumbai"
node src/cli.js "will it rain tomorrow in Delhi"
node src/cli.js "any alerts for Kolkata"
node src/cli.js "climate analysis pune"
node src/cli.js "delhi ka mausam"          # Hinglish works too
```

Test suite:

```bash
npm test        # 65 tests, node:test, fully mocked — runs offline
```

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  Chat UI (public/) — chat, 7-day chart, live alerts panel          │
│  POST /api/chat   GET /api/weather   GET /api/alerts               │
│  GET /api/places  GET /api/config   GET /api/health                │
└────────────────────────────────────────────────────────────────────┘
                                │
┌────────────────────────────────────────────────────────────────────┐
│  Engine (src/services/engine.js)                                   │
│   ├── NLU  (dialog.js)      intent · place · day · language        │
│   ├── Data  (weather.js)    forecast · air quality · river         │
│   ├── IMD   (lib/imd.js)    thresholds → yellow / orange / red     │
│   ├── Climate (climate.js)  5-year archive baseline + anomaly      │
│   ├── Answers (respond.js)  deterministic templates                │
│   └── Gemini (gemini.js)    function calling (OPTIONAL, free key)  │
│                                                                     │
│   Free data sources (no keys at all):                               │
│   • Open-Meteo Forecast API — GFS / ICON / ECMWF / Arome NWP       │
│   • Open-Meteo Geocoding API — any place on Earth                   │
│   • Open-Meteo Air Quality API — US/EU AQI, PM2.5/PM10              │
│   • Open-Meteo Flood API — river discharge trend                    │
│   • Open-Meteo Historical Archive — 80+ years climate normals       │
└────────────────────────────────────────────────────────────────────┘
```

## How the problem-statement requirements are covered

| PS key feature (SIH26068) | Implementation |
|---|---|
| 1. Real-time weather information | `getForecast` current conditions: temperature, feels-like, humidity, wind, gusts, pressure, cloud, WMO-coded conditions, air quality |
| 2. Natural-language querying | Deterministic NLU (`dialog.js`) extracts intent, place, date offset and parameters from messy English/Hinglish/Hindi input |
| 3. NWP model integration (GFS/WRF) | Open-Meteo serves GFS/ICON/ECMWF/AROME model output; hourly + 16-day daily series |
| 4. Extreme weather alerts & early warning | IMD-criteria engine (`lib/imd.js`): colour-coded yellow/orange/red alerts with criteria strings and advisors |
| 5. Location-based forecasting & advisories | Any place via geocoding; per-sector advisories (general / farmers / urban / aviation / health) |
| 6. Multilingual support | Hindi and Hinglish understood by the deterministic engine; when Gemini is configured, it answers in the exact language of the user |
| 7. Climate trends & historical analysis | 5-year same-day baseline from the historical archive + temperature/rain anomaly |
| 8. Voice-enabled interaction | *(not in this build)* |
| Mobile-based platform | Mobile-responsive PWA-style UI; CORS-enabled JSON API so any client can integrate |
| Scalable architecture | Stateless handlers, in-memory + TTL cache, zero-dependency Node, optional in-file caching of upstream calls, Docker-ready |

## Alert criteria (IMD-style, evaluated on NWP data)

| Hazard | Yellow watch | Orange warning | Red warning |
|---|---|---|---|
| Rainfall (24h) | ≥ 35 mm & P ≥ 50% | ≥ 64.5 mm | ≥ 115.5 mm (≥ 204.5 mm: extremely heavy) |
| Thunderstorm | WMO 95/96/99 | with ≥ 50 mm rain | — |
| Heat (plains, Mar–Jul) | Tmax ≥ 40 °C | ≥ 42 °C | ≥ 45 °C |
| Cold (plains, Nov–Feb) | Tmin ≤ 10 °C | — | Tmin ≤ 4 °C |
| Wind gusts | — | ≥ 62 km/h (squall) | ≥ 90 km/h (cyclonic) |
| Fog | WMO 45/48, cold season | — | — |
| River flood | — | discharge rising ≥ 50% with heavy rain | — |

Every alert ships with the exact criterion that triggered it, so answers stay auditable —
important for a disaster-management context.

## HTTP API

```bash
# conversational
POST /api/chat            {"message":"will it rain tomorrow in Mumbai","sessionId":"web"}

# structured data
GET  /api/weather?place=Chennai      # current + 7-day series + AQI + river trend
GET  /api/alerts?place=Kolkata       # assessed IMD alerts, 3-day window
GET  /api/places?q=guw               # geocoding suggestions
GET  /api/config                     # feature flags for the UI
GET  /api/health                     # uptime / gemini status
```

Each `/api/chat` response includes `cards` (place, current, today, 7-day chart series, air,
alerts, worst severity) so the UI renders rich cards without extra requests.

## Gemini setup (free, optional)

1. Get a free key at https://aistudio.google.com/apikey
2. Copy `.env.example` to `.env` and set:

```
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-2.5-flash
```

3. Restart. The chat UI status chip switches from "deterministic engine" to Gemini, and the
   system instruction instructs the model to answer in the user's language and to ground every
   answer in tool calls (`get_current_weather`, `get_forecast`, `get_alerts`,
   `get_climate_anomaly`, `get_air_quality`).

If Gemini errors or quota is exhausted, the deterministic engine answers automatically — the
demo can never go blank.

## Testing

```
npm test                       # 65 tests: NLU, IMD thresholds, parsing, caching,
                               # climate stats, engine flows, HTTP routes, Gemini tool loop
node --test tests/*.test.js    # explicit
```

All upstream HTTP is mocked in tests (`tests/helpers.js`), so CI runs fully offline.
Live behaviour was verified against the real Open-Meteo API.

## Docker

```bash
docker build -t weathergpt .
docker run -p 3000:3000 --env-file .env weathergpt
# or
docker compose up
```

## Project layout

```
src/
  config.js           env + defaults (zero-dependency .env parser)
  server.js           HTTP API + static UI
  cli.js              terminal client
  lib/
    net.js            fetchJSON (timeout/retry), TTL cache
    imd.js            IMD alert criteria engine + advisors
    wmo.js            WMO weather-code dictionary
    format.js         formatting helpers (compass, AQI, dates)
  services/
    engine.js         orchestration (chat pipeline, sessions, cards)
    dialog.js         deterministic NLU (intent/place/day/language)
    respond.js        English deterministic answer templates
    weather.js        Open-Meteo forecast / air quality / flood
    climate.js        historical baseline + anomaly
    alerts.js         alert assembly
    geocode.js        place resolution (India-first ranking)
    gemini.js         Gemini function calling (optional)
public/               chat UI (vanilla JS, no build step)
tests/                node:test suite (offline, mocked fetch)
```

## Data attribution

Weather data: [Open-Meteo](https://open-meteo.com) (CC BY 4.0) from NOAA GFS, DWD ICON,
ECMWF IFS, Météo-France AROME etc. Alerts are evaluated with IMD-style thresholds on model
output — **this is not an official IMD bulletin**.
