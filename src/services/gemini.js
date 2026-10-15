import { fetchJSON } from '../lib/net.js';
import { config, geminiEnabled } from '../config.js';

const TOOL_DECLARATIONS = [
  {
    name: 'get_current_weather',
    description: 'Get current weather conditions (temperature, humidity, wind, air quality) for a named place.',
    parameters: {
      type: 'object',
      properties: {
        place: { type: 'string', description: 'City or place name, e.g. "Mumbai" or "Guwahati, Assam"' },
      },
      required: ['place'],
    },
  },
  {
    name: 'get_forecast',
    description: 'Get the multi-day weather forecast for a place.',
    parameters: {
      type: 'object',
      properties: {
        place: { type: 'string', description: 'City or place name' },
        days: { type: 'integer', description: 'Number of days (1-16)', default: 3 },
      },
      required: ['place'],
    },
  },
  {
    name: 'get_alerts',
    description: 'Get active weather alerts evaluated with IMD criteria (heatwave, heavy rain, thunderstorm, squall, cold wave, fog, flood watch) for a place.',
    parameters: {
      type: 'object',
      properties: {
        place: { type: 'string', description: 'City or place name' },
      },
      required: ['place'],
    },
  },
  {
    name: 'get_climate_anomaly',
    description: 'Compare today’s forecast for a place with the historical baseline for the same calendar dates over the last 5 years.',
    parameters: {
      type: 'object',
      properties: {
        place: { type: 'string', description: 'City or place name' },
      },
      required: ['place'],
    },
  },
  {
    name: 'get_air_quality',
    description: 'Get current air quality index and pollutants for a place.',
    parameters: {
      type: 'object',
      properties: {
        place: { type: 'string', description: 'City or place name' },
      },
      required: ['place'],
    },
  },
];

const SYSTEM_INSTRUCTION = [
  'You are WeatherGPT, a conversational weather intelligence assistant built for the Ministry of Earth Sciences (MoES) / India Meteorological Department, focused on disaster management.',
  'You answer questions about weather forecasts, IMD-criteria alerts, and climate information for any location on Earth, with special care for Indian locations.',
  'Rules:',
  '1. Always call the provided tools to fetch live data. Never invent temperatures, rainfall, or alerts.',
  '2. LANGUAGE: Always reply in exactly the language the user wrote in. If the user writes Hindi (Devanagari) or Hinglish (romanised Hindi), reply in that same language; if English, reply in English; for any other language, reply in that language. Never switch the user to English, and never hardcode one language for all replies.',
  '3. Keep answers under 120 words unless the user asks for detail.',
  '4. When alerts exist, state the IMD colour severity and the criterion, plus one action per affected sector (general, farmers, aviation, urban).',
  '5. If the question is unrelated to weather or climate, briefly say you only handle weather intelligence.',
  '6. Mention data comes from NWP models (GFS/ICON/ECMWF via Open-Meteo) when relevant, and is not an official IMD bulletin.',
].join('\n');

function safeStringArg(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export async function geminiAnswer({ message, history = [], context = null, toolExecutor, deps = {} }) {
  const {
    fetchImpl = globalThis.fetch,
    timeoutMs = Math.max(config.httpTimeoutMs, 15000),
    model = config.gemini.model,
    baseUrl = config.gemini.baseUrl,
  } = deps;
  const apiKey = deps.apiKey !== undefined ? deps.apiKey : config.gemini.apiKey;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const contents = [...history];
  let userParts = [{ text: message }];
  if (context) {
    userParts.push({ text: `Live context already fetched for "${context.placeLabel}":\n${JSON.stringify(context.summary).slice(0, 4000)}` });
  }
  contents.push({ role: 'user', parts: userParts });

  for (let round = 0; round < config.gemini.maxToolRounds; round += 1) {
    const url = `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const data = await fetchJSON(url, {
      method: 'POST',
      timeoutMs,
      fetchImpl,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        tools: [{ function_declarations: TOOL_DECLARATIONS }],
        contents,
      }),
    });

    if (data.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked the prompt: ${data.promptFeedback.blockReason}`);
    }
    const candidate = data.candidates?.[0];
    if (!candidate?.content?.parts) throw new Error('Gemini returned no content');

    const functionCalls = candidate.content.parts.filter((p) => p.functionCall);
    const text = candidate.content.parts.filter((p) => p.text).map((p) => p.text).join('\n').trim();

    if (functionCalls.length === 0) {
      if (!text) throw new Error('Gemini returned empty text');
      return { text, mode: 'gemini', model };
    }

    contents.push({ role: 'model', parts: candidate.content.parts });

    const functionResponses = [];
    for (const part of functionCalls) {
      const name = part.functionCall.name;
      const args = part.functionCall.args || {};
      let result;
      try {
        result = await toolExecutor({
          name,
          args: {
            place: safeStringArg(args.place, context?.place || ''),
            days: Number.isFinite(args.days) ? Math.min(Math.max(Number(args.days), 1), 16) : 3,
          },
        });
      } catch (error) {
        result = { error: String(error.message || error) };
      }
      functionResponses.push({ functionResponse: { name, response: result } });
    }
    contents.push({ role: 'user', parts: functionResponses });
  }
  throw new Error('Gemini exceeded tool-call rounds');
}

export function summaryForContext(place, forecast, air, alerts) {
  return {
    placeLabel: place?.label || '',
    timezone: forecast?.tz || place?.timezone || null,
    current: forecast?.current || null,
    today: forecast?.daily?.[0] || null,
    nextDays: forecast?.daily?.slice(0, 3) || [],
    alerts: (alerts || []).slice(0, 5).map((a) => ({
      hazard: a.hazard,
      severity: a.severity,
      title: a.title,
      criteria: a.criteria,
      date: a.date,
    })),
    air: air || null,
    source: 'Open-Meteo NWP',
  };
}
