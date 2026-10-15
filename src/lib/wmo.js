const CODES = new Map([
  [0, { en: 'Clear sky', icon: 'sun' }],
  [1, { en: 'Mainly clear', icon: 'sun' }],
  [2, { en: 'Partly cloudy', icon: 'cloud-sun' }],
  [3, { en: 'Overcast', icon: 'cloud' }],
  [45, { en: 'Fog', icon: 'fog' }],
  [48, { en: 'Freezing fog', icon: 'fog' }],
  [51, { en: 'Light drizzle', icon: 'drizzle' }],
  [53, { en: 'Moderate drizzle', icon: 'drizzle' }],
  [55, { en: 'Dense drizzle', icon: 'drizzle' }],
  [56, { en: 'Light freezing drizzle', icon: 'drizzle' }],
  [57, { en: 'Freezing drizzle', icon: 'drizzle' }],
  [61, { en: 'Slight rain', icon: 'rain' }],
  [63, { en: 'Moderate rain', icon: 'rain' }],
  [65, { en: 'Heavy rain', icon: 'rain' }],
  [66, { en: 'Light freezing rain', icon: 'rain' }],
  [67, { en: 'Freezing rain', icon: 'rain' }],
  [71, { en: 'Slight snowfall', icon: 'snow' }],
  [73, { en: 'Moderate snowfall', icon: 'snow' }],
  [75, { en: 'Heavy snowfall', icon: 'snow' }],
  [77, { en: 'Snow grains', icon: 'snow' }],
  [80, { en: 'Slight rain showers', icon: 'showers' }],
  [81, { en: 'Moderate rain showers', icon: 'showers' }],
  [82, { en: 'Violent rain showers', icon: 'showers' }],
  [85, { en: 'Slight snow showers', icon: 'snow' }],
  [86, { en: 'Heavy snow showers', icon: 'snow' }],
  [95, { en: 'Thunderstorm', icon: 'thunder' }],
  [96, { en: 'Thunderstorm with hail', icon: 'thunder' }],
  [99, { en: 'Severe thunderstorm with hail', icon: 'thunder' }],
]);

export function weatherInfo(code) {
  const entry = CODES.get(Number(code));
  if (!entry) return { en: `Conditions (code ${code})`, icon: 'cloud', code: Number(code) };
  return { ...entry, code: Number(code), text: entry.en };
}

