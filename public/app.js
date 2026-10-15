/* ============================================================
   WeatherGPT —?" client
   · a small markdown reader written for this interface
     (field-note styling, no generic rendered-markdown look)
   · a streaming typewriter that reveals answer block by block
   · an activity log that records only what actually happened
   ============================================================ */

const $ = (sel) => document.querySelector(sel);

const transcript = $('#transcript');
const composer = $('#composer');
const input = $('#input');
const send = $('#send');
const asks = $('#asks');
const nowBox = $('#now');
const alertsBox = $('#alerts');
const sevBox = $('#sev');
const chart = $('#chart');
const chartNote = $('#chartNote');
const placeName = $('#placeName');
const placeTime = $('#placeTime');
const placesBox = $('#places');
const lookupForm = $('#lookup');
const placeInput = $('#placeInput');
const logbook = $('#logbook');
const logEntries = $('#logEntries');
const logToggle = $('#logToggle');
const logClose = $('#logClose');

/* The OS setting wins, always. ?motion=1 exists only so the reveal can be
   demonstrated or captured on a machine whose system asks for less motion. */
const forcedMotion = new URLSearchParams(location.search).has('motion');
const reducedMotion = !forcedMotion && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------------- activity log */

const LOG_CAP = 60;

function stamp() {
  const d = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function log(stage, message) {
  const line = document.createElement('li');
  const time = document.createElement('time');
  time.textContent = stamp();
  const tag = document.createElement('b');
  tag.textContent = stage;
  const body = document.createElement('span');
  body.textContent = message;
  line.append(time, tag, body);
  logEntries.prepend(line);
  while (logEntries.children.length > LOG_CAP) logEntries.lastElementChild.remove();
  console.debug(`[weathergpt] ${stage.padEnd(6)} ${message}`);
}

logToggle.addEventListener('click', () => {
  const open = logbook.hasAttribute('hidden');
  if (open) logbook.removeAttribute('hidden');
  else logbook.setAttribute('hidden', '');
  logToggle.setAttribute('aria-expanded', String(open));
});

logClose.addEventListener('click', () => {
  logbook.setAttribute('hidden', '');
  logToggle.setAttribute('aria-expanded', 'false');
});

/* ---------------------------------------------------------- markdown reader */

const INLINE = /(\*\*[^*]+\*\*|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|\[[^\]\n]+\]\((https?:\/\/[^\s)]+)\))/g;
const MEASURE = /(\d+(?:\.\d+)?)\s?(°C|%|mm|km\/h|hPa|µg\/m³|US AQI)/g;

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Split one line into inline segments so the typewriter can reveal
   formatting as it goes, instead of popping bold on at the end. */
function inlineSegments(line) {
  const segments = [];
  let cursor = 0;

  const push = (kind, text, href) => {
    if (text) segments.push({ kind, text, href });
  };

  for (const match of line.matchAll(INLINE)) {
    push('text', line.slice(cursor, match.index));
    const token = match[0];

    if (token.startsWith('**')) push('strong', token.slice(2, -2));
    else if (token.startsWith('`')) push('code', token.slice(1, -1));
    else if (token.startsWith('[')) {
      const split = token.indexOf('](');
      push('link', token.slice(1, split), token.slice(split + 2, -1));
    } else push('em', token.slice(1, -1));

    cursor = match.index + token.length;
  }

  push('text', line.slice(cursor));
  return segments;
}

/* Measurements are set in mono with tabular figures, so a column of
   numbers lines up inside a sentence. */
function splitMeasures(text) {
  const out = [];
  let cursor = 0;
  for (const match of text.matchAll(MEASURE)) {
    out.push({ kind: 'text', text: text.slice(cursor, match.index) });
    out.push({ kind: 'figure', text: match[0] });
    cursor = match.index + match[0].length;
  }
  out.push({ kind: 'text', text: text.slice(cursor) });
  return out.filter((s) => s.text);
}

