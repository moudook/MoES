import { assessDay } from '../lib/imd.js';

export function buildAlerts(forecast, options = {}) {
  const { from = 0, to = 2, place = null, riverTrend = null } = options;
  const alerts = [];
  const days = forecast?.daily || [];
  for (let i = from; i <= Math.min(to, days.length - 1); i += 1) {
    const day = days[i];
    if (!day) continue;
    const dayAlerts = assessDay(day, i === from ? { riverTrend } : {});
    for (const alert of dayAlerts) {
      alerts.push({ ...alert, date: day.date });
    }
  }
  alerts.sort((a, b) => {
    const rank = { red: 3, orange: 2, yellow: 1 };
    if (rank[b.severity] !== rank[a.severity]) return rank[b.severity] - rank[a.severity];
    return a.window.from.localeCompare(b.window.from);
  });
  return alerts;
}

export function highestSeverity(alerts) {
  const order = ['red', 'orange', 'yellow'];
  for (const s of order) {
    if (alerts.some((a) => a.severity === s)) return s;
  }
  return null;
}
