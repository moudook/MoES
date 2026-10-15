const DEVANAGARI = /[\u0900-\u097F]/;

const HINGLISH_WORDS = /\b(aaj|kal|parso|mausam|barish|baarish|brish|garmi|thand|sardi|loo|hawa|kaha|kaun|batao|bata|do|chahiye|mujhe|nahi|haan|theek|ka|ki|ke|me|mein|kaise|kitna|hoga|hain|aur|ya)\b/i;

const INTENT_RULES = [
  { intent: 'help', re: /\b(help|madad|what can you do|kaise kaam|kya kar|commands)\b|मदद|सहायता|क्या कर सकते/i },
  { intent: 'subscribe', re: /\b(subscribe|sign up|register|remind me)\b|सब्सक्राइब|ईमेल.*(चाहिए|भेज|अलर्ट)/i },
  { intent: 'climate', re: /\b(climate|climate change|historical|history|anomaly|trend|compared to|vs last year|normal temperature|long ?term)\b|जलवायु|इतिहास|पुराना.*डेटा|औसत.*तापमान/i },
  { intent: 'alerts', re: /\b(alert|alerts|warning|warnings|early warning|advisory|dissemination|red alert|danger|risk|warn)\b|चेतावनी|अलर्ट|खतरा|सावधान|लाल अलर्ट/i },
  { intent: 'forecast', re: /\b(forecast|next \d+ ?days?|next week|this week|upcoming|weekend|agle|aaj se|days? ahead)\b|पूर्वानुमान|अगले|आने वाले|इस हफ्ते/i },
  { intent: 'weather', re: /\b(weather|temperature|temp|forecast|rain|rainfall|snow|wind|humidity|aqi|air quality|uv|sunny|cloudy|hot|cold|thunderstorm|fog|drizzle|shower)\b|मौसम|तापमान|बारिश|हवा|नमी|धूप|बादल|ओलावृष्टि/i },
  { intent: 'raincheck', re: /\b(will it rain|is it going to rain|rain later|rain today|rain tomorrow|umbrella)\b|बारिश.*होग|छाता/i },
  { intent: 'greeting', re: /^(hi|hello|hey|namaste|namaskar|good (morning|afternoon|evening)|yo)\b/i },
];

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'do', 'does', 'did', 'will', 'would', 'can', 'could', 'should', 'shall', 'may', 'might', 'must',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they', 'them',
  'what', 'whats', 'which', 'who', 'whom', 'how', 'when', 'where', 'why',
  'please', 'pls', 'plz', 'tell', 'show', 'give', 'need', 'want', 'let', 'know',
  'today', 'tomorrow', 'tonight', 'now', 'current', 'currently', 'right', 'later', 'evening', 'morning', 'afternoon', 'night',
  'next', 'this', 'week', 'weekend', 'days', 'day', 'month', 'hour',
  'weather', 'forecast', 'temperature', 'temp', 'report', 'update', 'status', 'situation', 'conditions', 'condition',
  'mausam', 'ka', 'ki', 'ke', 'kaise', 'kaisa', 'kaisi', 'kya', 'kitna', 'kitni', 'yeh', 'ye', 'wo', 'woh', 'hai', 'hain', 'tha', 'thi', 'the',
  'aur', 'ya', 'mein', 'me', 'mei', 'par', 'pe', 'se', 'ko', 'liye', 'batao', 'bata', 'do', 'de', 'chahiye', 'mujhe', 'hoga', 'hogi', 'rahega', 'rahegi',
  'barish', 'baarish', 'brish', 'barishh', 'baarishh', 'garmi', 'thand', 'thandi', 'sardi', 'loo', 'hawa', 'dhoop', 'badal', 'olavrishti', 'aaj', 'kal', 'parso',
  'in', 'at', 'for', 'of', 'on', 'near', 'around', 'about', 'to', 'from', 'with', 'any', 'some',
  'alerts', 'alert', 'warning', 'warnings', 'advisory', 'climate', 'trend', 'history', 'historical', 'anomaly', 'help', 'subscribe', 'thanks', 'thank',
]);