function appendSegment(parent, segment) {
  if (segment.kind === 'strong') {
    const el = document.createElement('strong');
    el.append(...splitMeasures(segment.text).map(mkMeasure));
    parent.append(el);
    return el.lastChild?.nodeType === 3 ? el.lastChild : el;
  }
  if (segment.kind === 'em') {
    const el = document.createElement('em');
    el.textContent = segment.text;
    parent.append(el);
    return el;
  }
  if (segment.kind === 'code') {
    const el = document.createElement('code');
    el.textContent = segment.text;
    parent.append(el);
    return el;
  }
  if (segment.kind === 'link') {
    const el = document.createElement('a');
    el.href = segment.href;
    el.textContent = segment.text;
    el.rel = 'noopener noreferrer';
    el.target = '_blank';
    parent.append(el);
    return el;
  }
  if (segment.kind === 'figure') {
    return mkMeasure(segment);
  }

  const parts = splitMeasures(segment.text);
  const holder = document.createElement('span');
  for (const part of parts) holder.append(mkMeasure(part));
  if (parts.length > 1) {
    parent.append(holder);
    return holder.lastChild;
  }
  const node = document.createTextNode(segment.text);
  parent.append(node);
  return node;
}

function mkMeasure(part) {
  if (part.kind === 'figure') {
    const el = document.createElement('span');
    el.className = 'figure';
    el.textContent = part.text;
    return el;
  }
  return document.createTextNode(part.text);
}

