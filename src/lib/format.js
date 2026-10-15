export function round(value, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

export function fmt(value, digits = 0, suffix = '') {
  const r = round(value, digits);
  return r == null ? '—' : `${r}${suffix}`;
}

const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function compass(deg) {
  if (deg == null || Number.isNaN(Number(deg))) return null;
  return DIRS[Math.round(((Number(deg) % 360) / 22.5)) % 16];
}

export function windText(speed, dir) {
  const c = compass(dir);
  const s = fmt(speed, 0, ' km/h');
  if (s === '—') return '—';
  return c ? `${s} from ${c}` : s;
}

export function aqiInfo(usAqi) {
  if (usAqi == null) return { label: 'Unknown', color: '#94a3b8' };
  if (usAqi <= 50) return { label: 'Good', color: '#22c55e' };
  if (usAqi <= 100) return { label: 'Moderate', color: '#eab308' };
  if (usAqi <= 150) return { label: 'Unhealthy for sensitive groups', color: '#f97316' };
  if (usAqi <= 200) return { label: 'Unhealthy', color: '#ef4444' };
  if (usAqi <= 300) return { label: 'Very unhealthy', color: '#a855f7' };
  return { label: 'Hazardous', color: '#7f1d1d' };
}

export function weekdayShort(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

export function shiftDate(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

export function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