const PLACE_HINT_WORDS = new Set(['city', 'district', 'area', 'region', 'state', 'place', 'locality']);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}'.]+/u)
    .map((t) => t.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

export function detectLang(text) {
  const raw = String(text || '');
  if (DEVANAGARI.test(raw)) return 'hi';
  if (HINGLISH_WORDS.test(raw.toLowerCase())) return 'hinglish';
  return 'en';
}

function detectDayOffset(text) {
  const raw = String(text || '').toLowerCase();
  if (/\b(today|aaj|right now|currently|abhi|is din)\b/.test(raw)) return 0;
  if (/\b(tomorrow|kal\b|agle din|tomoz)\b/.test(raw)) return 1;
  if (/\b(day after tomorrow|parso|day after)\b/.test(raw)) return 2;
  const inDays = raw.match(/\bin (\d+) days?\b/) || raw.match(/\b(\d+) din(a)? baad\b/);
  if (inDays) {
    const n = Number.parseInt(inDays[1], 10);
    if (Number.isFinite(n) && n >= 0 && n <= 15) return n;
  }
  if (/\b(next week|agle hafte|aane wale hafte)\b/.test(raw)) return 3;
  if (/\b(tonight|aaj raat)\b/.test(raw)) return 0;
  return null;
}

function detectParams(text) {
  const params = new Set();
  const raw = String(text || '').toLowerCase();
  if (/\b(rain|rainfall|showers?|drizzle|precipitation|umbrella|wet)\b|बारिश|फुहार/.test(raw)) params.add('rain');
  if (/\b(temp|temperature|hot|cold|heat|warm|cool|thermometer)\b|तापमान|गर्मी|ठंड/.test(raw)) params.add('temp');
  if (/\b(wind|gust|breez|squall|storm)\b|हवा|झोंका/.test(raw)) params.add('wind');
  if (/\b(humidity|humid|moisture|damp)\b|नमी/.test(raw)) params.add('humidity');
  if (/\b(aqi|air quality|pollution|smog|pm2|pm10)\b|प्रदूषण/.test(raw)) params.add('aqi');
  if (/\b(uv|sunburn|sun index)\b/.test(raw)) params.add('uv');
  if (/\b(snow|snowfall|blizzard|sleet)\b|बर्फ/.test(raw)) params.add('snow');
  if (/\b(fog|mist|visibility)\b|कोहरा/.test(raw)) params.add('fog');
  if (/\b(sunrise|sunset|sun)\b|सूर्योदय|सूर्यास्त/.test(raw)) params.add('sun');
  if (/\b(pressure|barometer)\b/.test(raw)) params.add('pressure');
  if (/\b(river|flood|discharge)\b|नदी|बाढ़/.test(raw)) params.add('flood');
  return [...params];
}

function extractPlaceCandidates(text) {
  const raw = String(text || '');
  const quoted = raw.match(/[""''"]([^""''"]{2,40})[""''"]/);
  if (quoted) return [quoted[1].trim()];

  const tokens = tokenize(raw);
  const kept = tokens.filter((t) => !STOPWORDS.has(t) && !PLACE_HINT_WORDS.has(t));
  if (kept.length === 0) return [];

  const candidates = [];
  const seen = new Set();
  const add = (words) => {
    if (!words.length) return;
    const value = words.join(' ').replace(/\s+/g, ' ').trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    candidates.push(value);
  };
  add(kept);
  add(kept.slice(-2));
  add(kept.slice(-1));
  add(kept.slice(0, 2));
  add(kept.slice(0, 1));
  return candidates;
}

export function understand(text) {
  const raw = String(text || '').slice(0, 500);
  const lang = detectLang(raw);
  const dayOffset = detectDayOffset(raw);
  const params = detectParams(raw);

  let intent = null;
  if (/\b(help|madad|what can you do|kya kar|commands)\b|मदद|सहायता|क्या कर सकते/i.test(raw)) intent = 'help';
  else if (/\b(subscribe|sign up|register|remind me)\b/i.test(raw)) intent = 'nosupport';
  else if (/\b(climate|historical|history|anomaly|trend|compared to|vs last year|normal temperature)\b|जलवायु|इतिहास|औसत.*तापमान/i.test(raw)) intent = 'climate';
  else if (/\b(alert|alerts|warning|warnings|early warning|advisory|red alert|danger|risk)\b|चेतावनी|अलर्ट|खतरा|सावधान|लाल अलर्ट/i.test(raw)) intent = 'alerts';
  else if (/\b(forecast|next \d+ ?days?|next week|this week|upcoming|weekend|agle|aaj se)\b|पूर्वानुमान|अगले|आने वाले|इस हफ्ते/i.test(raw)) intent = 'forecast';
  else if (/\b(will it rain|is it going to rain|rain later|rain today|rain tomorrow|umbrella)\b|बारिश.*होग|छाता/i.test(raw)) intent = 'raincheck';
  else if (/^(hi|hello|hey|namaste|namaskar)\b|\b(good (morning|afternoon|evening)|thanks|thank you|shukriya)\b|^(नमस्ते|हैलो)/i.test(raw)) intent = 'greeting';
  else if (/\b(weather|temperature|temp|rain|rainfall|snow|wind|humidity|aqi|air quality|uv|sunny|cloudy|hot|cold|thunderstorm|fog|showers?|forecast)\b|मौसम|तापमान|बारिश|हवा|नमी|धूप|बादल|ओलावृष्टि|कोहरा|बर्फ/.test(raw)) intent = 'weather';

  return {
    intent: intent || 'weather',
    lang,
    dayOffset,
    params,
    placeCandidates: extractPlaceCandidates(raw),
    text: raw,
    tokens: tokenize(raw),
  };
}

export function explainIntent(nlu) {
  return nlu.intent;
}
