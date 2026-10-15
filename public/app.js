const state = {
  place: null,
  lastResult: null,
  busy: false,
};

const chatScroll = document.getElementById('chatScroll');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const quickRow = document.getElementById('quickRow');
const placeForm = document.getElementById('placeForm');
const placeInput = document.getElementById('placeInput');
const suggestions = document.getElementById('suggestions');
const todayCard = document.getElementById('todayCard');
const chartSvg = document.getElementById('chart');
const chartPlace = document.getElementById('chartPlace');
const alertsPanel = document.getElementById('alertsPanel');
const worstBadge = document.getElementById('worstBadge');
const chipGemini = document.getElementById('chipGemini');

const QUICK_QUERIES = [
  'current weather in Delhi',
  'will it rain tomorrow in Mumbai',
  'any alerts for Kolkata',
  'climate analysis Pune',
  '7 day forecast Chennai',
  'delhi ka mausam',
  'Guwahati alerts',
];

const SUGGEST_PLACES = ['New Delhi', 'Mumbai', 'Bengaluru', 'Chennai', 'Kolkata', 'Hyderabad', 'Guwahati', 'Pune'];

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

function scrollChat() {
  chatScroll.scrollTop = chatScroll.scrollHeight;
}

function addMessage(role, htmlText, meta) {
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const p = document.createElement('p');
  p.textContent = htmlText;
  p.style.margin = '0';
  p.style.whiteSpace = 'pre-wrap';
  bubble.appendChild(p);
  if (meta) {
    const m = document.createElement('div');
    m.className = 'meta-line';
    m.textContent = meta;
    bubble.appendChild(m);
  }
  wrap.appendChild(bubble);
  chatScroll.appendChild(wrap);
  scrollChat();
}

function typingIndicator() {
  const wrap = document.createElement('div');
  wrap.className = 'msg bot';
  wrap.id = 'typingMsg';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const t = document.createElement('div');
  t.className = 'typing';
  t.innerHTML = '<span></span><span></span><span></span>';
  bubble.appendChild(t);
  wrap.appendChild(bubble);
  chatScroll.appendChild(wrap);
  scrollChat();
}

async function sendChat(message) {
  if (!message || state.busy) return;
  state.busy = true;
  addMessage('user', message);
  typingIndicator();
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, sessionId: 'web' }),
    });
    const data = await res.json();
    document.getElementById('typingMsg')?.remove();
    if (!res.ok) throw new Error(data.error || 'request failed');
    addMessage('bot', data.text, `mode: ${data.mode} · ${data.meta?.latencyMs ?? '?'}ms`);
    if (data.cards?.place) {
      state.place = data.cards.place;
      renderPanels(data.cards);
    }
  } catch (error) {
    document.getElementById('typingMsg')?.remove();
    addMessage('bot', `⚠️ ${error.message}`);
  } finally {
    state.busy = false;
  }
}

