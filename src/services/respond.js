import { weatherInfo } from '../lib/wmo.js';
import { SEVERITY_LABEL } from '../lib/imd.js';
import { compass, fmt, windText, aqiInfo, weekdayShort, round } from '../lib/format.js';
import { dayByOffset } from './weather.js';
import { highestSeverity } from './alerts.js';

function tempText(temp, lang) {
  if (temp == null) return '—';
  const v = Math.round(temp);
  if (lang === 'hi') return `${v}°से`;
  return `${v}°C`;
}

function paramLines(bundle, params, lang) {
  const { current, air } = bundle;
  if (!current) return [];
  const lines = [];
  const has = (p) => params.includes(p);
  const all = params.length === 0;

  if (all || has('temp')) {
    const w = weatherInfo(current.code, lang);
    lines.push(lang === 'hi'
      ? `${w.hi} · ${tempText(current.temp, lang)} (महसूस ${tempText(current.feelsLike, lang)}) · ${current.humidity ?? '—'}% नमी`
      : `${w.en} · ${tempText(current.temp, lang)} (feels ${tempText(current.feelsLike, lang)}) · humidity ${current.humidity ?? '—'}%`);
  }
  if ((all || has('wind')) && current.windSpeed != null) {
    const gust = current.windGust != null ? ` (gusts ${Math.round(current.windGust)} km/h)` : '';
    lines.push(lang === 'hi'
      ? `हवा ${windText(current.windSpeed, current.windDir)}${gust}`
      : `Wind ${windText(current.windSpeed, current.windDir)}${gust}`);
  }
  if ((all || has('humidity')) && current.humidity != null) {
    const line = `${current.humidity}%`;
    lines.push(lang === 'hi' ? `आपेक्षिक नमी ${line}` : `Humidity ${line}`);
  }
  if ((all || has('aqi')) && air) {
    const info = aqiInfo(air.aqi);
    lines.push(`${info.label}${air.pm25 != null ? ` · PM2.5 ${round(air.pm25, 1)} µg/m³` : ''}`);
  }
  if (all || has('pressure')) {
    if (current.pressure != null) lines.push(lang === 'hi' ? `दबाव ${Math.round(current.pressure)} hPa` : `Pressure ${Math.round(current.pressure)} hPa`);
  }
  return lines;
}

export function composeCurrent(nlu, bundle) {
  const { lang } = nlu;
  const { current, placeLabel, forecast, air } = bundle;
  if (!current) return null;
  const w = weatherInfo(current.code, lang);
  const header = lang === 'hi'
    ? `📍 ${placeLabel} — अभी (स्थानीय समय ${current.time ? current.time.slice(11, 16) : '—'})`
    : lang === 'hinglish'
      ? `📍 ${placeLabel} — abhi (local ${current.time ? current.time.slice(11, 16) : '—'})`
      : `📍 ${placeLabel} — right now (local ${current.time ? current.time.slice(11, 16) : '—'})`;

  const lines = [
    lang === 'hi'
      ? `🌤️ ${w.hi}, ${tempText(current.temp, lang)} (महसूस ${tempText(current.feelsLike, lang)})`
      : lang === 'hinglish'
        ? `🌤️ ${w.en}, ${tempText(current.temp, lang)} (feels ${tempText(current.feelsLike, lang)})`
        : `🌤️ ${w.en}, ${tempText(current.temp, lang)} (feels ${tempText(current.feelsLike, lang)})`,
  ];

  const details = [];
  details.push(lang === 'hi'
    ? `नमी ${current.humidity ?? '—'}% · हवा ${fmt(current.windSpeed, 0)} km/h ${compass(current.windDir) || ''}${current.windGust != null ? ` · झोंके ${Math.round(current.windGust)} km/h` : ''}`
    : lang === 'hinglish'
      ? `Humidity ${current.humidity ?? '—'}% · hawa ${fmt(current.windSpeed, 0)} km/h ${compass(current.windDir) || ''}${current.windGust != null ? ` · gust ${Math.round(current.windGust)} km/h` : ''}`
      : `Humidity ${current.humidity ?? '—'}% · wind ${fmt(current.windSpeed, 0)} km/h ${compass(current.windDir) || ''}${current.windGust != null ? ` · gusts ${Math.round(current.windGust)} km/h` : ''}`);
  if (current.cloudCover != null) details.push(`cloud ${current.cloudCover}%`);
  if (current.pressure != null) details.push(lang === 'hi' ? `दबाव ${Math.round(current.pressure)} hPa` : lang === 'hinglish' ? `dabav ${Math.round(current.pressure)} hPa` : `pressure ${Math.round(current.pressure)} hPa`);
  if (air) {
    const info = aqiInfo(air.aqi);
    details.push(lang === 'hi'
      ? `वायु गुणवत्ता ${air.aqi} (${info.label})`
      : lang === 'hinglish'
        ? `AQI ${air.aqi} (${info.label})`
        : `Air quality ${air.aqi} (${info.label})${air.pm25 != null ? ` · PM2.5 ${round(air.pm25, 1)} µg/m³` : ''}`);
  }
  lines.push(details.join(' · '));
  return [header, ...lines].join('\n');
}

