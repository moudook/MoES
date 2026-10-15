# Project status — read this first

**WeatherGPT** · problem statement SIH26068 · Ministry of Earth Sciences / IMD · Disaster Management
Last updated: 15 October 2026

This file exists so you can review the whole build without reading the chat history.
`README.md` is the user-facing guide; this one is the engineering review.

---

## Run it in 30 seconds

```bash
node src/server.js          # then open http://localhost:3000
npm test                    # 72 tests
```

No `npm install`. There are no dependencies. No API key is required.

Optional: put a free Gemini key in `.env` as `GEMINI_API_KEY=...` and restart.

---

## What is finished

| Area | Status | Where |
|---|---|---|
| Conversational NLU, English + Hindi + Hinglish input | done | `src/services/dialog.js` |
| Live forecast, 16-day daily, hourly, air quality, river discharge | done | `src/services/weather.js` |
| Geocoding, India-first ranking | done | `src/services/geocode.js` |
| IMD-criteria alert engine with auditable thresholds | done | `src/lib/imd.js` |
| Per-sector advisories (public, farmers, aviation, urban, health) | done | `src/lib/imd.js` |
| Five-year climate baseline and anomaly | done | `src/services/climate.js` |
| Gemini function calling with automatic model fallback | done | `src/services/gemini.js` |
| Deterministic answer path when no key exists | done | `src/services/respond.js` |
| HTTP API, CLI, session memory | done | `src/server.js`, `src/cli.js` |
| Chat interface: glass panels over the photograph | done | `public/` |
| Custom markdown reader written for this interface | done | `public/app.js` |
| Streaming typewriter reveal | done | `public/app.js` |
| Activity log (UI and server) | done | `public/app.js`, `src/server.js` |
| Honest loading, empty and error states | done | `public/app.js` |
| Background plate generated at three widths | done | `public/bg-*.jpg` |
| Screenshot tool for real viewport sizes | done | `tools/screenshot.mjs` |
| README setup guide | done | `README.md` |
| Docker and compose files | written, **never built** (Docker not installed on this machine) | `Dockerfile` |

## Explicitly out of scope

Decided during the build, on purpose:

- **Voice input and text-to-speech** — you asked to leave it out.
- **Email alerts and subscriptions** — you asked to leave it out.
- **Any paid service.** Everything runs on free, keyless APIs.
- **Localisation of the interface.** The interface is English only. The *engine* understands Hindi
  and Hinglish questions, and Gemini is instructed to answer in whatever language it was asked in.

---

## How it was verified

| Check | Result |
|---|---|
| `npm test` | 72 passed, 0 failed |
| Live API, real data | Verified against the live Open-Meteo API on 15 Oct 2026 |
| Gemini with your real key | Verified — answered in English and in Hinglish correctly |
| Desktop render at 1440×980 | Inspected visually |
| Mobile render at a true 390×844 viewport | Inspected visually, zero horizontal overflow |
| Markdown rendering | Inspected visually with a real Gemini answer |
| Typewriter reveal | Inspected mid-animation |
| Activity log | Inspected visually |

### The screenshot tool

```bash
node tools/screenshot.mjs --url "http://localhost:3000/?demo=1" \
  --out shot.png --width 390 --height 844
```

It drives the DevTools protocol rather than `--window-size`, because on Windows both Chrome and
Edge clamp the window to roughly 485px and then hand you a **crop** of a wider viewport. That crop
looks exactly like a layout bug and cost real time here. The tool also prints whether the page has
horizontal overflow, so this cannot be fooled again.

Useful URL switches: `?demo=1` runs two real questions, `?log=1` opens the activity log,
`?motion=1` forces the typing animation even when the system asks for reduced motion.

---

## Decisions worth knowing about

### Interface

The layout is a photograph of a train window. The conversation sits on the left, the instruments on
the right, and the pair is **centred** so the window reads on both sides.

- Colour was taken from the photograph: the teal of the carriage interior, the copper of the window
  frame, the blue of the sky. Nothing was imported from a trend palette.
- **Colour never carries text.** Copper measures 2.8:1 against the glass, so it is only ever a
  fill, a rule, a dot or an underline. Severity is a coloured dot plus the words "red warning", so
  it survives colour blindness and a greyscale print.
