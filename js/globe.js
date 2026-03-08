// ================================================
// XRAYNEWS - Globe.gl Engine v3 — pins-only cinematic mode
// ================================================

var GEOJSON_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
var EARTH_IMG   = 'https://unpkg.com/three-globe/example/img/earth-night.jpg';

var globeInst      = null;
var countryMap     = {};
var currentOverlay = 'all';
var selectedCtry   = null;
var geoData        = null;

// ---- Spin state ----
var spinEnabled    = true;
var spinResumeTimer= null;

function pauseSpin() {
  if (!globeInst) return;
  try { globeInst.controls().autoRotate = false; } catch(e) {}
  clearTimeout(spinResumeTimer);
}
function resumeSpin() {
  if (!globeInst || !spinEnabled) return;
  try { globeInst.controls().autoRotate = true; } catch(e) {}
}
function scheduleSpinResume() {
  clearTimeout(spinResumeTimer);
  if (spinEnabled) spinResumeTimer = setTimeout(resumeSpin, 30000);
}

// ------------------------------------------------
// Overlay colour schemes
// ------------------------------------------------
// Glowing border colors based on activity
var STROKE_COLORS = {
  all: function(heat) {
    if (heat === 0) return 'rgba(0,150,180,0.15)';
    if (heat < 3) return 'rgba(0,200,220,0.45)';
    if (heat < 8) return 'rgba(0,220,255,0.65)';
    return 'rgba(100,240,255,0.90)';  // Bright cyan glow for hot zones
  },
  density: function(heat) {
    if (heat === 0) return 'rgba(80,120,180,0.12)';
    if (heat < 3) return 'rgba(100,150,200,0.40)';
    if (heat < 8) return 'rgba(120,180,230,0.60)';
    return 'rgba(150,200,255,0.85)';
  },
  conflicts: function(heat) {
    if (heat === 0) return 'rgba(180,80,80,0.12)';
    if (heat < 3) return 'rgba(220,100,100,0.45)';
    if (heat < 8) return 'rgba(255,120,120,0.65)';
    return 'rgba(255,150,150,0.90)';  // Bright red glow
  },
  weather: function(heat) {
    if (heat === 0) return 'rgba(80,150,120,0.12)';
    if (heat < 3) return 'rgba(100,200,150,0.40)';
    if (heat < 8) return 'rgba(120,230,180,0.60)';
    return 'rgba(150,255,200,0.85)';  // Bright green glow
  },
  elections: function(heat) {
    if (heat === 0) return 'rgba(100,50,150,0.12)';
    if (heat < 3) return 'rgba(140,70,200,0.40)';
    if (heat < 8) return 'rgba(180,100,255,0.60)';
    return 'rgba(200,140,255,0.85)';  // Bright purple glow
  }
};var OVERLAYS = {
  all: function() { return 'rgba(0,0,0,0)'; },
  density: function() { return 'rgba(0,0,0,0)'; },
  conflicts: function() { return 'rgba(0,0,0,0)'; },
  weather: function() { return 'rgba(0,0,0,0)'; },
  elections: function() { return 'rgba(0,0,0,0)'; }
};

function getCapColor(feat) {
  var code = (feat.properties && feat.properties.ISO_A2) || '';
  var heat = (countryMap[code] && countryMap[code].story_count) || 0;
  return (OVERLAYS[currentOverlay] || OVERLAYS.all)(heat, code);
}
function getSideColor(feat) {
  return 'rgba(0,0,0,0)';  // Transparent sides
}
function getStrokeColor(feat) {
  var code = (feat.properties && feat.properties.ISO_A2) || '';
  var heat = (countryMap[code] && countryMap[code].story_count) || 0;
  return (STROKE_COLORS[currentOverlay] || STROKE_COLORS.all)(heat);
}
function getAltitude(feat) {
  var code = (feat.properties && feat.properties.ISO_A2) || '';
  var heat = (countryMap[code] && countryMap[code].story_count) || 0;
  return 0.001 + Math.min(heat/20, 1) * 0.01;
}

// ------------------------------------------------
// Tooltip follow mouse
// ------------------------------------------------
document.addEventListener('mousemove', function(e) {
  var t = document.getElementById('globe-tooltip');
  if (t && t.classList.contains('visible')) {
    t.style.left = (e.clientX + 14) + 'px';
    t.style.top  = (e.clientY - 10) + 'px';
  }
});