export function composeRainCheck(nlu, bundle) {
  const { lang } = nlu;
  const offset = nlu.dayOffset ?? 0;
  const day = dayByOffset(bundle.forecast, offset, bundle.todayStr) || bundle.forecast.daily[0];
  const w = weatherInfo(day.code, lang);
  const dayName = lang === 'hi'
    ? (offset === 0 ? 'आज' : offset === 1 ? 'कल' : weekdayShort(day.date))
    : lang === 'hinglish'
      ? (offset === 0 ? 'aaj' : offset === 1 ? 'kal' : weekdayShort(day.date))
      : (offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : weekdayShort(day.date));
  const pop = day.pop ?? 0;
  const amount = day.precipSum ?? 0;
  const willRain = pop >= 50 || amount >= 2;
  const verdict = willRain
    ? (lang === 'hi'
      ? `हाँ — ${dayName} ${bundle.placeLabel} में बारिश की पूरी संभावना (${pop}%, लगभग ${round(amount, 1)} mm)`
      : lang === 'hinglish'
        ? `Haan — ${dayName} ${bundle.placeLabel} mein baarish ki poori sambhavna (${pop}%, ~${round(amount, 1)} mm)`
        : `Yes — rain likely on ${dayName.toLowerCase()} in ${bundle.placeLabel} (${pop}% chance, around ${round(amount, 1)} mm)`)
    : (lang === 'hi'
      ? `नहीं — ${dayName} ${bundle.placeLabel} में बारिश कम संभावित (${pop}%, लगभग ${amount} mm)`
      : lang === 'hinglish'
        ? `Nahi — ${dayName} ${bundle.placeLabel} mein baarish kam sambhavit (${pop}%, ~${round(amount, 1)} mm)`
        : `No — rain unlikely on ${dayName.toLowerCase()} in ${bundle.placeLabel} (${pop}% chance, around ${round(amount, 1)} mm)`);
  const cond = lang === 'hi' ? `मौसम: ${w.hi}` : lang === 'hinglish' ? `Mausam: ${w.en}` : `Conditions: ${w.en}`;
  return [verdict, cond].join('\n');
}

export function composeForecast(nlu, bundle) {
  const { lang } = nlu;
  const { forecast, todayStr } = bundle;
  const days = forecast.daily.slice(0, 3);
  const header = lang === 'hi'
    ? `📅 ${bundle.placeLabel} — अगले कुछ दिन (NWP मॉडल आधारित)`
    : lang === 'hinglish'
      ? `📅 ${bundle.placeLabel} — aane wale din (NWP model based)`
      : `📅 ${bundle.placeLabel} — upcoming days (NWP model based)`;
  const lines = days.map((day) => {
    const w = weatherInfo(day.code, lang);
    const label = day.date === todayStr ? (lang === 'hi' ? 'आज' : lang === 'hinglish' ? 'aaj' : 'Today') : weekdayShort(day.date);
    const rain = (day.rainSum ?? day.precipSum ?? 0);
    return `${label}: ${lang === 'hi' ? w.hi : w.en}, ${Math.round(day.tmax)}°/${Math.round(day.tmin)}°C, rain ${round(rain, 1)}mm (${day.pop ?? 0}%), UV max ${round(day.uv, 1)}`;
  });
  return [header, ...lines].join('\n');
}

export function composeAlerts(nlu, bundle) {
  const { lang } = nlu;
  const { alerts, placeLabel } = bundle;
  if (!alerts.length) {
    return lang === 'hi'
      ? `✅ ${placeLabel} के लिए अगले 3 दिनों में कोई IMD-मानदंड चेतावनी नहीं। मॉडल डेटा: कोई लाल/नारंगी/पीला स्तर नहीं।`
      : lang === 'hinglish'
        ? `✅ ${placeLabel} ke liye aane 3 dinon mein koi IMD-criteria alert nahi hai.`
        : `✅ No yellow/orange/red alerts under IMD criteria for ${placeLabel} over the next 3 days.`;
  }
  const worst = highestSeverity(alerts);
  const sev = SEVERITY_LABEL[worst];
  const emoji = worst === 'red' ? '🔴' : worst === 'orange' ? '🟠' : '🟡';
  const header = lang === 'hi'
    ? `${emoji} ${placeLabel} — उच्चतम स्तर: ${sev.hi} (${alerts.length} चेतावनियाँ)`
    : `${emoji} ${placeLabel} — highest: ${sev.en} (${alerts.length} active)`;
  const top = alerts.slice(0, 4).map((a) => {
    const em = a.severity === 'red' ? '🔴' : a.severity === 'orange' ? '🟠' : '🟡';
    const title = lang === 'hi' ? a.titleHi : a.title;
    const advKey = lang === 'hi' ? 'hi' : 'en';
    const adv = a.advisory?.general?.[advKey] || a.advisory?.general?.en || '';
    const crit = lang === 'hi' ? `[मानदंड: ${a.criteria}]` : `[criteria: ${a.criteria}]`;
    return `${em} ${title} — ${adv} ${crit}`;
  });
  return [header, ...top].join('\n');
}

