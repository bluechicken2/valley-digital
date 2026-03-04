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
   .polygonLabel(function(feat) {
      var code = (feat.properties && feat.properties.ISO_A2) || '';
      var name = (feat.properties && (feat.properties.ADMIN || feat.properties.NAME)) || code;
      var heat = (countryMap[code] && countryMap[code].story_count) || 0;
      return '<div style="background:rgba(13,17,23,0.92);border:1px solid rgba(0,212,255,0.22);border-radius:8px;padding:8px 13px;font-family:Inter,sans-serif">'
           + '<div style="font-family:Orbitron,sans-serif;font-size:11px;color:#00d4ff;letter-spacing:.07em">' + name.toUpperCase() + '</div>'
           + '<div style="font-size:11px;color:#8892a4;margin-top:3px">' + heat + ' active ' + (heat===1?'story':'stories') + '</div>'
           + (heat > 0 ? '<div style="font-size:10px;color:#ffaa00;margin-top:2px">' + _heatLabel(heat) + '</div>' : '')
           + '</div>';
   })
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
}

function _refreshColors() {
  if (!globeInst || !geoData) return;
  globeInst.polygonCapColor(getCapColor).polygonSideColor(getSideColor).polygonAltitude(getAltitude);
}

function _updateHUD(stories) {
  var t = document.getElementById('stat-total');
  var v = document.getElementById('stat-verified');
  var p = document.getElementById('stat-pending');
  if (t) t.textContent = stories.length;
  if (v) v.textContent = stories.filter(function(s){return s.status==='verified';}).length;
  if (p) p.textContent = stories.filter(function(s){return s.status!=='verified';}).length;
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
// Public API
// ------------------------------------------------
window.GlobeAPI = {
  init:                          initDashboardGlobe,
  updatePins:                    updateStoryPins,
  updateCountryStatsFromStories: updateCountryStatsFromStories,
  switchOverlay:                 switchOverlay,
  clearFilter:                   clearGlobeFilter,
  getInstance:                   function() { return globeInst; }
};