// ------------------------------------------------
// Init globe
// ------------------------------------------------
function initDashboardGlobe(containerId, onCountryClick) {
  var el = document.getElementById(containerId);
  if (!el || typeof Globe === 'undefined') {
    console.warn('[Globe] container or Globe.gl not ready');
    return null;
  }

  function _doInit() {
    try {
      var rect = el.getBoundingClientRect();
      var w = Math.max(rect.width  || el.clientWidth  || window.innerWidth,  300);
      var h = Math.max(rect.height || el.clientHeight || window.innerHeight, 400);

      var g = Globe()
        .width(w)
        .height(h)
        .backgroundColor('rgba(0,0,0,0)')
        .atmosphereColor('rgba(0,150,255,0.13)')
        .atmosphereAltitude(0.22)
        .globeImageUrl(EARTH_IMG);

      g(el);
      globeInst = g;

      // Controls
      var ctrl = g.controls();
      ctrl.autoRotate      = true;
      ctrl.autoRotateSpeed = 0.18;
      ctrl.enableDamping   = true;
      ctrl.dampingFactor   = 0.08;
      ctrl.minDistance     = 160;
      ctrl.maxDistance     = 620;

      // Fix render quality on high-DPI screens
      try {
        var renderer = g.renderer();
        if (renderer && renderer.setPixelRatio) {
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
          // Set canvas z-index ABOVE moon (z-index:2) so earth sphere occludes moon naturally
          // WebGL bg is transparent so stars/moon show through the empty space around earth
          if (renderer.domElement) renderer.domElement.style.zIndex = '4';
        }
      } catch(e) { console.warn('[Globe] pixelRatio fix failed:', e.message); }

      // Pause spin on user interaction
      ['pointerdown','wheel','touchstart'].forEach(function(evt) {
        el.addEventListener(evt, function() {
          pauseSpin();
          scheduleSpinResume();
        }, { passive: true });
      });

      // Hide loading placeholder
      var placeholder = document.getElementById('globe-placeholder');
      if (placeholder) placeholder.style.display = 'none';

      // Wire spin toggle button NOW (globe is ready)
      _wireSpinBtn();

      // Init space elements
      setTimeout(_initSpaceElements, 800);

      // Load GeoJSON
      fetch(GEOJSON_URL)
        .then(function(r) { return r.json(); })
        .then(function(data) { geoData = data; _applyPolygons(g, data, onCountryClick); })
        .catch(function(e) { console.warn('[Globe] GeoJSON failed:', e.message); });

      // Resize observer
      var ro = new ResizeObserver(function() {
        var r = el.getBoundingClientRect();
        g.width(Math.max(r.width,300)).height(Math.max(r.height,400));
      });
      ro.observe(el);

    } catch(err) {
      console.error('[Globe] Init failed:', err);
      el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(0,212,255,0.5);flex-direction:column;gap:12px"><span style="font-size:48px">&#127758;</span><span style="font-family:Orbitron,sans-serif;font-size:11px;letter-spacing:.08em">GLOBE UNAVAILABLE</span></div>';
    }
  }

  requestAnimationFrame(function() { setTimeout(_doInit, 50); });
  return true;
}

// ---- Wire spin button (called once globe is ready) ----
function _wireSpinBtn() {
  var btn = document.getElementById('spin-toggle-btn');
  if (!btn || btn._xrayWired) return;
  btn._xrayWired = true;
  btn.addEventListener('click', function() {
    spinEnabled = !spinEnabled;
    if (spinEnabled) {
      btn.classList.remove('spin-off');
      resumeSpin();
    } else {
      btn.classList.add('spin-off');
      pauseSpin();
      clearTimeout(spinResumeTimer);
    }
  });
}

