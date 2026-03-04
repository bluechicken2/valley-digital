// ================================================
// GLOBEWATCH - Globe.gl Engine
// ================================================

var GEOJSON_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
var EARTH_IMG   = 'https://unpkg.com/three-globe/example/img/earth-night.jpg';

var globeInst      = null;
var countryMap     = {};   // ISO_A2 -> { story_count, country_name }
var currentOverlay = 'all';
var selectedCtry   = null;
var geoData        = null;
var rotateTimer    = null;

// ------------------------------------------------
// Overlay colour schemes
// ------------------------------------------------
var OVERLAYS = {
  all: function(heat) {
    if (heat === 0)  return 'rgba(255,255,255,0.025)';
    if (heat <= 3)   return 'rgba(0,212,255,0.15)';
    if (heat <= 8)   return 'rgba(123,47,255,0.30)';
    if (heat <= 15)  return 'rgba(255,170,0,0.42)';
    return 'rgba(255,68,68,0.62)';
  },
  density: function(heat) {
    if (heat === 0) return 'rgba(0,0,0,0.02)';
    var t = Math.min(heat / 20, 1);
    return 'rgba(' + Math.round(t*255) + ',' + Math.round((1-t)*120) + ',' + Math.round((1-t)*255) + ',' + (0.15+t*0.5) + ')';
  },
  conflicts: function(heat, code) {
    var HOT = { UA:1,RU:1,PS:1,IL:1,SY:1,YE:1,SD:1,SO:1,ET:1,MM:1,CD:1,AF:1,ML:1,NE:1,LY:1,IQ:1,LB:1,AZ:1 };
    return HOT[code] ? 'rgba(255,68,68,0.58)' : 'rgba(255,255,255,0.02)';
  },
  weather: function(heat) {
    return heat === 0 ? 'rgba(0,150,255,0.05)' : 'rgba(0,180,255,' + (0.08+Math.min(heat/15,1)*0.42) + ')';
  },
  elections: function(heat) {
    return heat === 0 ? 'rgba(123,47,255,0.04)' : 'rgba(123,47,255,' + (0.08+Math.min(heat/15,1)*0.5) + ')';
  }
};

function getCapColor(feat) {
  var code = (feat.properties && feat.properties.ISO_A2) || '';
  var heat = (countryMap[code] && countryMap[code].story_count) || 0;
  var fn   = OVERLAYS[currentOverlay] || OVERLAYS.all;
  return fn(heat, code);
}
function getSideColor(feat) {
  var code = (feat.properties && feat.properties.ISO_A2) || '';
  var heat = (countryMap[code] && countryMap[code].story_count) || 0;
  return heat > 0 ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.04)';
}
function getAltitude(feat) {
  var code = (feat.properties && feat.properties.ISO_A2) || '';
  var heat = (countryMap[code] && countryMap[code].story_count) || 0;
  return 0.001 + Math.min(heat/20, 1) * 0.01;
}

// ------------------------------------------------
// Init globe (dashboard)
// ------------------------------------------------
function initDashboardGlobe(containerId, onCountryClick) {
  var el = document.getElementById(containerId);
  if (!el || typeof Globe === 'undefined') {
    console.warn('[Globe] container or Globe.gl not ready');
    return null;
  }

  var g = Globe()
    .width(el.clientWidth  || window.innerWidth)
    .height(el.clientHeight || window.innerHeight)
    .backgroundColor('#080b12')
    .atmosphereColor('rgba(0,212,255,0.70)')
    .atmosphereAltitude(0.18)
    .globeImageUrl(EARTH_IMG);

  g(el);
  globeInst = g;

  var ctrl = g.controls();
  ctrl.autoRotate      = true;
  ctrl.autoRotateSpeed = 0.4;
  ctrl.enableDamping   = true;
  ctrl.dampingFactor   = 0.08;
  ctrl.minDistance     = 160;
  ctrl.maxDistance     = 620;

  el.addEventListener('pointerdown', function() {
    ctrl.autoRotate = false;
    if (rotateTimer) clearTimeout(rotateTimer);
    rotateTimer = setTimeout(function() { ctrl.autoRotate = true; }, 3000);
  });

  fetch(GEOJSON_URL)
    .then(function(r) { return r.json(); })
    .then(function(data) { geoData = data; _applyPolygons(g, data, onCountryClick); })
    .catch(function(e) { console.warn('[Globe] GeoJSON failed:', e.message); });

  var ro = new ResizeObserver(function() { g.width(el.clientWidth).height(el.clientHeight); });
  ro.observe(el);

  return g;
}

