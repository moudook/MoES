export const SEVERITY_RANK = { yellow: 1, orange: 2, red: 3 };

export const SEVERITY_LABEL = {
  yellow: { en: 'Yellow watch', hi: 'पीला निरीक्षण' },
  orange: { en: 'Orange warning', hi: 'नारंगी चेतावनी' },
  red: { en: 'Red warning', hi: 'लाल चेतावनी' },
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
  const month = Number(day.date.slice(5, 7));
  const push = (hazard, severity, title, titleHi, criteria, advisory) => {
    alerts.push({
      id: `${hazard}-${severity}-${day.date}`,
      hazard,
      severity,
      title,
      titleHi,
      criteria,
      window: { from: day.date, to: day.date },
      advisory,
    });
  };

  if (day.precipSum != null) {
    if (day.precipSum >= EXTREMELY_HEAVY_RAIN) {
      push('extremely_heavy_rain', 'red', 'Extremely heavy rainfall', 'अत्यधिक भारी वर्षा',
        `24h rainfall ${day.precipSum} mm ≥ ${EXTREMELY_HEAVY_RAIN} mm (IMD red criterion)`,
        {
          general: { en: 'Extremely heavy rain expected. Avoid unnecessary travel, expect waterlogging and possible flooding.', hi: 'अत्यधिक भारी बारिश। अनावश्यक यात्रा से बचें, जलभराव और बाढ़ की संभावना।' },
          farmers: { en: 'Ensure drainage in fields; postpone spraying and harvesting.', hi: 'खेतों में नाली सुनिश्चित करें; छिड़काव और कटाई टालें।' },
          urban: { en: 'Low-lying areas may flood. Keep pumps and sandbags ready.', hi: 'निचले इलाकों में जलभराव संभव। पंप और बोरिये तैयार रखें।' },
          aviation: { en: 'Expect heavy rain and poor visibility; delays likely.', hi: 'भारी बारिश और खराब दृश्यता; देरी संभावित।' },
        });
    } else if (day.precipSum >= VERY_HEAVY_RAIN) {
      push('very_heavy_rain', 'red', 'Very heavy rainfall', 'बहुत भारी वर्षा',
        `24h rainfall ${day.precipSum} mm ≥ ${VERY_HEAVY_RAIN} mm (IMD red criterion)`,
        {
          general: { en: 'Very heavy rain likely; stay alert, avoid rivers and low areas.', hi: 'बहुत भारी बारिश की संभावना; सतर्क रहें, नदियों और निचले इलाकों से बचें।' },
          farmers: { en: 'Protect standing crops; improve field drainage.', hi: 'खड़ी फसल सुरक्षित रखें; खेत में पानी निकालें।' },
          urban: { en: 'Waterlogging likely on major roads.', hi: 'मुख्य सड़कों पर जलभराव संभव।' },
          aviation: { en: 'Wet runway and reduced visibility; expect schedule disruptions.', hi: 'गीला रनवे और कम दृश्यता; समय-सारणी प्रभावित।' },
        });
    } else if (day.precipSum >= HEAVY_RAIN) {
      push('heavy_rain', 'orange', 'Heavy rainfall', 'भारी वर्षा',
        `24h rainfall ${day.precipSum} mm ≥ ${HEAVY_RAIN} mm (IMD orange criterion)`,
        {
          general: { en: 'Heavy rain expected; carry rain gear and plan travel accordingly.', hi: 'भारी बारिश की संभावना; रेनकोट लें और यात्रा नियोजित करें।' },
          farmers: { en: 'Postpone irrigation; check for waterlogging in low fields.', hi: 'सिंचाई टालें; निचले खेतों में जलभराव जाँचें।' },
          urban: { en: 'Localised waterlogging and traffic slowdowns possible.', hi: 'स्थानीय जलभराव और यातायात मंदी संभव।' },
          aviation: { en: 'Moderate turbulence and visibility reduction.', hi: 'मध्यम उथल-पुथल और दृश्यता में कमी।' },
        });
    } else if (day.precipSum >= 35 && (day.pop == null || day.pop >= 50)) {
      push('isolated_heavy_rain', 'yellow', 'Isolated heavy rain possible', 'कहीं-कहीं भारी बारिश संभव',
        `24h rainfall ${day.precipSum} mm with high rain probability (IMD yellow watch)`,
        {
          general: { en: 'Isolated heavy spells possible; keep an umbrella handy.', hi: 'कहीं-कहीं भारी बारिश संभव; छाता साथ रखें।' },
          farmers: { en: 'Hold pesticide/fertilizer sprays for a clear window.', hi: 'छिड़काव के लिए साफ़ मौसम का इंतज़ार करें।' },
          urban: { en: 'Brief intense showers may cause local waterlogging.', hi: 'छोटे तेज़ झमे स्थानीय जलभराव कर सकते हैं।' },
        });
    }
  }

  if (day.code === 95 || day.code === 96 || day.code === 99) {
    const severe = day.precipSum != null && day.precipSum >= 50;
    push(severe ? 'thunderstorm' : 'thunderstorm_watch', severe ? 'orange' : 'yellow',
      severe ? 'Thunderstorm with heavy rain' : 'Thunderstorm watch',
      severe ? 'भारी बारिश के साथ गरज' : 'गरज की संभावना',
      severe ? 'Thunderstorm (WMO 95/96/99) with 24h rainfall ≥ 50 mm' : 'Thunderstorm indicated by NWP model (WMO code 95/96/99)',
      {
        general: { en: 'Thunder and lightning expected. Take shelter indoors, avoid open areas and trees.', hi: 'गरज और बिजली संभव। घर के अंदर शरण लें, खुले स्थान और पेड़ों से बचें।' },
        farmers: { en: 'Stop field work and stay away from machinery during storms.', hi: 'तूफ़ान के दौरान खेत का काम रोकें और मशीनरी से दूर रहें।' },
        urban: { en: 'Secure loose objects; brief power cuts possible.', hi: 'ढीली वस्तुएँ सुरक्षित करें; बिजली कटौती संभव।' },
      });
  }

  if (day.gustMax != null && day.gustMax >= CYCLONIC_GUST) {
    push('squall_cyclonic', 'red', 'Cyclonic-strength winds', 'चक्रवाती तेज़ हवाएँ',
      `Wind gusts ${day.gustMax} km/h ≥ ${CYCLONIC_GUST} km/h (IMD squall/cyclone threshold)`,
      {
        general: { en: 'Dangerous winds expected. Stay indoors, secure loose items, expect power outages.', hi: 'खतरनाक हवाएँ। घर के अंदर रहें, ढीली वस्तुएँ बाँधें, बिजली गुल हो सकती है।' },
        farmers: { en: 'Reinforce sheds, polyhouses and drying crops.', hi: 'शेड, पॉलीहाउस और सुख रही फसल मज़बूत करें।' },
        urban: { en: 'Avoid hoardings; park vehicles away from trees.', hi: 'होर्डिंग से दूर रहें; वाहन पेड़ों से दूर खड़ी करें।' },
      });
  } else if (day.gustMax != null && day.gustMax >= SQUALL_GUST) {
    push('squall', 'orange', 'Squall / gale winds', 'झोंकेदार तेज़ हवाएँ',
      `Wind gusts ${day.gustMax} km/h ≥ ${SQUALL_GUST} km/h (IMD squall threshold)`,
      {
        general: { en: 'Strong gusty winds likely; secure loose objects and travel with care.', hi: 'तेज़ झोंकेदार हवाएँ; ढीली वस्तुएँ बाँधें, सावधानी से यात्रा करें।' },
        farmers: { en: 'Support banana/tall crops and greenhouses.', hi: 'केला/लंबी फसल और ग्रीनहाउस को सहारा दें।' },
        aviation: { en: 'Crosswind limits may be reached at some runways.', hi: 'कुछ रनवे पर क्रॉसविंड सीमा पहुँच सकती है।' },
      });
  }

  if (heatSeason(day.date) && day.tmax != null) {
    if (day.tmax >= 45) {
      push('heatwave', 'red', 'Severe heatwave', 'भीषण लू',
        `Tmax ${day.tmax}°C ≥ 45°C (IMD red heat criterion, plains)`,
        {
          general: { en: 'Extreme heat. Stay indoors 12–4 PM, hydrate, watch for heat stroke.', hi: 'अत्यधिक गर्मी। दोपहर 12–4 बजे घर के अंदर रहें, पानी पिएँ, हीट स्ट्रोक से सावधान।' },
          farmers: { en: 'Irrigate in the evening; provide shade for livestock.', hi: 'शाम को सिंचाई करें; पशुओं को छाया दें।' },
          health: { en: 'High risk for elderly, children and outdoor workers.', hi: 'बुज़ुर्गों, बच्चों और बाहरी मज़दूरों के लिए उच्च जोखिम।' },
        });
    } else if (day.tmax >= 42) {
      push('heatwave', 'orange', 'Heatwave', 'लू',
        `Tmax ${day.tmax}°C ≥ 42°C (IMD orange heat criterion, plains)`,
        {
          general: { en: 'Heatwave conditions. Limit afternoon outdoor activity.', hi: 'लू की स्थिति। दोपहर की बाहरी गतिविधि सीमित रखें।' },
          farmers: { en: 'Shift irrigation to early morning/late evening.', hi: 'सिंचाई सुबह जल्दी या शाम देर करें।' },
          health: { en: 'Drink water frequently; avoid direct sun.', hi: 'बार-बार पानी पिएँ; सीधी धूप से बचें।' },
        });
    } else if (day.tmax >= 40) {
      push('heat_stress', 'yellow', 'High heat stress', 'उच्च गर्मी तनाव',
        `Tmax ${day.tmax}°C ≥ 40°C (IMD yellow watch, plains)`,
        {
          general: { en: 'Very warm day; stay hydrated and wear light clothes.', hi: 'बहुत गर्म दिन; हाइड्रेटेड रहें, हल्के कपड़े पहनें।' },
          farmers: { en: 'Reschedule heavy field work to cooler hours.', hi: 'भारी खेत काम ठंडे समय में करें।' },
        });
    }
  }

  if (coldSeason(day.date) && day.tmin != null) {
    if (day.tmin <= 4) {
      push('coldwave', 'red', 'Severe cold wave', 'भीषण शीत लहर',
        `Tmin ${day.tmin}°C ≤ 4°C (IMD red cold wave criterion, plains)`,
        {
          general: { en: 'Severe cold. Avoid early-morning exposure; layer up.', hi: 'भीषण ठंड। सुबह जल्दी बाहर निकलने से बचें, गर्म कपड़े पहनें।' },
          farmers: { en: 'Protect vegetable and mustard crops from frost; irrigate late afternoon.', hi: 'सब्ज़ी और सरसों की फसल को पाले से बचाएँ; देर दोपहर सिंचाई करें।' },
          health: { en: 'Watch elderly and infants for cold-related illness.', hi: 'बुज़ुर्गों और शिशुओं पर नज़र रखें।' },
        });
    } else if (day.tmin <= 10) {
      push('coldwave', 'yellow', 'Cold wave watch', 'शीत लहर की संभावना',
        `Tmin ${day.tmin}°C ≤ 10°C (IMD yellow watch, plains)`,
        {
          general: { en: 'Cold wave conditions; limit early morning exposure.', hi: 'शीत लहर; सुबह के समय बाहर निकलने को सीमित करें।' },
          farmers: { en: 'Delay sowing of sensitive crops; light evening irrigation helps.', hi: 'संवेदनशील फसल की बुआई टालें; हल्की शाम सिंचाई मददगार।' },
        });
    }
  }

  if ((day.code === 45 || day.code === 48) && coldSeason(day.date)) {
    push('fog', 'yellow', 'Dense fog', 'घना कोहरा',
      `Fog indicated by NWP model (WMO ${day.code}) during cold season`,
      {
        general: { en: 'Dense fog likely; drive with fog lights, keep distance, expect delays.', hi: 'घना कोहरा; फॉग लाइट से चलें, दूरी रखें, देरी संभव।' },
        aviation: { en: 'Low visibility procedures likely; delays possible.', hi: 'कम दृश्यता प्रक्रिया संभव; देरी हो सकती है।' },
        farmers: { en: 'Favourable for wheat; protect nursery from prolonged damp.', hi: 'गेहूँ के लिए अनुकूल; लंबी नमी से पौध सुरक्षित रखें।' },
      });
  }

  if (day.code === 71 || day.code === 73 || day.code === 75 || day.code === 86) {
    push('snowfall', 'yellow', 'Snowfall', 'बर्फबारी',
      `Snow indicated by NWP model (WMO ${day.code})`,
      {
        general: { en: 'Snow expected; roads may be slippery, avoid high passes.', hi: 'बर्फबारी; सड़कें फिसलन संभव, ऊँचे दर्रे से बचें।' },
        aviation: { en: 'Runway contamination and delays possible.', hi: 'रनवे प्रभावित और देरी संभव।' },
      });
  }

  if (options.riverTrend != null && options.riverTrend >= 0.5 && ((day.precipSum != null && day.precipSum >= 50) || (day.pop != null && day.pop >= 60))) {
    push('flood_watch', 'orange', 'River flood watch', 'नदी बाढ़ निगरानी',
      `River discharge rising ${Math.round(options.riverTrend * 100)}% over forecast window with heavy rain in catchment`,
      {
        general: { en: 'River levels rising fast with rain in the catchment; stay away from riverbanks.', hi: 'छोटे-बड़े नदियों का जलस्तर तेज़ी से बढ़ रहा; तट से दूर रहें।' },
        farmers: { en: 'Move equipment and livestock to higher ground.', hi: 'उपकरण और पशु ऊँची जगह पर करें।' },
        urban: { en: 'Riverside colonies may need evacuation prep.', hi: 'नदी किनारे के मोहल्लों में निकासी की तैयारी।' },
      });
  }

  if (alerts.length === 0 && month >= 0 && day.pop != null && day.pop >= 85) {
    push('showers_watch', 'yellow', 'High rain probability', 'बारिश की उच्च संभावना',
      `Rain probability ${day.pop}% indicated by NWP model`,
      {
        general: { en: 'Rain very likely; carry an umbrella.', hi: 'बारिश की पूरी संभावना; छाता लेकर निकलें।' },
        farmers: { en: 'Postpone spraying operations.', hi: 'छिड़काव कार्य टालें।' },
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

export function maxSeverityRank(minSeverity) {
  return SEVERITY_RANK[minSeverity] || 0;
}