function _applyPolygons(g, geoJson, onCountryClick) {
  g.polygonsData(geoJson.features)
   .polygonCapColor(function() { return 'rgba(0,0,0,0)'; })
   .polygonSideColor(function() { return 'rgba(0,0,0,0)'; })
   .polygonAltitude(0.001)
   .polygonStrokeColor(function() { return 'rgba(0,212,255,0.06)'; })
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
  var validStories = stories.filter(function(s) {
    return s.lat != null && s.lng != null && (s.lat !== 0 || s.lng !== 0);
  });

  // --- Pins ---
  var pins = validStories.map(function(s) {
    var catColor = CAT_COLORS[s.category] || '#00d4ff';
    var size = s.is_breaking         ? 0.90
             : s.xray_score >= 80   ? 0.65
             : s.xray_score >= 60   ? 0.50
             : s.confidence_score >= 71 ? 0.55
             : s.confidence_score >= 41 ? 0.40
             : 0.28;
    return {
      id:    s.id,
      lat:   +s.lat,
      lng:   +s.lng,
      size:  size,
      color: s.is_breaking ? '#ffffff' : catColor,
      label: s.headline,
      cat:   s.category || ''
    };
  });

  // Custom point rendering with glow
  globeInst
    .pointsData(pins)
    .pointLat(function(d)    { return d.lat; })
    .pointLng(function(d)    { return d.lng; })
    .pointColor(function(d)  {
      // Add inner glow effect - lighter center
      var c = d.color;
      return c;
    })
    .pointAltitude(0.015)
    .pointRadius(function(d) { return d.size * 1.1; })
    .pointResolution(64)
    .pointsMerge(true)
    .pointLabel(function(d) {
      var cc = CAT_COLORS[d.cat] || '#00d4ff';
      return '<div style="background:rgba(8,11,18,0.95);border:1px solid ' + cc + '40;'  +
             'border-radius:8px;padding:7px 11px;font-family:Inter,sans-serif;font-size:12px;'  +
             'color:#e8eaf0;max-width:240px;line-height:1.45;box-shadow:0 4px 20px rgba(0,0,0,0.6)">'  +
             d.label + '</div>';
    });

  // --- Glow rings for ALL pins (premium look) ---
  var glowRings = validStories.map(function(s) {
    var catColor = CAT_COLORS[s.category] || '#00d4ff';
    return {
      lat:              +s.lat,
      lng:              +s.lng,
      maxR:             s.is_breaking ? 4.0 : 2.0,  // Larger for breaking
      propagationSpeed: s.is_breaking ? 2.0 : 0.5,  // Faster for breaking
      repeatPeriod:     s.is_breaking ? 700 : 2500, // More frequent for breaking
      color:            s.is_breaking ? '#ffffff' : catColor,
      isBreaking:       s.is_breaking
    };
  });

  globeInst
    .ringsData(glowRings)
    .ringLat(function(d)              { return d.lat; })
    .ringLng(function(d)              { return d.lng; })
    .ringMaxRadius(function(d)        { return d.maxR; })
    .ringPropagationSpeed(function(d) { return d.propagationSpeed; })
    .ringRepeatPeriod(function(d)     { return d.repeatPeriod; })
    .ringColor(function(d) {
      var hex = d.color;
      return function(t) {
        // Smooth fade with more visible glow
        var alpha = d.isBreaking 
          ? Math.round((1 - t) * 220).toString(16).padStart(2, '0')
          : Math.round((1 - t) * 100).toString(16).padStart(2, '0');
        return hex + alpha;
      };
    });
}

// ------------------------------------------------
// Heat map + HUD
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
  checkSpaceStories(stories);
}

function _refreshColors() {
  if (!globeInst || !geoData) return;
  // Glowing borders mode — subtle fill with bright borders
  globeInst
    .polygonCapColor(getCapColor)
    .polygonSideColor(getSideColor)
    .polygonStrokeColor(getStrokeColor)
    .polygonAltitude(getAltitude);
}

// ------------------------------------------------
// Animated counter
// ------------------------------------------------
var _counterTimers = {};
function animateCounter(el, target, duration) {
  if (!el) return;
  duration = duration || 1200;
  var id = el.id || Math.random().toString(36);
  if (_counterTimers[id]) cancelAnimationFrame(_counterTimers[id]);
  var start = parseInt(el.textContent, 10) || 0;
  var delta = target - start;
  var t0 = null;
  function step(ts) {
    if (!t0) t0 = ts;
    var p = Math.min((ts - t0) / duration, 1);
    var e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(start + delta * e);
    if (p < 1) { _counterTimers[id] = requestAnimationFrame(step); }
    else { el.textContent = target; delete _counterTimers[id]; }
  }
  _counterTimers[id] = requestAnimationFrame(step);
}

function _updateHUD(stories) {
  var total    = stories.length;
  var verified = stories.filter(function(s){return s.status==='verified';}).length;
  var pending  = stories.filter(function(s){return s.status!=='verified';}).length;
  animateCounter(document.getElementById('hud-total'),    total,    1200);
  animateCounter(document.getElementById('hud-verified'), verified, 1400);
  animateCounter(document.getElementById('hud-pending'),  pending,  1000);
}