function _applyPolygons(g, geoJson, onCountryClick) {
  g.polygonsData(geoJson.features)
   .polygonCapColor(getCapColor)
   .polygonSideColor(getSideColor)
   .polygonAltitude(getAltitude)
   .polygonStrokeColor(function() { return 'rgba(0,212,255,0.10)'; })
   .onPolygonHover(function(feat) {
      var tip = document.getElementById('globe-tooltip');
      if (!tip) return;
      if (!feat) { tip.classList.remove('visible'); return; }
      var code = (feat.properties && feat.properties.ISO_A2) || '';
      var name = (feat.properties && (feat.properties.ADMIN || feat.properties.NAME)) || code;
      var heat = (countryMap[code] && countryMap[code].story_count) || 0;
      tip.querySelector('.tooltip-country').textContent = name.toUpperCase();
      tip.querySelector('.tooltip-count').textContent   = heat + ' active ' + (heat===1?'story':'stories');
      tip.querySelector('.tooltip-heat').textContent    = heat > 0 ? _heatLabel(heat) : '';
      tip.classList.add('visible');
   })
   .onPolygonClick(function(feat) {
      var code = (feat.properties && feat.properties.ISO_A2) || '';
      var name = (feat.properties && feat.properties.ADMIN) || code;
      if (selectedCtry === code) {
        clearGlobeFilter();
      } else {
        selectedCtry = code;
        _showFilterBadge(name);
        if (typeof onCountryClick === 'function') onCountryClick(code, name);
      }
   });
}

function _heatLabel(h) {
  if (h <= 3)  return 'Low activity';
  if (h <= 8)  return 'Moderate activity';
  if (h <= 15) return 'High activity';
  return 'Critical activity';
}

document.addEventListener('mousemove', function(e) {
  var t = document.getElementById('globe-tooltip');
  if (t && t.classList.contains('visible')) {
    t.style.left = (e.clientX + 14) + 'px';
    t.style.top  = (e.clientY - 10) + 'px';
  }
});

// ------------------------------------------------
// Story pins
// ------------------------------------------------
var CAT_COLORS = {
  'War & Conflict':    '#ff4444',
  'Politics':          '#7b2fff',
  'Weather & Disaster':'#ffaa00',
  'Economy':           '#00d4ff',
  'Science & Tech':    '#00ff88',
  'Health':            '#ff69b4',
  'Elections':         '#4488ff',
  'Environment':       '#44ff88'
};

function updateStoryPins(stories) {
  if (!globeInst) return;
  var pins = stories
    .filter(function(s) { return s.lat != null && s.lng != null; })
    .map(function(s) {
      return {
        id:    s.id,
        lat:   +s.lat,
        lng:   +s.lng,
        color: CAT_COLORS[s.category] || '#00d4ff',
        size:  s.is_breaking ? 0.85 : 0.5,
        label: s.headline
      };
    });
  globeInst
    .pointsData(pins)
    .pointLat(function(d) { return d.lat; })
    .pointLng(function(d) { return d.lng; })
    .pointColor(function(d) { return d.color; })
    .pointAltitude(0.015)
    .pointRadius(function(d) { return d.size; })
    .pointLabel(function(d) {
      return '<div style="background:rgba(13,17,23,0.92);border:1px solid rgba(0,212,255,0.18);border-radius:8px;padding:7px 11px;font-family:Inter,sans-serif;font-size:12px;color:#e8eaf0;max-width:220px;line-height:1.4">' + d.label + '</div>';
    });
}