/* Blocks: paragraph, label, heading, bullet, number, quote, rule, code. */
function parseBlocks(source) {
  const lines = String(source).replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  let bullets = null;
  let numbers = null;
  let quote = [];

  const flushPara = () => {
    if (para.length) blocks.push({ type: 'p', lines: para.slice() });
    para = [];
  };
  const flushList = () => {
    if (bullets) blocks.push(bullets);
    if (numbers) blocks.push(numbers);
    bullets = null;
    numbers = null;
  };
  const flushQuote = () => {
    if (quote.length) blocks.push({ type: 'quote', lines: quote.slice() });
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) { flushAll(); continue; }

    const label = trimmed.match(/^##\s+(.*)$/);
    if (label) { flushAll(); blocks.push({ type: 'label', lines: [label[1]] }); continue; }

    const head = trimmed.match(/^###\s+(.*)$/);
    if (head) { flushAll(); blocks.push({ type: 'head', lines: [head[1]] }); continue; }

    if (/^(---|\*\*\*|___)$/.test(trimmed)) { flushAll(); blocks.push({ type: 'hr' }); continue; }

    const fence = trimmed.match(/^```(.*)$/);
    if (fence) { flushAll(); blocks.push({ type: 'rule' }); continue; }

    const bullet = trimmed.match(/^[-*—?—]\s+(.*)$/);
    if (bullet) {
      flushPara();
      flushQuote();
      if (numbers) flushList();
      bullets = bullets || { type: 'ul', lines: [] };
      bullets.lines.push(bullet[1]);
      continue;
    }

    const number = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (number) {
      flushPara();
      flushQuote();
      if (bullets) flushList();
      numbers = numbers || { type: 'ol', lines: [] };
      numbers.lines.push(number[1]);
      continue;
    }

    const quoted = trimmed.match(/^>\s?(.*)$/);
    if (quoted) {
      flushPara();
      flushList();
      quote.push(quoted[1]);
      continue;
    }

    flushList();
    flushQuote();
    para.push(trimmed);
  }

  flushAll();
  return blocks;
}

/* Build the DOM for one block without any text yet, so the typer can fill it. */
function blockShell(block, doc) {
  if (block.type === 'hr') {
    const hr = doc.createElement('hr');
    return { node: hr, lines: [] };
  }
  if (block.type === 'label') {
    const node = doc.createElement('div');
    node.className = 'label';
    return { node, lines: block.lines };
  }
  if (block.type === 'head') {
    const node = doc.createElement('p');
    const strong = doc.createElement('strong');
    node.append(strong);
    return { node: strong, lines: block.lines };
  }
  if (block.type === 'quote') {
    const node = doc.createElement('blockquote');
    return { node, lines: block.lines };
  }
  if (block.type === 'ul' || block.type === 'ol') {
    const node = doc.createElement(block.type);
    block.lines.forEach(() => node.append(doc.createElement('li')));
    return { node, list: node, lines: block.lines };
  }
  const node = doc.createElement('p');
  return { node, lines: block.lines };
}

/* ---------------------------------------------------------- typewriter */

class Typer {
  constructor(host) {
    this.host = host;
    this.caret = document.createElement('span');
    this.caret.className = 'caret';
    this.caret.setAttribute('aria-hidden', 'true');
    this.cancelled = false;
    this.raf = 0;
  }

  /* lines: string[] already flattened into ordered typeable units */
  async run(blocks) {
    const doc = this.host.ownerDocument;
    const units = [];

    for (const block of blocks) {
      const shell = blockShell(block, doc);
      this.host.append(shell.node);

      if (block.type === 'hr') continue;

      if (shell.list) {
        [...shell.list.children].forEach((li, i) => {
          units.push({ parent: li, segments: inlineSegments(block.lines[i]) });
        });
      } else {
        block.lines.forEach((line, i) => {
          const target = shell.list ? shell.list : shell.node;
          let host = target;
          if (!shell.list && shell.node.nodeName === 'BLOCKQUOTE' && i > 0) host = shell.node;
          units.push({ parent: host, segments: inlineSegments(line), br: !shell.list && i > 0 });
        });
      }
    }

    if (reducedMotion) {
      for (const unit of units) this.fill(unit);
      return { chars: this.count, ms: 0, skipped: true };
    }

    const total = units.reduce((n, u) => n + u.segments.reduce((m, s) => m + s.text.length, 0), 0);
    const duration = Math.min(2600, Math.max(700, total * 7));

    await new Promise((resolve) => {
      /* Date.now(), not performance.now(): a backgrounded tab pauses
         requestAnimationFrame, and an answer that only finishes while the
         tab is visible is an answer that silently never arrives. A minimum
         step per frame guarantees forward progress even if the clock is
         frozen, and the deadline guarantees the reveal ends. */
      const start = Date.now();
      let shown = 0;
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        for (const unit of units) this.fill(unit);
        this.caret.remove();
        this.count = total;
        resolve();
      };

      const step = () => {
        if (this.cancelled) {
          settled = true;
          clearTimeout(deadline);
          return resolve();
        }
        const elapsed = Date.now() - start;
        const want = Math.min(total, Math.max(shown + 1, Math.round((elapsed / duration) * total)));

        while (shown < want) {
          const step2 = this.unitAt(units, shown);
          if (!step2) break;
          this.revealStep(step2);
          shown += 1;
        }

        if (want >= total) return finish();
        this.raf = requestAnimationFrame(step);
      };

      const deadline = setTimeout(finish, duration + 400);
      this.raf = requestAnimationFrame(step);
    });

    return { chars: total, ms: duration, skipped: false };
  }

  unitAt(units, index) {
    let seen = 0;
    for (const unit of units) {
      const len = unit.segments.reduce((m, s) => m + s.text.length, 0);
      if (index < seen + len) return { unit, local: index - seen };
      seen += len;
    }
    return null;
  }

  revealStep(unit) {
    if (unit.state === undefined) {
      unit.state = { seg: 0, node: null, shown: 0 };
      this.caret.remove();
    }
    const { segments } = unit;
    const state = unit.state;

    while (state.shown >= segments[state.seg].text.length && state.seg < segments.length - 1) {
      state.shown -= segments[state.seg].text.length;
      state.seg += 1;
      state.node = null;
    }

    const segment = segments[state.seg];
    if (!state.node || state.node.parentNode !== segment.__parent) {
      state.node = appendSegment(unit.parent, segment);
      segment.__parent = unit.parent;
      this.caret.remove();
    }
    if (state.node.nodeType !== 3) {
      state.shown = segment.text.length;
      return;
    }
    state.node.data = segment.text.slice(0, state.shown + 1);
    unit.parent.insertBefore(this.caret, state.node.nextSibling);
  }

  fill(unit) {
    if (unit.state === undefined) {
      unit.state = { seg: 0, node: null, shown: 0 };
    }
    unit.segments.forEach((segment) => appendSegment(unit.parent, segment));
  }

  skip() {
    if (this.cancelled) return false;
    this.cancelled = true;
    cancelAnimationFrame(this.raf);
    return true;
  }
}

let typer = null;

/* ---------------------------------------------------------- transcript */

function pin() {
  transcript.scrollTop = transcript.scrollHeight;
}

function addTurn(role, text, { stampHtml } = {}) {
  const turn = document.createElement('article');
  turn.className = `turn ${role === 'user' ? 'ask' : 'say'}`;

  const who = document.createElement('div');
  who.className = 'who';
  who.textContent = role === 'user' ? 'YOU' : 'WX';

  const say = document.createElement('div');
  say.className = 'say';

  if (role === 'user') say.textContent = text;
  else if (text) say.textContent = text;

  turn.append(who, say);
  transcript.append(turn);

  if (stampHtml) {
    const stampEl = document.createElement('div');
    stampEl.className = 'stamp';
    stampEl.textContent = stampHtml;
    say.append(stampEl);
  }

  pin();
  return say;
}

function mdBlock() {
  const md = document.createElement('div');
  md.className = 'md';
  return md;
}

function waiting() {
  const wrap = document.createElement('span');
  wrap.className = 'wait-line';

  const dots = document.createElement('span');
  dots.className = 'wait';
  dots.innerHTML = '<i></i><i></i><i></i>';

  const label = document.createElement('span');
  label.className = 'wait-what';
  label.textContent = 'reading the forecast';

  /* An answer can take several seconds —?" Gemini plus four upstream
     hosts. Showing the elapsed time is honest about it, and it is also
     the only thing standing between a slow answer and a reader deciding
     the page has hung. */
  const clock = document.createElement('span');
  clock.className = 'wait-clock';
  const t0 = performance.now();
  const tick = () => {
    clock.textContent = `${((performance.now() - t0) / 1000).toFixed(1)}s`;
  };
  tick();
  const timer = setInterval(tick, 100);
  wrap.append(dots, label, clock);
  wrap.addEventListener('done', () => clearInterval(timer));

  return wrap;
}

async function playAnswer(host, text, meta) {
  typer?.skip();
  const md = mdBlock();
  host.append(md);

  const blocks = parseBlocks(text);
  typer = new Typer(md);

  md.addEventListener('click', () => {
    if (typer?.skip()) log('type', 'reveal skipped by reader');
  });

  const result = await typer.run(blocks);
  typer = null;

  const inline = blocks.reduce((n, b) => n + (b.lines || []).length, 0);
  log('md', `${blocks.length} blocks · ${inline} lines parsed`);
  log('type', result.skipped
    ? 'revealed instantly (reduced motion)'
    : `${result.chars} chars in ${result.ms}ms`);

  if (meta) {
    const stampEl = document.createElement('div');
    stampEl.className = 'stamp';
    stampEl.textContent = meta;
    host.append(stampEl);
  }
  pin();
}

/* ---------------------------------------------------------- quick asks */

const ASKS = [
  'current weather in Delhi',
  'will it rain tomorrow in Mumbai',
  'any alerts for Chennai',
  'climate analysis Pune',
  '7 day forecast Kolkata',
  'delhi ka mausam',
];

const PLACES = ['New Delhi', 'Mumbai', 'Bengaluru', 'Chennai', 'Kolkata', 'Hyderabad', 'Guwahati', 'Pune'];

for (const question of ASKS) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.textContent = question;
  chip.addEventListener('click', () => {
    input.value = question;
    composer.requestSubmit();
  });
  asks.append(chip);
}

for (const place of PLACES) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.textContent = place;
  chip.addEventListener('click', () => {
    placeInput.value = place;
    lookupForm.requestSubmit();
  });
  placesBox.append(chip);
}

/* ---------------------------------------------------------- chat */

let busy = false;
let lastQuestion = null;

composer.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message || busy) return;

  input.value = '';
  busy = true;
  send.disabled = true;
  transcript.setAttribute('aria-busy', 'true');
  log('ask', message.length > 80 ? `${message.slice(0, 77)}—?—` : message);

  addTurn('user', message);
  const host = addTurn('bot', '');
  host.append(waiting());
  pin();

  const t0 = performance.now();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, sessionId: 'web' }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

    log('nlu', `${data.intent} · ${data.place ? data.place.label : 'no place'} · ${data.lang}`);
    log('engine', `${data.mode}${data.cards ? '' : ' · no cards'} · ${data.meta.latencyMs}ms server`);

    host.querySelector('.wait-line')?.dispatchEvent(new Event('done'));
    host.querySelector('.wait-line')?.remove();
    if (data.cards) {
      placeName.textContent = data.cards.place.name;
      paintConditions(data.cards);
      paintChart(data.cards.chart);
      paintAlerts(data.cards.alerts || [], data.cards.worstSeverity);
    }

    const meta = `mode ${data.mode} · ${Math.round(performance.now() - t0)}ms round trip`;
    await playAnswer(host, data.text, meta);
    lastQuestion = message;
  } catch (error) {
    host.querySelector('.wait-line')?.dispatchEvent(new Event('done'));
    host.querySelector('.wait-line')?.remove();
    log('fault', error.message);
    const fault = document.createElement('div');
    fault.className = 'fault';
    fault.textContent = `Could not reach the forecast service: ${error.message}`;
    const again = document.createElement('button');
    again.type = 'button';
    again.textContent = 'Try again';
    again.addEventListener('click', () => {
      input.value = lastQuestion || message;
      composer.requestSubmit();
    });
    fault.append(again);
    host.append(fault);
  } finally {
    busy = false;
    send.disabled = false;
    transcript.removeAttribute('aria-busy');
    input.focus({ preventScroll: true });
    pin();
  }
});

/* ---------------------------------------------------------- panels */

const aqiLabel = (v) => (v == null ? '—?"'
  : v <= 50 ? 'good'
  : v <= 100 ? 'moderate'
  : v <= 150 ? 'sensitive groups'
  : v <= 200 ? 'unhealthy'
  : v <= 300 ? 'very unhealthy' : 'hazardous');

const round = (v, d = 0) => (v == null ? '—?"' : Number(v).toFixed(d));

function row(label, value) {
  return `<tr><th scope="row">${label}</th><td>${value}</td></tr>`;
}

function paintConditions(cards) {
  const current = cards.current || {};
  const today = cards.today || {};
  const air = cards.air;

  nowBox.className = '';
  nowBox.innerHTML = `
    <div class="now">
      <span class="temp">${current.temp != null ? `${Math.round(current.temp)}<span class="unit">C</span>` : '—?"'}</span>
      <span class="where">
        <b>${escapeHtml(cards.place.name)}</b>
        <span>${escapeHtml(describe(current.code))}</span>
        &middot; feels ${current.feelsLike != null ? `${Math.round(current.feelsLike)}°C` : '—?"'}
      </span>
    </div>
    <div class="readings">
      <table class="pair">
        <caption class="hint">${escapeHtml(cards.place.tz || '')}${cards.place.elevation != null ? ` · ${Math.round(cards.place.elevation)} m` : ''}</caption>
        <tbody>
          ${row('humidity', `${current.humidity ?? '—?"'}%`)}
          ${row('wind', `${round(current.windSpeed)} km/h`)}
          ${row('gusts', `${round(current.windGust)} km/h`)}
          ${row('pressure', `${round(current.pressure)} hPa`)}
        </tbody>
      </table>
      <table class="pair">
        <caption class="hint">today</caption>
        <tbody>
          ${row('range', `${round(today.tmax)}°C / ${round(today.tmin)}°C`)}
          ${row('rain', `${round(today.precipSum, 1)} mm · ${today.pop ?? 0}%`)}
          ${row('uv index', round(today.uv, 1))}
          ${row('air', air ? `${air.aqi} · ${aqiLabel(air.aqi)}` : '—?"')}
        </tbody>
      </table>
    </div>`;

  placeTime.textContent = current.time ? `local ${current.time.slice(11, 16)}` : '—?"';
  log('paint', `conditions + ${cards.chart?.labels?.length || 0} day series`);
}

function describe(code) {
  const map = {
    0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
    45: 'fog', 48: 'freezing fog', 51: 'light drizzle', 53: 'drizzle', 55: 'dense drizzle',
    61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain',
    71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
    80: 'light showers', 81: 'showers', 82: 'heavy showers',
    85: 'snow showers', 86: 'heavy snow showers',
    95: 'thunderstorm', 96: 'thunderstorm, hail', 99: 'severe thunderstorm',
  };
  return map[code] ?? 'conditions unknown';
}

function paintChart(series) {
  if (!series?.labels?.length) {
    chart.innerHTML = '';
    chartNote.textContent = 'no data';
    return;
  }

  const { labels, tmax, tmin, rain } = series;
  const values = [...tmax, ...tmin].filter((v) => v != null);
  const maxRain = Math.max(...rain.map((v) => v || 0), 4);
  const low = Math.min(...values) - 2;
  const high = Math.max(...values) + 2;
  const span = high - low || 1;

  const W = 320;
  const H = 150;
  const padL = 4;
  const padR = 4;
  const padT = 12;
  const padB = 18;
  const stepX = labels.length > 1 ? (W - padL - padR) / (labels.length - 1) : 0;
  const x = (i) => padL + i * stepX;
  const y = (v) => padT + (1 - (v - low) / span) * (H - padT - padB);

  const path = (seriesValues) => seriesValues
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${(v == null ? H - padB : y(v)).toFixed(1)}`)
    .join(' ');

  const grid = [0, 0.5, 1]
    .map((t) => {
      const gy = padT + t * (H - padT - padB);
      return `<line class="grid-line" x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}"/>`;
    })
    .join('');

  const bars = rain.map((v, i) => {
    const h = ((v || 0) / maxRain) * 22;
    if (h < 0.6) return '';
    const bw = Math.min(12, stepX * 0.5);
    return `<rect class="rain" x="${(x(i) - bw / 2).toFixed(1)}" y="${(H - padB - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1"/>`;
  }).join('');

  const dots = (seriesValues, cls) => seriesValues.map((v, i) => (v == null ? ''
    : `<circle class="${cls}" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="1.9"/>`)).join('');

  const tops = tmax.map((v, i) => (v == null || i % 2 ? '' :
    `<text class="value" x="${x(i).toFixed(1)}" y="${(y(v) - 5).toFixed(1)}" text-anchor="middle">${Math.round(v)}°</text>`)).join('');

  const ticks = labels.map((label, i) => {
    const date = new Date(`${label}T00:00:00Z`);
    const day = date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
    return `<text class="tick" x="${x(i).toFixed(1)}" y="${H - 5}" text-anchor="middle">${day}</text>`;
  }).join('');

  chart.innerHTML = `${grid}${bars}<path class="t-max" d="${path(tmax)}"/><path class="t-min" d="${path(tmin)}"/>${dots(tmax, 'dot-max')}${dots(tmin, 'dot-min')}${tops}${ticks}`;
  chartNote.textContent = `${labels[0]} —?' ${labels[labels.length - 1]}`;
}

function paintAlerts(list, worst) {
  const level = worst || 'none';
  sevBox.dataset.level = level;
  sevBox.textContent = level === 'none' ? 'none in range' : `${level} warning`;

  if (!list.length) {
    alertsBox.innerHTML = '<p class="empty">No yellow, orange or red threshold is met by the next three days of model output for this place.</p>';
    return;
  }

  alertsBox.innerHTML = list.map((a) => `
    <div class="alert" data-level="${a.severity}">
      <div class="top">
        <span class="name">${escapeHtml(a.title)}</span>
        <span class="when">${escapeHtml(a.date)}</span>
      </div>
      <div class="why">${escapeHtml(a.criteria)}</div>
      <div class="do">${escapeHtml(a.advisory?.general || '')}</div>
    </div>`).join('');

  log('paint', `${list.length} warning(s), highest ${level}`);
}

/* ---------------------------------------------------------- place lookup */

async function lookUp(place) {
  placeTime.textContent = 'loading—?—';
  nowBox.className = 'empty';
  nowBox.textContent = `Reading the forecast for ${place}—?—`;

  try {
    const response = await fetch(`/api/weather?place=${encodeURIComponent(place)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

    placeName.textContent = data.place.name;
    paintConditions(data.cards);
    paintChart(data.cards.chart);
    paintAlerts(data.cards.alerts || [], data.cards.worstSeverity);
    log('lookup', `${place} —?' ${data.place.label} · ${data.meta.latencyMs}ms`);
  } catch (error) {
    log('fault', `lookup ${place}: ${error.message}`);
    nowBox.className = '';
    const fault = document.createElement('div');
    fault.className = 'fault';
    fault.textContent = `${place} could not be resolved or read: ${error.message}`;
    const again = document.createElement('button');
    again.type = 'button';
    again.textContent = 'Try again';
    again.addEventListener('click', () => lookUp(place));
    fault.append(again);
    nowBox.innerHTML = '';
    nowBox.append(fault);
    alertsBox.innerHTML = '<p class="empty">No warning data for this place.</p>';
    sevBox.dataset.level = 'none';
    sevBox.textContent = 'unavailable';
  }
}

lookupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const place = placeInput.value.trim();
  if (place) lookUp(place);
});

/* ---------------------------------------------------------- boot */

const idle = () => new Promise((resolve) => {
  const tick = () => (busy ? setTimeout(tick, 90) : resolve());
  tick();
});

/* ?demo=1 runs two real questions through the real backend. Nothing is
   faked: it is the same request a reader would type, which is why it is
   useful for checking the rendered answer and for rehearsing a talk. */
async function runDemo() {
  log('demo', 'demo transcript requested');
  for (const question of ['will it rain tomorrow in Mumbai', 'any alerts for Chennai']) {
    await idle();
    input.value = question;
    composer.requestSubmit();
    await idle();
    await new Promise((resolve) => setTimeout(resolve, 2600));
  }
}

(async function boot() {
  log('boot', 'client ready');

  try {
    const config = await (await fetch('/api/config')).json();
    const brain = config.gemini ? `Gemini ${config.model}` : 'deterministic engine';
    $('#statusEngine').textContent = `engine · ${brain}`;
    $('#colophonEngine').textContent = brain;
    log('engine', config.gemini ? `gemini on (${config.model})` : 'gemini off · deterministic');
  } catch {
    $('#statusEngine').textContent = 'engine · unreachable';
    log('fault', 'config unreachable');
  }

  await lookUp('New Delhi');

  const params = new URLSearchParams(location.search);
  if (params.has('log')) logToggle.click();
  if (params.has('demo')) setTimeout(runDemo, 400);
})();