- **Data series never reuse a semantic colour.** Orange means warning in this interface, so the
  maximum-temperature line is white, not orange.
- **Opacity does not carry hierarchy here.** Text sits on a photograph, where a faded label is not
  reliably readable. Hierarchy comes from size, weight and spacing instead.
- Corners follow Apple's concentric principle (inner radius = outer radius − gap), and where the
  browser supports it, `corner-shape: squircle` gives Apple's continuous curve.
- All design tokens and the reasoning behind the palette are written out in `public/tokens.css`.

### Behaviour

- **Gemini is optional.** If the key is missing, invalid, rate-limited, or the model is overloaded,
  the deterministic engine answers instead. The demo cannot go blank.
- **Model fallback chain.** `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` → `gemini-2.5-flash` →
  `gemini-3.8-flash`. Retired or overloaded models are skipped automatically. This was verified by
  live probe: `gemini-2.5-flash-lite` now returns 404 for new users, and the `3.6`/`3.7`/`3.8`
  models were returning 503 under load at the time of testing.
- **Answers take 7 to 12 seconds** with Gemini enabled. The wait state shows a live elapsed timer
  rather than pretending to be fast. The deterministic path answers in well under a second.
- **The typewriter cannot stall.** It uses wall-clock time, a minimum step per frame and a hard
  deadline, so a backgrounded tab cannot leave an answer half-rendered forever.

### Honesty rules baked into the interface

- The provenance line sits with the data, not in a footer: *NOAA GFS · DWD ICON · ECMWF IFS via
  Open-Meteo. Not an official IMD bulletin.*
- Every warning shows the number that triggered it.
- No pulsing "live" badge, no decorative status, no fake data anywhere.
- If a place cannot be resolved, the interface says so and offers a retry instead of showing zeros.

---

## Honest limitations

1. **Docker was never built.** The `Dockerfile` and `docker-compose.yml` are written but unverified,
   because Docker is not installed on this machine. Treat them as untested.
2. **The background plate is the photograph you supplied.** It carries faint generation artefacts in
   the sky. They are barely visible under the interface; an automated inpainting attempt was made
   and produced corrupt output, so it was reverted rather than shipped.
3. **Alert thresholds are IMD practice applied to model output**, not an official IMD product. The
   interface says so wherever warnings appear.
4. **Rainfall warning thresholds are not spatially aware.** IMD's real criteria are local; these
   are flat plains values applied anywhere. Heat and cold warnings are gated to their seasons but
   not to the region.
5. **Answers are model output.** During live testing Gemini occasionally produced lightly awkward
   phrasing, though it followed the required structure.
6. **The activity log records only real events.** It shows what actually happened, including when
   Gemini falls back to the deterministic engine.

---

## Where to look in the code

```
src/config.js              env parsing and defaults, zero-dependency .env reader
src/server.js              routing, static files, request logging, cache warm-up
src/cli.js                 terminal client
src/lib/net.js             fetch with timeout and retry, TTL cache
src/lib/imd.js             alert thresholds and advisory text
src/lib/wmo.js             weather-code dictionary
src/lib/format.js          formatting helpers
src/services/engine.js     orchestration, sessions, structured cards
src/services/dialog.js     deterministic NLU
src/services/respond.js    deterministic answer text
src/services/weather.js    forecast, air quality, flood
src/services/climate.js    five-year baseline and anomaly
src/services/alerts.js     warning assembly
src/services/geocode.js    place resolution
src/services/gemini.js     function calling and model fallback
public/tokens.css          design tokens and the colour reasoning
public/styles.css          layout and components
public/app.js              markdown reader, typewriter, activity log, panels
public/index.html          structure
tools/screenshot.mjs       real-viewport screenshots with overflow detection
tests/                     72 node:test tests, all upstream HTTP mocked
```

---

## Questions a reviewer should press on

1. Would the alert thresholds mislead a user in a region they are not written for?
2. Is a conversational interface the right shape for a disaster-management warning, or does a
   warning need to interrupt rather than wait to be asked?
3. Does the deterministic fallback make the LLM look optional when the LLM is the real product?
4. Is the photograph helping comprehension, or is it decoration that costs legibility?
5. What happens when Open-Meteo changes its response shape? There is no contract test against the
   live API.