export function composeClimate(nlu, bundle) {
  const { lang } = nlu;
  const { placeLabel, climate, today } = bundle;
  if (!climate) {
    return lang === 'hi'
      ? `📊 ${placeLabel} के लिए ऐतिहासिक डेटा अभी उपलब्ध नहीं है।`
      : `📊 Historical baseline for ${placeLabel} is not available right now.`;
  }
  const an = bundle.anomaly;
  const dir = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v}°C`);
  const msg = lang === 'hi'
    ? `📊 ${placeLabel} जलवायु संदर्भ:\n• आज का मॉडल अधिकतम ${Math.round(today.tmax)}°C vs ${climate.sampleCount}-वर्ष औसत ${climate.mean.tmax}°C (${dir(an?.tmax)})\n• न्यूनतम ${Math.round(today.tmin)}°C vs औसत ${climate.mean.tmin}°C (${dir(an?.tmin)})\n• आज की वर्षा ${round(today.precipSum, 1)} mm vs औसत ${climate.mean.precip} mm\n• आधार वर्ष: ${climate.years.join(', ')}`
    : lang === 'hinglish'
      ? `📊 ${placeLabel} jalvayu context:\n• Aaj ka max ${Math.round(today.tmax)}°C vs ${climate.sampleCount}-saal average ${climate.mean.tmax}°C (${dir(an?.tmax)})\n• Min ${Math.round(today.tmin)}°C vs average ${climate.mean.tmin}°C (${dir(an?.tmin)})\n• Aaj ki barish ${round(today.precipSum, 1)} mm vs average ${climate.mean.precip} mm\n• Baseline years: ${climate.years.join(', ')}`
      : `📊 ${placeLabel} climate context:\n• Today's model max ${Math.round(today.tmax)}°C vs ${climate.sampleCount}-year mean ${climate.mean.tmax}°C (${dir(an?.tmax)})\n• Min ${Math.round(today.tmin)}°C vs mean ${climate.mean.tmin}°C (${dir(an?.tmin)})\n• Today's rainfall ${round(today.precipSum, 1)} mm vs mean ${climate.mean.precip} mm\n• Baseline years: ${climate.years.join(', ')}`;
  return msg;
}

export function composeHelp(lang) {
  if (lang === 'hi') {
    return '🙏 नमस्ते! मैं WeatherGPT हूँ — मौसम, चेतावनी और जलवायु जानकारी का संवादी सहायक।\n• "दिल्ली का मौसम" — वर्तमान स्थिति\n• "कल मुंबई में बारिश होगी क्या" — वर्षा पूर्वानुमान\n• "कोलकाता के अलर्ट" — IMD मानदंड चेतावनियाँ\n• "पुणे जलवायु विश्लेषण" — ऐतिहासिक औसत से तुलना\n• "चेन्नई का 7 दिन पूर्वानुमान" — अगले दिन\nडेटा स्रोत: Open-Meteo (GFS/ICON/ECMWF NWP), Air Quality, Flood और Archive API।';
  }
  if (lang === 'hinglish') {
    return '🙏 Namaste! Main WeatherGPT hoon — mausam, alerts aur jalvayu ka conversational assistant.\n• "delhi ka mausam" — abhi ki situation\n• "kal mumbai mein baarish hogi kya" — barish forecast\n• "kolkata ke alerts" — IMD-criteria warnings\n• "pune jalvayu analysis" — historical average se compare\n• "chennai 7 din ka forecast" — aane wale din\nData source: Open-Meteo (GFS/ICON/ECMWF NWP), Air Quality, Flood aur Archive API.';
  }
  return 'Hi, I am WeatherGPT — a conversational assistant for weather, alerts and climate.\n• "delhi ka mausam" or "current weather in Delhi" — live conditions\n• "will it rain tomorrow in mumbai" — rainfall forecast\n• "any alerts for kolkata" — IMD-criteria warnings\n• "climate analysis pune" — compare with historical baseline\n• "chennai 7 day forecast" — upcoming days\nData: Open-Meteo (GFS/ICON/ECMWF numerical weather prediction), Air Quality, Flood and Archive APIs.';
}

export function composeNosupport(lang) {
  return lang === 'hi'
    ? '⚠️ इस संस्करण में ईमेल अलर्ट उपलब्ध नहीं हैं — चेतावनियाँ यहाँ चैट में सीधे दिखती हैं।'
    : '⚠️ Email subscriptions are not enabled in this build — alerts are shown directly here in chat and in the alerts panel.';
}
