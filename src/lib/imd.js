export const SEVERITY_RANK = { yellow: 1, orange: 2, red: 3 };

export const SEVERITY_LABEL = {
  yellow: 'Yellow watch',
  orange: 'Orange warning',
  red: 'Red warning',
};

export const SEVERITY_COLOR = {
  yellow: '#facc15',
  orange: '#fb923c',
  red: '#ef4444',
};

const HEAVY_RAIN = 64.5;
const VERY_HEAVY_RAIN = 115.5;
const EXTREMELY_HEAVY_RAIN = 204.5;
const SQUALL_GUST = 62;
const CYCLONIC_GUST = 90;

function inWindow(month, months) {
  return months.includes(month);
}

function heatSeason(date) {
  return inWindow(Number(date.slice(5, 7)), [3, 4, 5, 6, 7]);
}

function coldSeason(date) {
  return inWindow(Number(date.slice(5, 7)), [11, 12, 1, 2]);
}

export function assessDay(day, options = {}) {
  const alerts = [];
  if (!day || !day.date) return alerts;
  const push = (hazard, severity, title, criteria, advisory) => {
    alerts.push({
      id: `${hazard}-${severity}-${day.date}`,
      hazard,
      severity,
      title,
      criteria,
      window: { from: day.date, to: day.date },
      advisory,
    });
  };

  if (day.precipSum != null) {
    if (day.precipSum >= EXTREMELY_HEAVY_RAIN) {
      push('extremely_heavy_rain', 'red', 'Extremely heavy rainfall',
        `24h rainfall ${day.precipSum} mm >= ${EXTREMELY_HEAVY_RAIN} mm (IMD red criterion)`,
        {
          general: 'Extremely heavy rain expected. Avoid unnecessary travel; expect waterlogging and possible flooding.',
          farmers: 'Ensure drainage in fields; postpone spraying and harvesting.',
          urban: 'Low-lying areas may flood. Keep pumps and sandbags ready.',
          aviation: 'Expect heavy rain and poor visibility; delays likely.',
        });
    } else if (day.precipSum >= VERY_HEAVY_RAIN) {
      push('very_heavy_rain', 'red', 'Very heavy rainfall',
        `24h rainfall ${day.precipSum} mm >= ${VERY_HEAVY_RAIN} mm (IMD red criterion)`,
        {
          general: 'Very heavy rain likely; stay alert, avoid rivers and low areas.',
          farmers: 'Protect standing crops; improve field drainage.',
          urban: 'Waterlogging likely on major roads.',
          aviation: 'Wet runway and reduced visibility; expect schedule disruptions.',
        });
    } else if (day.precipSum >= HEAVY_RAIN) {
      push('heavy_rain', 'orange', 'Heavy rainfall',
        `24h rainfall ${day.precipSum} mm >= ${HEAVY_RAIN} mm (IMD orange criterion)`,
        {
          general: 'Heavy rain expected; carry rain gear and plan travel accordingly.',
          farmers: 'Postpone irrigation; check for waterlogging in low fields.',
          urban: 'Localised waterlogging and traffic slowdowns possible.',
          aviation: 'Moderate turbulence and visibility reduction.',
        });
    } else if (day.precipSum >= 35 && (day.pop == null || day.pop >= 50)) {
      push('isolated_heavy_rain', 'yellow', 'Isolated heavy rain possible',
        `24h rainfall ${day.precipSum} mm with high rain probability (IMD yellow watch)`,
        {
          general: 'Isolated heavy spells possible; keep an umbrella handy.',
          farmers: 'Hold pesticide/fertilizer sprays for a clear window.',
          urban: 'Brief intense showers may cause local waterlogging.',
        });
    }
  }

  if (day.code === 95 || day.code === 96 || day.code === 99) {
    const severe = day.precipSum != null && day.precipSum >= 50;
    push(severe ? 'thunderstorm' : 'thunderstorm_watch', severe ? 'orange' : 'yellow',
      severe ? 'Thunderstorm with heavy rain' : 'Thunderstorm watch',
      severe ? 'Thunderstorm (WMO 95/96/99) with 24h rainfall >= 50 mm' : 'Thunderstorm indicated by NWP model (WMO code 95/96/99)',
      {
        general: 'Thunder and lightning expected. Take shelter indoors, avoid open areas and trees.',
        farmers: 'Stop field work and stay away from machinery during storms.',
        urban: 'Secure loose objects; brief power cuts possible.',
      });
  }

  if (day.gustMax != null && day.gustMax >= CYCLONIC_GUST) {
    push('squall_cyclonic', 'red', 'Cyclonic-strength winds',
      `Wind gusts ${day.gustMax} km/h >= ${CYCLONIC_GUST} km/h (IMD squall/cyclone threshold)`,
      {
        general: 'Dangerous winds expected. Stay indoors, secure loose items, expect power outages.',
        farmers: 'Reinforce sheds, polyhouses and drying crops.',
        urban: 'Avoid hoardings; park vehicles away from trees.',
      });
  } else if (day.gustMax != null && day.gustMax >= SQUALL_GUST) {
    push('squall', 'orange', 'Squall / gale winds',
      `Wind gusts ${day.gustMax} km/h >= ${SQUALL_GUST} km/h (IMD squall threshold)`,
      {
        general: 'Strong gusty winds likely; secure loose objects and travel with care.',
        farmers: 'Support banana/tall crops and greenhouses.',
        aviation: 'Crosswind limits may be reached at some runways.',
      });
  }

  if (heatSeason(day.date) && day.tmax != null) {
    if (day.tmax >= 45) {
      push('heatwave', 'red', 'Severe heatwave',
        `Tmax ${day.tmax}C >= 45C (IMD red heat criterion, plains)`,
        {
          general: 'Extreme heat. Stay indoors 12-4 PM, hydrate, watch for heat stroke.',
          farmers: 'Irrigate in the evening; provide shade for livestock.',
          health: 'High risk for elderly, children and outdoor workers.',
        });
    } else if (day.tmax >= 42) {
      push('heatwave', 'orange', 'Heatwave',
        `Tmax ${day.tmax}C >= 42C (IMD orange heat criterion, plains)`,
        {
          general: 'Heatwave conditions. Limit afternoon outdoor activity.',
          farmers: 'Shift irrigation to early morning or late evening.',
          health: 'Drink water frequently; avoid direct sun.',
        });
    } else if (day.tmax >= 40) {
      push('heat_stress', 'yellow', 'High heat stress',
        `Tmax ${day.tmax}C >= 40C (IMD yellow watch, plains)`,
        {
          general: 'Very warm day; stay hydrated and wear light clothes.',
          farmers: 'Reschedule heavy field work to cooler hours.',
        });
    }
  }

  if (coldSeason(day.date) && day.tmin != null) {
    if (day.tmin <= 4) {
      push('coldwave', 'red', 'Severe cold wave',
        `Tmin ${day.tmin}C <= 4C (IMD red cold wave criterion, plains)`,
        {
          general: 'Severe cold. Avoid early-morning exposure; layer up.',
          farmers: 'Protect vegetable and mustard crops from frost; irrigate late afternoon.',
          health: 'Watch elderly and infants for cold-related illness.',
        });
    } else if (day.tmin <= 10) {
      push('coldwave', 'yellow', 'Cold wave watch',
        `Tmin ${day.tmin}C <= 10C (IMD yellow watch, plains)`,
        {
          general: 'Cold wave conditions; limit early morning exposure.',
          farmers: 'Delay sowing of sensitive crops; light evening irrigation helps.',
        });
    }
  }

  if ((day.code === 45 || day.code === 48) && coldSeason(day.date)) {
    push('fog', 'yellow', 'Dense fog',
      `Fog indicated by NWP model (WMO ${day.code}) during cold season`,
      {
        general: 'Dense fog likely; drive with fog lights, keep distance, expect delays.',
        aviation: 'Low visibility procedures likely; delays possible.',
        farmers: 'Favourable for wheat; protect nursery from prolonged damp.',
      });
  }

  if (day.code === 71 || day.code === 73 || day.code === 75 || day.code === 86) {
    push('snowfall', 'yellow', 'Snowfall',
      `Snow indicated by NWP model (WMO ${day.code})`,
      {
        general: 'Snow expected; roads may be slippery, avoid high passes.',
        aviation: 'Runway contamination and delays possible.',
      });
  }

  if (options.riverTrend != null && options.riverTrend >= 0.5 && ((day.precipSum != null && day.precipSum >= 50) || (day.pop != null && day.pop >= 60))) {
    push('flood_watch', 'orange', 'River flood watch',
      `River discharge rising ${Math.round(options.riverTrend * 100)}% over forecast window with heavy rain in catchment`,
      {
        general: 'River levels rising fast with rain in the catchment; stay away from riverbanks.',
        farmers: 'Move equipment and livestock to higher ground.',
        urban: 'Riverside colonies may need evacuation prep.',
      });
  }

  if (alerts.length === 0 && day.pop != null && day.pop >= 85) {
    push('showers_watch', 'yellow', 'High rain probability',
      `Rain probability ${day.pop}% indicated by NWP model`,
      {
        general: 'Rain very likely; carry an umbrella.',
        farmers: 'Postpone spraying operations.',
      });
  }

  return alerts;
}

export function worstSeverity(alerts) {
  let worst = null;
  for (const alert of alerts) {
    if (!worst || SEVERITY_RANK[alert.severity] > SEVERITY_RANK[worst]) worst = alert.severity;
  }
  return worst;
}
