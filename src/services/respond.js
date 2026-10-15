import { weatherInfo } from '../lib/wmo.js';
import { SEVERITY_LABEL } from '../lib/imd.js';
import { compass, fmt, windText, aqiInfo, weekdayShort, round } from '../lib/format.js';
import { dayByOffset } from './weather.js';
import { highestSeverity } from './alerts.js';

function tempText(temp) {
  if (temp == null) return '—';
  return `${Math.round(temp)}°C`;
}

export function composeCurrent(nlu, bundle) {
  const { current, placeLabel, forecast, air } = bundle;
  if (!current) return null;
  const w = weatherInfo(current.code);
  const localTime = current.time ? current.time.slice(11, 16) : '—';

  const details = [
    `Humidity ${current.humidity ?? '—'}%`,
    `wind ${fmt(current.windSpeed, 0)} km/h ${compass(current.windDir) || ''}`,
  ];
  if (current.windGust != null) details.push(`gusts ${Math.round(current.windGust)} km/h`);
  if (current.cloudCover != null) details.push(`cloud ${current.cloudCover}%`);
  if (current.pressure != null) details.push(`pressure ${Math.round(current.pressure)} hPa`);
  if (air) {
    const info = aqiInfo(air.aqi);
    details.push(`air quality ${air.aqi} (${info.label})${air.pm25 != null ? ` · PM2.5 ${round(air.pm25, 1)} µg/m³` : ''}`);
  }

  return [
    `📍 ${placeLabel} — right now (local ${localTime})`,
    `🌤️ ${w.en}, ${tempText(current.temp)} (feels ${tempText(current.feelsLike)})`,
    details.join(' · '),
  ].join('\n');
}

export function composeRainCheck(nlu, bundle) {
  const { forecast, forecast: { daily }, todayStr, placeLabel } = bundle;
  const offset = nlu.dayOffset ?? 0;
  const day = dayByOffset(bundle.forecast, offset, todayStr) || daily[0];
  const w = weatherInfo(day.code);
  const dayName = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : offset === 2 ? 'Day after tomorrow' : weekdayShort(day.date);
  const pop = day.pop ?? 0;
  const amount = day.precipSum ?? 0;
  const willRain = pop >= 50 || amount >= 2;
  const verdict = willRain
    ? `Yes — rain likely ${dayName.toLowerCase() === 'today' ? 'today' : dayName.toLowerCase()} in ${placeLabel}: ${pop}% chance, around ${round(amount, 1)} mm expected.`
    : `No — rain unlikely ${dayName.toLowerCase()} in ${placeLabel}: ${pop}% chance, around ${round(amount, 1)} mm.`;
  return [verdict, `Conditions: ${w.en}`].join('\n');
}

export function composeForecast(nlu, bundle) {
  const { forecast, todayStr, placeLabel } = bundle;
  const days = forecast.daily.slice(0, 3);
  const lines = days.map((day) => {
    const w = weatherInfo(day.code);
    const label = day.date === todayStr ? 'Today' : weekdayShort(day.date);
    const rain = (day.rainSum ?? day.precipSum ?? 0);
    return `${label}: ${w.en}, ${Math.round(day.tmax)}°/${Math.round(day.tmin)}°C, rain ${round(rain, 1)}mm (${day.pop ?? 0}%), UV max ${round(day.uv, 1)}`;
  });
  return [
    `📅 ${placeLabel} — upcoming days (NWP model based)`,
    ...lines,
  ].join('\n');
}

export function composeAlerts(nlu, bundle) {
  const { alerts, placeLabel } = bundle;
  if (!alerts.length) {
    return `✅ No yellow/orange/red alerts under IMD criteria for ${placeLabel} over the next 3 days.`;
  }
  const worst = highestSeverity(alerts);
  const emoji = worst === 'red' ? '🔴' : worst === 'orange' ? '🟠' : '🟡';
  const header = `${emoji} ${placeLabel} — highest level: ${SEVERITY_LABEL[worst]} (${alerts.length} active)`;
  const top = alerts.slice(0, 4).map((a) => {
    const em = a.severity === 'red' ? '🔴' : a.severity === 'orange' ? '🟠' : '🟡';
    const adv = a.advisory?.general || '';
    return `${em} ${a.title} — ${adv} [criteria: ${a.criteria}]`;
  });
  return [header, ...top].join('\n');
}

export function composeClimate(nlu, bundle) {
  const { placeLabel, climate, today, anomaly } = bundle;
  if (!climate) {
    return `📊 Historical baseline for ${placeLabel} is not available right now.`;
  }
  const dir = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v}°C`);
  return [
    `📊 ${placeLabel} climate context:`,
    `• Today's model max ${Math.round(today.tmax)}°C vs ${climate.sampleCount}-year mean ${climate.mean.tmax}°C (${dir(anomaly?.tmax)})`,
    `• Min ${Math.round(today.tmin)}°C vs mean ${climate.mean.tmin}°C (${dir(anomaly?.tmin)})`,
    `• Today's rainfall ${round(today.precipSum, 1)} mm vs mean ${climate.mean.precip} mm`,
    `• Baseline years: ${climate.years.join(', ')}`,
  ].join('\n');
}

export function composeHelp() {
  return [
    'Hi, I am WeatherGPT — a conversational assistant for weather forecasts, alerts and climate information.',
    '• "current weather in Delhi" — live conditions',
    '• "will it rain tomorrow in mumbai" — rainfall forecast',
    '• "any alerts for kolkata" — IMD-criteria warnings',
    '• "climate analysis pune" — compare with the historical baseline',
    '• "chennai 7 day forecast" — upcoming days',
    'Hinglish and Hindi queries like "delhi ka mausam", "kal mumbai mein baarish" are also understood.',
    'Data: Open-Meteo NWP models (GFS/ICON/ECMWF), air quality, flood and historical archive APIs.',
  ].join('\n');
}

export function composeNosupport() {
  return '⚠️ Email subscriptions are not enabled in this build — alerts are shown directly here in chat and in the alerts panel.';
}

export function composeGreeting() {
  return 'Hi! I am WeatherGPT. Ask about weather, alerts, or climate anywhere — try "current weather in Delhi", "will it rain tomorrow in Mumbai", "any alerts for Kolkata".';
}

export function composePlaceNotFound() {
  return 'I could not find a place matching that. Try a well-known city name like "Mumbai", "Guwahati", "Pune".';
}

export function composeDataUnavailable(error) {
  return `⚠️ The weather data service is temporarily unavailable (NWP API). Please try again in a moment. (${error.message})`;
}
