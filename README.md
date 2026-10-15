# WeatherGPT

**Conversational AI for weather forecasting, alerts and climate information.**

Problem statement **SIH26068** · Ministry of Earth Sciences (MoES) / India Meteorological Department ·
Theme: Disaster Management.

Ask about the weather anywhere in plain language. WeatherGPT pulls live numerical-weather-prediction
model data, assesses it against **IMD alert thresholds**, compares it with a five-year climate
baseline, and answers conversationally — with an activity log that shows every step it took.

- **No paid services.** Runs entirely on free, keyless weather APIs.
- **No build step, no dependencies.** Plain Node.js and vanilla browser JavaScript. `node src/server.js` and you are running.
- **Works with or without an LLM key.** A deterministic engine answers everything on its own; a Gemini key switches answers to the model.

---

## 1. Requirements

| | |
|---|---|
| Node.js | 20 or newer (tested on 24). Check with `node --version`. |
| Network | Needed only for the free weather APIs. Nothing to install from npm. |
| API keys | None required. One optional, see [section 5](#5-optional-gemini-key). |

Get Node from <https://nodejs.org> if you do not have it.

## 2. Run it

```bash
git clone <this-repo>
cd MoES
node src/server.js
```

Open **<http://localhost:3000>**.

That is the whole setup. There is no `npm install` because there are no dependencies.

Stop it with `Ctrl+C`.

### Try these

- `current weather in Delhi`
- `will it rain tomorrow in Mumbai`
- `any alerts for Chennai`
- `climate analysis Pune`
- `7 day forecast Kolkata`
- `delhi ka mausam` — Hindi and Hinglish are understood too

Two useful URL switches while looking at the interface:

| URL | What it does |
|---|---|
| `/?demo=1` | Runs two real questions automatically, for rehearsing a talk. |
| `/?log=1` | Opens the activity log panel on load. |
| `/?motion=1` | Forces the typing animation even if the system asks for reduced motion. |

### Command line

```bash
node src/cli.js "current weather in Mumbai"
node src/cli.js "any alerts for Chennai"
node src/cli.js "climate analysis Pune" --json     # full structured response
```

## 3. Tests

```bash
npm test
```

72 tests covering the NLU, the IMD thresholds, response parsing, caching, climate statistics, the
engine flows, the HTTP routes and the Gemini tool-calling loop. Every upstream HTTP call is mocked,
so the suite runs offline.

## 4. Configuration

Copy `.env.example` to `.env` and edit. Everything has a working default, so `.env` is optional.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port. |
| `HOST` | `0.0.0.0` | Bind address. |
| `DEFAULT_PLACE` | `New Delhi, India` | Used when a question names no place. |
| `COUNTRY_BIAS` | `IN` | Geocoding prefers results in this country. |
| `GEMINI_API_KEY` | *(empty)* | Optional. Enables the LLM answers. |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Cheapest free-tier model. |
| `GEMINI_FALLBACK_MODELS` | `gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-2.5-flash,gemini-3.8-flash` | Tried in order if a model is retired, overloaded or unavailable. |
| `CACHE_TTL_MS` | `600000` | How long upstream responses are reused. |
| `HTTP_TIMEOUT_MS` | `8000` | Per-request timeout. |
| `OPEN_METEO_*` | official URLs | Point these elsewhere if you self-host. |

## 5. Optional Gemini key

1. Get a free key at <https://aistudio.google.com/apikey>.
2. Put it in `.env`:

   ```
   GEMINI_API_KEY=your-key-here
   ```

3. Restart. The status line in the top right switches to `engine · Gemini gemini-3.5-flash-lite`.

With a key, answers come from Gemini with function calling, and the model is instructed to reply in
the language the question was asked in. **If the key is missing, invalid, rate-limited or the model
is overloaded, the deterministic engine answers instead** — the demo cannot go blank.

Model choice, verified against Google's documentation and live probes in October 2026:
`gemini-3.5-flash-lite` is the cheapest free-tier text model and the one Google recommends for new
projects. The older `gemini-2.5-flash-lite` is no longer available to new users. Requests go to
`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.

## 6. Docker

```bash
docker build -t weathergpt .
docker run -p 3000:3000 --env-file .env weathergpt
```

or

```bash
docker compose up
```

## 7. What it does

| Problem-statement requirement | Where it lives |
|---|---|
| Real-time weather | `src/services/weather.js` — current conditions, 16-day daily series, hourly, air quality, river discharge |
| Natural-language querying | `src/services/dialog.js` — intent, place, date and parameter extraction from English, Hindi and Hinglish |
| NWP model integration | Open-Meteo serves NOAA GFS, DWD ICON, ECMWF IFS and Météo-France AROME output |
| Extreme-weather alerts | `src/lib/imd.js` — colour-coded thresholds with the triggering number attached |
| Location-based advisories | Any place on Earth via geocoding; per-sector advice for the public, farmers, aviation, urban and health |
| Multilingual | The deterministic engine understands Hindi and Hinglish; Gemini is instructed to answer in whatever language it was asked |
| Climate trends | `src/services/climate.js` — five-year same-day baseline and the anomaly against it |
| Mobile | Single-column layout, 44px touch targets, safe-area padding, three image sizes for the background |

### Data sources (all free, all keyless)

| Source | Used for |
|---|---|
| [Open-Meteo Forecast](https://open-meteo.com) | Current conditions and 16-day forecast |
| [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) | Turning "Mumbai" into coordinates |
| [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) | AQI, PM2.5, PM10 |
| [Open-Meteo Flood](https://open-meteo.com/en/docs/flood-api) | River discharge trend |
| [Open-Meteo Archive](https://open-meteo.com/en/docs/historical-weather-api) | Five years of same-day history |

### Alert criteria

Thresholds follow IMD practice and are applied to model output over the next three days.

| Hazard | Watch | Warning | Warning (highest) |
|---|---|---|---|
| Rainfall, 24h | ≥ 35 mm and ≥ 50% probability | ≥ 64.5 mm | ≥ 115.5 mm (≥ 204.5 mm extremely heavy) |
| Thunderstorm | WMO code 95/96/99 | with ≥ 50 mm rain | — |
| Heat, plains Mar–Jul | ≥ 40 °C | ≥ 42 °C | ≥ 45 °C |
| Cold, plains Nov–Feb | ≤ 10 °C | — | ≤ 4 °C |
| Wind gusts | — | ≥ 62 km/h (squall) | ≥ 90 km/h (cyclonic strength) |
| Fog | WMO 45/48 in cold season | — | — |
| River flood | — | discharge rising ≥ 50% with heavy rain | — |

Every warning carries the number that triggered it, so the answer stays auditable.

**This is not an official IMD bulletin.** It is model output scored against public thresholds.

## 8. Architecture

```
browser ── POST /api/chat ──► Engine ──► NLU intent + place + date
                                   │
                                   ├─► geocoding ──► forecast · air quality · flood
                                   ├─► IMD thresholds ──► warnings + advisories
                                   ├─► historical archive ──► 5-year baseline (on demand)
                                   └─► Gemini (optional) or deterministic answer builder
```

```
src/
  config.js              env and defaults
  server.js              HTTP API, static files, request log
  cli.js                 terminal client
  lib/
    net.js               fetch with timeout and retry, TTL cache
    imd.js               alert criteria and advisory text
    wmo.js               weather-code dictionary
    format.js            formatting helpers
  services/
    engine.js            orchestration and sessions
    dialog.js            deterministic NLU
    respond.js           deterministic answer text
    weather.js           forecast, air quality, flood
    climate.js           historical baseline and anomaly
    alerts.js            warning assembly
    geocode.js           place resolution, India-first
    gemini.js            function calling, model fallback
public/
  index.html             structure
  tokens.css             design tokens, including the colour rules
  styles.css             layout and components
  app.js                 markdown reader, typewriter, activity log
  bg-1920.jpg            background plate at three widths
tests/                   node:test suite
```

### The interface

The layout is built around a single photograph of a train window. The view in the middle is left
alone; the conversation sits on the left and the instruments on the right, both on tinted glass
that keeps the photograph visible.

Some decisions worth knowing about, because they were deliberate:

- **Colour is taken from the photograph** — the teal of the carriage interior, the copper of the
  window frame, the blue of the sky. No palette was imported from a trend.
- **Colour never carries text.** Copper measures 2.8:1 against the glass and cannot legally be text
  colour, so it is used for fills, rules, dots and underlines. Severity is a coloured dot plus the
  words "red warning", so it survives colour blindness and a greyscale print.
- **Data series never reuse a semantic colour.** Orange means warning in this interface, so the
  maximum-temperature line is white, not orange.
- **Opacity does not carry hierarchy here.** Text sits on a photograph, where a faded label is not
  reliably readable. Hierarchy comes from size, weight and spacing instead.
- Corners follow Apple's concentric principle: an inner radius is an outer radius minus the gap,
  and where the browser supports it, `corner-shape: squircle` gives Apple's continuous curve.

## 9. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `EADDRINUSE` | Another process holds port 3000. Use `PORT=4000 node src/server.js`. |
| Answers say "forecast service is temporarily unavailable" | No network, or Open-Meteo is down. Retry; the cache serves the last good answer meanwhile. |
| Status shows the deterministic engine despite a key | The key was not picked up — check `.env` exists next to `package.json` and restart. |
| Background looks wrong | Only `public/bg-*.jpg` matter; they are generated from `actual_bg.png`. |
| Answers come back in the wrong language | Expected without a Gemini key: the deterministic engine always answers in English. |

## 10. Attribution

Weather data from [Open-Meteo](https://open-meteo.com), CC BY 4.0, derived from NOAA GFS, DWD ICON,
ECMWF IFS and Météo-France AROME. Alert thresholds follow publicly documented IMD practice.
WeatherGPT is not affiliated with, endorsed by, or a product of the Ministry of Earth Sciences or
the India Meteorological Department.