// ------------------------------------------------
// Update heat map from stories
// ------------------------------------------------
function updateCountryStatsFromStories(stories) {
  countryMap = {};
  stories.forEach(function(s) {
    if (!s.country_code) return;
    if (!countryMap[s.country_code]) countryMap[s.country_code] = { story_count: 0, country_name: s.country_name };
    countryMap[s.country_code].story_count++;
  });
  _refreshColors();
  _updateHUD(stories);
  updateStoryArcs(stories);
}

function _refreshColors() {
  if (!globeInst || !geoData) return;
  globeInst.polygonCapColor(getCapColor).polygonSideColor(getSideColor).polygonAltitude(getAltitude);
}

// ------------------------------------------------
// Animated counter (Task 6)
// ------------------------------------------------
var _counterTimers = {};
function animateCounter(el, target, duration) {
  if (!el) return;
  duration = duration || 1200;
  var id = el.id || Math.random().toString(36);
  if (_counterTimers[id]) cancelAnimationFrame(_counterTimers[id]);
  var start  = parseInt(el.textContent, 10) || 0;
  var delta  = target - start;
  var tStart = null;
  function step(ts) {
    if (!tStart) tStart = ts;
    var p = Math.min((ts - tStart) / duration, 1);
    var e = 1 - Math.pow(1 - p, 3);  // ease-out cubic
    el.textContent = Math.round(start + delta * e);
    if (p < 1) { _counterTimers[id] = requestAnimationFrame(step); }
    else        { el.textContent = target; delete _counterTimers[id]; }
  }
  _counterTimers[id] = requestAnimationFrame(step);
}

function _updateHUD(stories) {
  var total   = stories.length;
  var verified= stories.filter(function(s){return s.status==='verified';}).length;
  var pending = stories.filter(function(s){return s.status!=='verified';}).length;
  animateCounter(document.getElementById('stat-total'),    total,    1200);
  animateCounter(document.getElementById('stat-verified'), verified, 1400);
  animateCounter(document.getElementById('stat-pending'),  pending,  1000);
}

