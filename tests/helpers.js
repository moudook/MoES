export function makeFetchStub(routes, fallbackStatus = 404) {
  const calls = [];
  const fn = async (url, options = {}) => {
    const u = String(url);
    calls.push({ url: u, options });
    for (const [pattern, handler] of Object.entries(routes)) {
      if (u.includes(pattern)) {
        const result = handler(u, options);
        if (result === null || result === undefined) break;
        const status = typeof result === 'object' && 'status' in result ? result.status : 200;
        const body = typeof result === 'object' && 'body' in result ? result.body : result;
        return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      }
    }
    return new Response(JSON.stringify({ error: 'no stub for ' + u }), { status: fallbackStatus });
  };
  return { fn, calls };
}

export function geoFixture(name = 'Delhi', lat = 28.65, lon = 77.23) {
  return {
    results: [
      {
        name,
        latitude: lat,
        longitude: lon,
        country: 'India',
        country_code: 'IN',
        admin1: 'National Capital Territory of Delhi',
        timezone: 'Asia/Kolkata',
        population: 11034535,
        feature_code: 'PPLA',
      },
    ],
  };
}

export function forecastFixture(overrides = {}) {
  const today = overrides.today || '2026-10-15';
  const times = [];
  for (let i = 0; i < 16; i += 1) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    times.push(d.toISOString().slice(0, 10));
  }
  const daily = (overrides.daily || {});
  const hourlyTimes = [];
  for (let i = 0; i < 48; i += 1) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCHours(d.getUTCHours() + i);
    hourlyTimes.push(d.toISOString().slice(0, 13) + ':00');
  }
  return {
    latitude: 28.6,
    longitude: 77.2,
    timezone: 'Asia/Kolkata',
    elevation: 220,
    current: {
      time: `${today}T09:30`,
      interval: 900,
      temperature_2m: overrides.currentTemp ?? 22.2,
      relative_humidity_2m: 96,
      apparent_temperature: 25.9,
      is_day: 1,
      precipitation: 1.2,
      weather_code: 81,
      cloud_cover: 98,
      pressure_msl: 1016.5,
      wind_speed_10m: 6.6,
      wind_direction_10m: 111,
      wind_gusts_10m: 45.7,
    },
    daily: {
      time: times,
      weather_code: daily.weather_code || Array.from({ length: 16 }, (_, i) => (i === 0 ? 81 : 3)),
      temperature_2m_max: daily.temperature_2m_max || Array.from({ length: 16 }, (_, i) => 26 + i * 0.5),
      temperature_2m_min: daily.temperature_2m_min || Array.from({ length: 16 }, () => 21),
      sunrise: times.map((t) => `${t}T06:21`),
      sunset: times.map((t) => `${t}T17:51`),
      uv_index_max: Array.from({ length: 16 }, () => 5.3),
      precipitation_sum: daily.precipitation_sum || Array.from({ length: 16 }, (_, i) => (i === 0 ? 17.7 : 0)),
      rain_sum: (daily.rain_sum || Array.from({ length: 16 }, (_, i) => (i === 0 ? 4.4 : 0))),
      precipitation_hours: Array.from({ length: 16 }, () => 7),
      precipitation_probability_max: daily.precipitation_probability_max || Array.from({ length: 16 }, (_, i) => (i === 0 ? 71 : 15)),
      wind_speed_10m_max: Array.from({ length: 16 }, () => 18.1),
      wind_gusts_10m_max: daily.wind_gusts_10m_max || Array.from({ length: 16 }, (_, i) => (i === 0 ? 45.7 : 20)),
      wind_direction_10m_dominant: Array.from({ length: 16 }, () => 119),
    },
    hourly: {
      time: hourlyTimes,
      temperature_2m: hourlyTimes.map(() => 24),
      precipitation_probability: hourlyTimes.map((_, i) => (i < 24 ? 40 : 10)),
      weather_code: hourlyTimes.map(() => 3),
    },
  };
}

export function airFixture() {
  return { current: { time: '2026-10-15T09:30', european_aqi: 70, us_aqi: 90, pm10: 60, pm2_5: 40, ozone: 69 } };
}

export function floodFixture() {
  return { daily: { time: ['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19'], river_discharge: [3, 3, 3, 3, 3] } };
}

export function archiveFixture(year) {
  return {
    daily: {
      time: [`${year}-10-14`, `${year}-10-15`, `${year}-10-16`],
      temperature_2m_max: [31.7, 32, 31.9],
      temperature_2m_min: [20.3, 21.1, 21.1],
      precipitation_sum: [0, 0, 0],
    },
  };
}