async function loadPlace(query) {
  if (!query) return;
  try {
    const res = await fetch(`/api/weather?place=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'place not found');
    renderPanels(data.cards, data.text ? undefined : data);
    if (!data.text) {
      addMessage('bot', `📍 ${data.place.label} loaded. Current: ${data.cards.current?.temp ?? '—'}°C, ${data.cards.alerts?.length ? `${data.cards.alerts.length} alert(s) active` : 'no alerts'}`);
    }
  } catch (error) {
    alertsPanel.innerHTML = `<div class="muted">⚠️ ${escapeHtml(error.message)}</div>`;
  }
}

function renderPanels(cards, data) {
  if (!cards) return;
  const info = data || {};
  const place = cards.place;
  const current = cards.current || {};
  const today = cards.today || {};

  const cond = describeCode(current.code);
  todayCard.innerHTML = `
    <div class="today-main">
      <span class="today-temp">${current.temp != null ? Math.round(current.temp) + '°' : '—'}</span>
      <div>
        <div class="today-place">${escapeHtml(place.label)}</div>
        <div class="today-cond">${escapeHtml(cond)} · feels ${current.feelsLike != null ? Math.round(current.feelsLike) + '°' : '—'}</div>
      </div>
    </div>
    <div class="today-grid">
      <div>Humidity <b>${current.humidity ?? '—'}%</b></div>
      <div>Wind <b>${current.windSpeed ?? '—'} km/h</b></div>
      <div>Gusts <b>${current.windGust != null ? Math.round(current.windGust) : '—'} km/h</b></div>
      <div>Pressure <b>${current.pressure != null ? Math.round(current.pressure) : '—'} hPa</b></div>
      <div>Max / Min <b>${today.tmax != null ? Math.round(today.tmax) : '—'}° / ${today.tmin != null ? Math.round(today.tmin) : '—'}°</b></div>
      <div>Rain <b>${today.precipSum != null ? Math.round(today.precipSum * 10) / 10 : '—'} mm (${today.pop ?? 0}%)</b></div>
      <div>AQI <b>${cards.air?.aqi ?? '—'}</b></div>
      <div>UV max <b>${today.uv != null ? Math.round(today.uv * 10) / 10 : '—'}</b></div>
    </div>`;
  chartPlace.textContent = place.name;
  renderChart(cards.chart);
  renderAlerts(cards.alerts || [], cards.worstSeverity);
  if (!state.place) state.place = place;
}

function describeCode(code) {
  const map = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Freezing fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Snow', 73: 'Snow', 75: 'Heavy snow',
    80: 'Light showers', 81: 'Showers', 82: 'Violent showers', 95: 'Thunderstorm', 96: 'Thunderstorm + hail', 99: 'Severe thunderstorm',
  };
  return map[code] ?? '—';
}

function renderChart(chart) {
  if (!chart || !chart.labels?.length) return;
  const { labels, tmax, tmin, rain } = chart;
  const values = [...tmax, ...tmin].filter((v) => v != null);
  const maxRain = Math.max(...rain.map((v) => v || 0), 5);
  const minT = Math.min(...values) - 2;
  const maxT = Math.max(...values) + 2;
  const W = 320, H = 160, PAD = 8;
  const x = (i) => PAD + (i * (W - 2 * PAD)) / Math.max(1, labels.length - 1);
  const y = (v) => H - PAD - ((v - minT) / (maxT - minT || 1)) * (H - 2 * PAD);

  const line = (series) => series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${(v != null ? y(v) : H - PAD).toFixed(1)}`).join(' ');

  const gridLines = [0, 1, 2, 3, 4]
    .map((i) => {
      const gy = PAD + (i * (H - 2 * PAD)) / 4;
      return `<line x1="${PAD}" y1="${gy}" x2="${W - PAD}" y2="${gy}" stroke="rgba(96,140,220,0.12)" stroke-width="0.5"/>`;
    })
    .join('');

  const rainBars = rain
    .map((v, i) => {
      const h = ((v || 0) / maxRain) * 26;
      return h > 0.5
        ? `<rect x="${(x(i) - 5).toFixed(1)}" y="${(H - PAD - h).toFixed(1)}" width="10" height="${h.toFixed(1)}" rx="2" fill="#38bdf8" opacity="0.55"/>`
        : '';
    })
    .join('');

  const dotsMax = tmax.map((v, i) => v != null ? `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.2" fill="#fb923c"/>` : '').join('');
  const dotsMin = tmin.map((v, i) => v != null ? `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.2" fill="#4cc2ff"/>` : '').join('');
  const dayLabels = labels
    .map((l, i) => `<text x="${x(i).toFixed(1)}" y="${H - 1}" fill="#8ea2c0" font-size="7" text-anchor="middle">${l.slice(5)}</text>`)
    .join('');

  chartSvg.innerHTML = `
    ${gridLines}
    ${rainBars}
    <path d="${line(tmax)}" fill="none" stroke="#fb923c" stroke-width="1.8"/>
    <path d="${line(tmin)}" fill="none" stroke="#4cc2ff" stroke-width="1.8"/>
    ${dotsMax}${dotsMin}${dayLabels}`;
}

function renderAlerts(alerts, worst) {
  worstBadge.className = 'sev-badge';
  if (!alerts.length) {
    worstBadge.textContent = 'NO ALERTS';
    worstBadge.classList.add('none');
    alertsPanel.innerHTML = `<div class="muted">✅ No alerts under IMD criteria for the next 3 days.</div>`;
    return;
  }
  worstBadge.textContent = (worst || 'WATCH').toUpperCase();
  worstBadge.classList.add(worst || 'yellow');
  alertsPanel.innerHTML = alerts
    .map((a) => `
      <div class="alert-item ${a.severity}">
        <div class="a-title"><span>${escapeHtml(a.title)}</span><span class="a-date">${escapeHtml(a.date)}</span></div>
        <div class="a-crit">${escapeHtml(a.criteria)}</div>
        <div class="a-adv">${escapeHtml(a.advisory?.general || '')}</div>
      </div>`)
    .join('');
}

for (const q of QUICK_QUERIES) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'quick';
  btn.textContent = q;
  btn.addEventListener('click', () => sendChat(q));
  quickRow.appendChild(btn);
}

for (const p of SUGGEST_PLACES) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = p;
  btn.addEventListener('click', () => {
    placeInput.value = p;
    loadPlace(p);
  });
  suggestions.appendChild(btn);
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = chatInput.value.trim();
  chatInput.value = '';
  sendChat(value);
});

placeForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = placeInput.value.trim();
  if (value) loadPlace(value);
});

(async function init() {
  try {
    const res = await fetch('/api/config');
    const conf = await res.json();
    chipGemini.textContent = conf.gemini ? `● Brain: Gemini (${conf.model})` : '● Brain: deterministic engine';
    chipGemini.classList.toggle('on', Boolean(conf.gemini));
  } catch {
    chipGemini.textContent = '● Brain: unknown';
  }
  loadPlace('New Delhi');
})();