// ------------------------------------------------
// Overlay switching
// ------------------------------------------------
function switchOverlay(mode) {
  currentOverlay = mode;
  document.querySelectorAll('.overlay-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  if (!globeInst) return;
  // Conflicts/elections: flat polygons (no altitude extrusion — avoids fuzzy
  // edge artifacts on large countries like Russia, USA, Canada, China)
  if (mode === 'conflicts' || mode === 'elections') {
    globeInst.polygonAltitude(0.001);
    globeInst.polygonSideColor(function() { return 'rgba(0,0,0,0)'; });
  } else if (mode === 'all' || mode === 'density' || mode === 'weather') {
    globeInst.polygonAltitude(getAltitude);
    globeInst.polygonSideColor(getSideColor);
  }
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
// Arc animations
// ------------------------------------------------
var _arcPairs = [
  ['PL','DE'],['UA','GB'],['US','MX'],['JP','KR'],
  ['FR','DE'],['RU','UA'],['CN','US'],['IL','IR'],['IL','LB']
];
var _CENTROIDS = {
  PL:{lat:52.2,lng:21.0}, DE:{lat:52.5,lng:13.4}, UA:{lat:48.4,lng:37.8},
  GB:{lat:51.5,lng:-0.1}, US:{lat:38.9,lng:-77.0}, MX:{lat:23.6,lng:-102.5},
  JP:{lat:35.7,lng:139.7},KR:{lat:37.6,lng:127.0}, FR:{lat:48.8,lng:2.3},
  RU:{lat:55.7,lng:37.6}, CN:{lat:39.9,lng:116.4}, IL:{lat:31.8,lng:35.2},
  EG:{lat:30.1,lng:31.2}, IN:{lat:20.6,lng:78.9},  AU:{lat:-25.3,lng:133.8},
  BR:{lat:-15.8,lng:-47.9},CA:{lat:56.1,lng:-106.3},ZA:{lat:-25.7,lng:28.2},
  AR:{lat:-34.6,lng:-58.4},ID:{lat:-7.5,lng:110.4}, SA:{lat:24.7,lng:46.7},
  PK:{lat:30.4,lng:71.7}, FI:{lat:61.9,lng:25.7},  TH:{lat:13.7,lng:100.5},
  NG:{lat:9.1,lng:7.5},   IR:{lat:35.7,lng:51.4},  LB:{lat:33.9,lng:35.5},
  SY:{lat:34.8,lng:38.9}, IQ:{lat:33.3,lng:44.4},  TR:{lat:39.9,lng:32.9},
  UA:{lat:48.4,lng:31.2}, PS:{lat:31.9,lng:35.3}
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
  stories.forEach(function(s) {
    if (s.country_code && s.lat != null && s.lng != null && (s.lat !== 0 || s.lng !== 0)) {
      _CENTROIDS[s.country_code] = { lat: +s.lat, lng: +s.lng };
    }
  });
  var breaking = stories.filter(function(s){ return s.is_breaking; }).slice(0, 8);
  var arcs = [];
  breaking.forEach(function(src) {
    var sc = src.country_code;
    if (!sc || !_CENTROIDS[sc]) return;
    var partner = null;
    for (var i = 0; i < _arcPairs.length; i++) {
      if (_arcPairs[i][0] === sc && _CENTROIDS[_arcPairs[i][1]]) { partner = _arcPairs[i][1]; break; }
      if (_arcPairs[i][1] === sc && _CENTROIDS[_arcPairs[i][0]]) { partner = _arcPairs[i][0]; break; }
    }
    if (!partner) {
      var other = breaking.find(function(s){ return s.country_code !== sc && _CENTROIDS[s.country_code]; });
      if (other) partner = other.country_code;
    }
    if (!partner) return;
    arcs.push({
      startLat: _CENTROIDS[sc].lat, startLng: _CENTROIDS[sc].lng,
      endLat:   _CENTROIDS[partner].lat, endLng: _CENTROIDS[partner].lng,
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


// ================================================
// Moon + Satellite + Starfield v2
// ================================================
var _satAnimId  = null;
var _satStart   = null;
var _moonFloat  = null;
var _outlineMode    = false;
var _moonMaxOpacity = 0.55;  // updated by checkSpaceStories

var SAT_ORBITS = [
  { rx: 0.42, ry: 0.15, speed: 0.000082, phase: 0.0,  tilt: -18 },
  { rx: 0.36, ry: 0.25, speed: 0.000051, phase: 2.09, tilt:  38 },
  { rx: 0.46, ry: 0.12, speed: 0.000115, phase: 4.19, tilt:  -9 }
];

// ---- Starfield on body (behind everything) ----
function _initBodyStarfield() {
  // Remove any old body-level starfield
  var old = document.getElementById('xray-starfield');
  if (old && old.parentNode !== document.querySelector('.globe-section')) old.remove();

  var section = document.querySelector('.globe-section');
  if (!section) return;
  if (document.getElementById('xray-starfield')) return;

  var canvas = document.createElement('canvas');
  canvas.id = 'xray-starfield';
  canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;';
  section.insertBefore(canvas, section.firstChild);

  function draw() {
    canvas.width  = section.offsetWidth  || window.innerWidth;
    canvas.height = section.offsetHeight || window.innerHeight;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 180 stars of varying sizes and brightness
    for (var i = 0; i < 180; i++) {
      var x = Math.random() * canvas.width;
      var y = Math.random() * canvas.height;
      var r = Math.random() < 0.15 ? (Math.random() * 1.8 + 0.8) : (Math.random() * 0.9 + 0.2);
      var a = Math.random() * 0.75 + 0.15;
      var rand = Math.random();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      if (rand > 0.96)       ctx.fillStyle = 'rgba(0,212,255,'  + a + ')';
      else if (rand > 0.92)  ctx.fillStyle = 'rgba(180,130,255,'+ a + ')';
      else if (rand > 0.89)  ctx.fillStyle = 'rgba(255,220,180,'+ a + ')';
      else                   ctx.fillStyle = 'rgba(255,255,255,'+ a + ')';
      ctx.fill();
      // Tiny cross-spike on larger stars
      if (r > 1.2) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.4) + ')';
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(x-r*2.5,y); ctx.lineTo(x+r*2.5,y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x,y-r*2.5); ctx.lineTo(x,y+r*2.5); ctx.stroke();
      }
    }
  }
  draw();
  var _sfRszT;
  window.addEventListener('resize', function() { clearTimeout(_sfRszT); _sfRszT = setTimeout(draw, 200); });
}

// ---- Canvas-rendered realistic Moon ----
function _drawMoon(canvas, active) {
  var ctx = canvas.getContext('2d');
  var s = canvas.width;
  var cx = s / 2, cy = s / 2, r = s / 2 - 2;
  ctx.clearRect(0, 0, s, s);

  // Base sphere — off-axis light source upper-left
  var base = ctx.createRadialGradient(cx - r*0.28, cy - r*0.28, r*0.04, cx, cy, r);
  base.addColorStop(0.0,  '#f2ede4');
  base.addColorStop(0.25, '#d8d2c6');
  base.addColorStop(0.55, '#a89e94');
  base.addColorStop(0.80, '#706560');
  base.addColorStop(1.0,  '#1a1814');
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = base; ctx.fill();

  // Mare (dark plains) — subtle ellipses
  var mares = [
    {ox:-0.05, oy:-0.08, rx:0.28, ry:0.22, a:0.30},
    {ox: 0.18, oy: 0.10, rx:0.16, ry:0.13, a:0.25},
    {ox:-0.18, oy: 0.18, rx:0.12, ry:0.09, a:0.22}
  ];
  mares.forEach(function(m) {
    ctx.save();
    ctx.translate(cx + m.ox*r*1.6, cy + m.oy*r*1.6);
    ctx.scale(m.rx * r, m.ry * r);
    var mg = ctx.createRadialGradient(0,0,0,0,0,1);
    mg.addColorStop(0,   'rgba(30,26,22,' + m.a + ')');
    mg.addColorStop(0.7, 'rgba(30,26,22,' + (m.a*0.6) + ')');
    mg.addColorStop(1,   'rgba(30,26,22,0)');
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI*2);
    ctx.fillStyle = mg; ctx.fill();
    ctx.restore();
  });

  // Craters — rim highlight + dark floor
  [
    [0.30, 0.26, 0.075], [0.62, 0.32, 0.055],
    [0.44, 0.66, 0.085], [0.70, 0.55, 0.042],
    [0.20, 0.52, 0.062], [0.55, 0.72, 0.038]
  ].forEach(function(c) {
    var px = cx + (c[0]-0.5)*1.7*r;
    var py = cy + (c[1]-0.5)*1.7*r;
    var cr = c[2] * r;
    if (Math.sqrt((px-cx)*(px-cx)+(py-cy)*(py-cy)) + cr > r*0.93) return;
    // Shadow (lower-right)
    ctx.beginPath(); ctx.arc(px+cr*0.15, py+cr*0.15, cr, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill();
    // Floor
    ctx.beginPath(); ctx.arc(px, py, cr*0.72, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.20)'; ctx.fill();
    // Rim highlight (upper-left)
    ctx.beginPath(); ctx.arc(px-cr*0.18, py-cr*0.18, cr, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1; ctx.stroke();
  });

  // Terminator (day/night boundary)
  var term = ctx.createLinearGradient(cx - r*0.4, cy, cx + r, cy);
  term.addColorStop(0,    'rgba(0,0,0,0)');
  term.addColorStop(0.58, 'rgba(0,0,0,0)');
  term.addColorStop(0.80, 'rgba(0,0,0,0.50)');
  term.addColorStop(1,    'rgba(0,0,0,0.88)');
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = term; ctx.fill();

  // Atmosphere halo (when active)
  if (active) {
    var halo = ctx.createRadialGradient(cx, cy, r*0.85, cx, cy, r*1.22);
    halo.addColorStop(0, 'rgba(210,205,190,0)');
    halo.addColorStop(0.5, 'rgba(210,205,190,0.14)');
    halo.addColorStop(1, 'rgba(210,205,190,0)');
    ctx.beginPath(); ctx.arc(cx, cy, r*1.22, 0, Math.PI*2);
    ctx.fillStyle = halo; ctx.fill();
  }
}


// ---- Moon zoom tracking ----
var _initialCamDist = null;

function _updateMoonPosition() {
  if (!globeInst) return;
  try {
    var cam = globeInst.camera();
    var section = document.querySelector('.globe-section');
    var wrap = document.getElementById('globe-moon-wrap');
    if (!cam || !section || !wrap) return;

    var pos = cam.position;
    var dist = Math.sqrt(pos.x*pos.x + pos.y*pos.y + pos.z*pos.z);
    if (!_initialCamDist || _initialCamDist < 50) _initialCamDist = dist;

    // zoomRatio: 1=default, >1=zoomed out, <1=zoomed in
    var zoomRatio = dist / _initialCamDist;

    var w = section.offsetWidth  || 800;
    var h = section.offsetHeight || 500;
    var cx = w * 0.5;
    var cy = h * 0.5;

    // Orbit radius scales WITH zoom — moon stays proportional to apparent earth size
    var baseOrbit   = Math.min(w, h) * 0.37;
    var scaledOrbit = baseOrbit * Math.max(0.4, Math.min(2.5, zoomRatio));
    // HARD MINIMUM: moon always stays outside earth radius + padding
    var earthRadiusPx = Math.min(w, h) * 0.36;  // approximate rendered earth radius in px
    var minOrbit      = earthRadiusPx + 55;      // earth edge + moon radius + gap
    var orbitPx       = Math.max(minOrbit, scaledOrbit);
    var moonSize  = 54;
    var angle     = -0.65; // upper-right (radians)

    var mx = cx + Math.cos(angle) * orbitPx;
    var my = cy + Math.sin(angle) * orbitPx;

    wrap.style.position = 'absolute';
    wrap.style.right    = 'auto';
    wrap.style.left     = (mx - moonSize / 2) + 'px';
    wrap.style.top      = (my - moonSize / 2) + 'px';
  } catch(e) {}
}
function _initSpaceElements() {
  var section = document.querySelector('.globe-section');
  if (!section) return;
  section.style.overflow = 'visible';

  _initBodyStarfield();

  if (document.getElementById('globe-moon-wrap')) return;

  // Moon wrapper (for float animation)
  var wrap = document.createElement('div');
  wrap.id    = 'globe-moon-wrap';
  wrap.style.cssText = 'position:absolute;top:10%;right:10%;width:54px;height:54px;pointer-events:none;z-index:2;animation:moonFloat 7s ease-in-out infinite;';

  // Moon canvas
  var mc = document.createElement('canvas');
  mc.id     = 'globe-moon';
  mc.width  = mc.height = 108; // 2x for retina
  mc.style.cssText = 'width:54px;height:54px;opacity:0.55;transition:opacity 1.4s ease,filter 1.4s ease;border-radius:50%;box-shadow:0 0 10px rgba(180,170,150,0.08);';
  _drawMoon(mc, false);
  wrap.appendChild(mc);
  section.appendChild(wrap);

  // Satellites
  SAT_ORBITS.forEach(function(_, i) {
    var sat = document.createElement('div');
    sat.className = 'globe-satellite';
    sat.id        = 'globe-sat-' + i;
    sat.title     = 'Satellite ' + (i+1);
    section.appendChild(sat);
  });

  _animateSatellites();
  _animateMoonFloat();
  _startMoonOcclusionLoop(); // start moon-behind-earth occlusion check

  // Moon tracks zoom/pan
  try {
    var ctrl = globeInst.controls();
    if (ctrl) {
      ctrl.addEventListener('change', _updateMoonPosition);
      _updateMoonPosition(); // set initial position
    }
  } catch(e) {}

  // console.log('[Globe] Space elements v2 initialized');
}

function _animateMoonFloat() {
  // Subtle vertical drift
  var wrap = document.getElementById('globe-moon-wrap');
  if (!wrap) return;
  // CSS keyframe handles it — just ensure the keyframe is injected
  if (!document.getElementById('moonFloatStyle')) {
    var s = document.createElement('style');
    s.id = 'moonFloatStyle';
    s.textContent = '@keyframes moonFloat{0%,100%{transform:translateY(0) rotate(-2deg);}50%{transform:translateY(-9px) rotate(2deg);}}';
    document.head.appendChild(s);
  }
}

function _animateSatellites() {
  var section = document.querySelector('.globe-section');
  if (!section) return;
  if (_satAnimId) cancelAnimationFrame(_satAnimId);

  function tick(ts) {
    if (!_satStart) _satStart = ts;
    var elapsed = ts - _satStart;
    var w  = section.offsetWidth  || 800;
    var h  = section.offsetHeight || 500;
    var cx = w * 0.5;
    var cy = h * 0.5;
    SAT_ORBITS.forEach(function(o, i) {
      var sat = document.getElementById('globe-sat-' + i);
      if (!sat) return;
      var angle   = elapsed * o.speed + o.phase;
      var tiltRad = o.tilt * Math.PI / 180;
      var x0 = Math.cos(angle) * o.rx * w;
      var y0 = Math.sin(angle) * o.ry * h;
      var x  = x0 * Math.cos(tiltRad) - y0 * Math.sin(tiltRad);
      var y  = x0 * Math.sin(tiltRad) + y0 * Math.cos(tiltRad);
      sat.style.left = (cx + x - 5) + 'px';
      sat.style.top  = (cy + y - 5) + 'px';
    });
    _satAnimId = requestAnimationFrame(tick);
  }
  _satAnimId = requestAnimationFrame(tick);
}

function checkSpaceStories(stories) {
  var MOON_KW = ['moon','lunar','artemis','moonshot','moon mission','moon landing','crescent','selene'];
  var SAT_KW  = ['satellite','spacex',' iss ','space station','orbit','rocket launch',
                 'space launch','starlink','nasa','space debris','spacecraft','space probe',
                 'space telescope','hubble','james webb','rocket','launch vehicle'];
  var hasMoon = stories.some(function(s) {
    var t = ((s.headline||'')+' '+(s.summary||'')).toLowerCase();
    return MOON_KW.some(function(k){ return t.indexOf(k) !== -1; });
  });
  var hasSat = stories.some(function(s) {
    var t = ((s.headline||'')+' '+(s.summary||'')).toLowerCase();
    return SAT_KW.some(function(k){ return t.indexOf(k) !== -1; });
  });
  var mc = document.getElementById('globe-moon');
  if (mc) {
    _moonMaxOpacity = hasMoon ? 0.92 : 0.55;  // occlusion loop reads this
    mc.style.filter  = hasMoon ? 'drop-shadow(0 0 14px rgba(220,210,175,0.7)) drop-shadow(0 0 30px rgba(200,190,150,0.4))' : 'none';
    _drawMoon(mc, hasMoon);
  }
  document.querySelectorAll('.globe-satellite').forEach(function(s){
    s.classList.toggle('sat-active', hasSat);
  });
}

// ---- Outline mode toggle ----
// Outline mode toggle — opacity-based (texture stays loaded, no network request)
  // already declared above, this is the toggle function only

function toggleOutlineMode() {
  _outlineMode = !_outlineMode;
  if (!globeInst) return _outlineMode;

  var mat = null;
  try { mat = globeInst.globeMaterial(); } catch(e) {}

  if (_outlineMode) {
    // SEE-THROUGH mode: hide sphere via opacity=0, show country outlines
    // Texture stays loaded — restore is instant (just set opacity back to 1)
    if (mat) {
      mat.transparent = true;
      mat.opacity = 0;
      mat.needsUpdate = true;
    }
    globeInst.atmosphereAltitude(0.01);
    globeInst.atmosphereColor('rgba(0,212,255,0.08)');
    globeInst.polygonStrokeColor(function() { return 'rgba(0,212,255,0.95)'; });
    globeInst.polygonCapColor(function()    { return 'rgba(0,212,255,0.04)'; });
    globeInst.polygonSideColor(function()   { return 'rgba(0,212,255,0.12)'; });
    globeInst.polygonAltitude(0.004);
  } else {
    // SAT IMAGERY mode: restore opaque sphere — instant, no reload
    if (mat) {
      mat.transparent = false;
      mat.opacity = 1;
      mat.needsUpdate = true;
    }
    globeInst.atmosphereAltitude(0.22);
    globeInst.atmosphereColor('rgba(0,150,255,0.13)');
    globeInst.polygonStrokeColor(function() { return 'rgba(0,212,255,0.06)'; });
    globeInst.polygonCapColor(function() { return 'rgba(0,0,0,0)'; });
    globeInst.polygonSideColor(function() { return 'rgba(0,0,0,0)'; });
    globeInst.polygonAltitude(0.001);
  }

  var btn = document.getElementById('outline-mode-btn');
  if (btn) btn.classList.toggle('active', _outlineMode);
  return _outlineMode;
}









// ---- Moon occlusion: hide moon when earth is in front (JS camera-based) ----
var _moonOcclusionId = null;
function _startMoonOcclusionLoop() {
  if (_moonOcclusionId) return; // already running
  function _tick() {
    _moonOcclusionId = requestAnimationFrame(_tick);
    if (!globeInst) return;
    var wrap = document.getElementById('globe-moon-wrap');
    if (!wrap) return;
    var el  = document.getElementById('globe-container');
    if (!el)  return;
    var rect     = el.getBoundingClientRect();
    var earthCX  = rect.left + rect.width  / 2;
    var earthCY  = rect.top  + rect.height / 2;
    // Compute earth apparent radius in screen px using Three.js camera
    var earthR = Math.min(rect.width, rect.height) * 0.40; // fallback ~40%
    try {
      var cam  = globeInst.camera();
      var dist = cam.position.length();
      var fovR = (cam.fov * Math.PI / 180) / 2;
      var screenH = rect.height / 2;
      // Globe radius in world units is 100 (globe.gl default)
      earthR = (100 / dist / Math.tan(fovR)) * screenH;
      earthR = Math.max(30, Math.min(earthR, rect.height * 0.48));
    } catch(e) {}
    // Moon screen center
    var mRect = wrap.getBoundingClientRect();
    var moonCX = mRect.left + mRect.width  / 2;
    var moonCY = mRect.top  + mRect.height / 2;
    var moonR  = mRect.width / 2;
    var dx     = moonCX - earthCX;
    var dy     = moonCY - earthCY;
    var screenDist = Math.sqrt(dx * dx + dy * dy);
    // Fade zone: start fading when moon edge approaches earth edge
    var fadeStart = earthR - moonR * 0.5;
    var fadeEnd   = earthR + moonR * 0.5;
    var targetOp;
    if (screenDist < fadeStart) {
      targetOp = 0;  // fully behind earth
    } else if (screenDist < fadeEnd) {
      targetOp = (screenDist - fadeStart) / (fadeEnd - fadeStart); // fade in
      targetOp = Math.max(0, Math.min(1, targetOp)) * _moonMaxOpacity;
    } else {
      targetOp = _moonMaxOpacity; // respects checkSpaceStories active state
    }
    wrap.style.opacity = String(targetOp);
  }
  _tick();
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
  checkSpaceStories:             checkSpaceStories,
  getInstance:                   function() { return globeInst; },
  toggleSpin: function() {
    spinEnabled = !spinEnabled;
    var btn = document.getElementById('spin-toggle-btn');
    if (spinEnabled) {
      btn && btn.classList.remove('spin-off');
      resumeSpin();
    } else {
      btn && btn.classList.add('spin-off');
      pauseSpin();
      clearTimeout(spinResumeTimer);
    }
    return spinEnabled;
  },
  getSpinState:    function() { return spinEnabled; },
  toggleOutline:   toggleOutlineMode,
  isOutlineMode:   function() { return _outlineMode; }
};