// ------------------------------------------------
// Overlay switching
// ------------------------------------------------
function switchOverlay(mode) {
  currentOverlay = mode;
  document.querySelectorAll('.overlay-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  _refreshColors();
}

// ------------------------------------------------
// Country filter badge
// ------------------------------------------------
function _showFilterBadge(name) {
  var badge = document.getElementById('country-filter-badge');
  var label = document.getElementById('country-filter-label');
  if (label) label.textContent = name;
  if (badge) badge.classList.add('visible');
}

function clearGlobeFilter() {
  selectedCtry = null;
  var badge = document.getElementById('country-filter-badge');
  if (badge) badge.classList.remove('visible');
  if (typeof window.onClearCountryFilter === 'function') window.onClearCountryFilter();
}


// ------------------------------------------------
// Arc animations (Task 5)
// ------------------------------------------------
var _arcPairs = [
  ['PL','DE'],['UA','GB'],['US','MX'],['JP','KR'],
  ['FR','DE'],['RU','UA'],['CN','US'],['IL','EG']
];

// Country centroid lookup (lat/lng from stories + fallback table)
var _CENTROIDS = {
  PL:{lat:52.2,lng:21.0},DE:{lat:52.5,lng:13.4},UA:{lat:48.4,lng:37.8},
  GB:{lat:51.5,lng:-0.1},US:{lat:38.9,lng:-77.0},MX:{lat:23.6,lng:-102.5},
  JP:{lat:35.7,lng:139.7},KR:{lat:37.6,lng:127.0},FR:{lat:48.8,lng:2.3},
  RU:{lat:55.7,lng:37.6},CN:{lat:39.9,lng:116.4},IL:{lat:31.8,lng:35.2},
  EG:{lat:30.1,lng:31.2},IN:{lat:20.6,lng:78.9},AU:{lat:-25.3,lng:133.8},
  BR:{lat:-15.8,lng:-47.9},CA:{lat:56.1,lng:-106.3},ZA:{lat:-25.7,lng:28.2},
  AR:{lat:-34.6,lng:-58.4},ID:{lat:-7.5,lng:110.4},SA:{lat:24.7,lng:46.7},
  PK:{lat:30.4,lng:71.7},FI:{lat:61.9,lng:25.7},TH:{lat:13.7,lng:100.5},
  NG:{lat:9.1,lng:7.5}
};

var CAT_ARC_COLORS = {
  'War & Conflict':    'rgba(255,68,68,0.75)',
  'Politics':          'rgba(123,47,255,0.75)',
  'Weather & Disaster':'rgba(255,170,0,0.75)',
  'Economy':           'rgba(0,212,255,0.75)',
  'Science & Tech':    'rgba(0,255,136,0.75)',
  'Health':            'rgba(255,105,180,0.75)',
  'Elections':         'rgba(68,136,255,0.75)',
  'Environment':       'rgba(68,255,136,0.75)'
};

function updateStoryArcs(stories) {
  if (!globeInst) return;
  // Build centroid map from stories
  stories.forEach(function(s) {
    if (s.country_code && s.lat != null && s.lng != null) {
      _CENTROIDS[s.country_code] = { lat: +s.lat, lng: +s.lng };
    }
  });
  // Breaking stories drive arcs
  var breaking = stories.filter(function(s){ return s.is_breaking; }).slice(0, 8);
  var arcs = [];
  breaking.forEach(function(src) {
    var sc = src.country_code;
    if (!sc || !_CENTROIDS[sc]) return;
    // Find pair partner
    var partner = null;
    for (var i = 0; i < _arcPairs.length; i++) {
      if (_arcPairs[i][0] === sc && _CENTROIDS[_arcPairs[i][1]]) { partner = _arcPairs[i][1]; break; }
      if (_arcPairs[i][1] === sc && _CENTROIDS[_arcPairs[i][0]]) { partner = _arcPairs[i][0]; break; }
    }
    // Fallback: pair with first other breaking story country
    if (!partner) {
      var other = breaking.find(function(s){ return s.country_code !== sc && _CENTROIDS[s.country_code]; });
      if (other) partner = other.country_code;
    }
    if (!partner) return;
    arcs.push({
      startLat: _CENTROIDS[sc].lat,
      startLng: _CENTROIDS[sc].lng,
      endLat:   _CENTROIDS[partner].lat,
      endLng:   _CENTROIDS[partner].lng,
      color:    CAT_ARC_COLORS[src.category] || 'rgba(0,212,255,0.7)',
      label:    src.headline
    });
  });
  globeInst
    .arcsData(arcs)
    .arcStartLat(function(d){ return d.startLat; })
    .arcStartLng(function(d){ return d.startLng; })
    .arcEndLat(function(d){ return d.endLat; })
    .arcEndLng(function(d){ return d.endLng; })
    .arcColor(function(d){ return [d.color, d.color]; })
    .arcStroke(0.4)
    .arcDashLength(0.4)
    .arcDashGap(0.2)
    .arcDashAnimateTime(1500)
    .arcAltitudeAutoScale(0.35)
    .arcLabel(function(d){
      return '<div style="background:rgba(13,17,23,0.92);border:1px solid rgba(0,212,255,0.2);border-radius:8px;padding:6px 10px;font-family:Inter,sans-serif;font-size:11px;color:#e8eaf0;max-width:200px">' + d.label + '</div>';
    });
}

// ------------------------------------------------
// Public API
// ------------------------------------------------
window.GlobeAPI = {
  init:                          initDashboardGlobe,
  updatePins:                    updateStoryPins,
  updateCountryStatsFromStories: updateCountryStatsFromStories,
  updateArcs:                    updateStoryArcs,
  switchOverlay:                 switchOverlay,
  clearFilter:                   clearGlobeFilter,
  getInstance:                   function() { return globeInst; }
};
