/**
 * XrayNews — Leaflet.js 2D World Map
 * Replaces Globe.gl 3D globe. Flat, pannable, zoomable, dark-themed.
 * v1 — 2026-03-09
 *
 * window.GlobeAPI is 100% interface-compatible with globe.js so that
 * js/news-feed.js and the dashboard inline script work unchanged.
 */

(function () {
  'use strict';

  /* ─── Category colour palette ─────────────────────────────────────────── */
  var CATEGORY_COLORS = {
    'War & Conflict':     '#ff4444',
    'Politics':           '#7b2fff',
    'Weather & Disaster': '#ffaa00',
    'Economy':            '#00d4ff',
    'Science & Tech':     '#00ff88',
    'Health':             '#ff6b9d',
    'Elections':          '#a78bfa',
    'Environment':        '#40e0a0'
  };
  var DEFAULT_COLOR = '#00d4ff';

  /* ─── State ───────────────────────────────────────────────────────── */
  var mapInstance    = null;
  var markersLayer   = null;
  var activeFilter   = null;

  /* ─── Helpers ─────────────────────────────────────────────────────── */
  function darken(hex) {
    hex = hex.replace('#', '');
    var r = Math.max(0, Math.floor(parseInt(hex.slice(0, 2), 16) * 0.55));
    var g = Math.max(0, Math.floor(parseInt(hex.slice(2, 4), 16) * 0.55));
    var b = Math.max(0, Math.floor(parseInt(hex.slice(4, 6), 16) * 0.55));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function storyColor(story) {
    if (story.is_breaking) return '#ffffff';
    return CATEGORY_COLORS[story.category] || DEFAULT_COLOR;
  }

  /* ─── Map initialisation ───────────────────────────────────────────── */
  function initDashboardMap() {
    if (mapInstance) return;   /* guard double-init */

    /* Hide Globe.gl placeholder content */
    var placeholder = document.getElementById('globe-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    mapInstance = L.map('globe-container', {
      center:             [20, 0],
      zoom:               2,
      minZoom:            2,
      maxZoom:            10,
      zoomControl:        false,
      attributionControl: true,
      worldCopyJump:      true
    });

    /* CartoDB Dark Matter tile layer — free, no API key */
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        subdomains:  'abcd',
        maxZoom:     20
      }
    ).addTo(mapInstance);

    /* Zoom controls — bottom-right */
    L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);

    /* Layer group for story markers */
    markersLayer = L.layerGroup().addTo(mapInstance);

    /* Hide loading spinner */
    setTimeout(function () {
      var sp = document.getElementById('globe-spinner');
      if (sp) sp.style.display = 'none';
    }, 1200);

    /* Hide globe spin-toggle button (rotation is globe-only) */
    var spinWrap = document.getElementById('spin-toggle-wrap');
    if (spinWrap) spinWrap.style.display = 'none';
  }

  /* ─── Render story pins ─────────────────────────────────────────────── */
  function renderMarkers(stories) {
    if (!mapInstance) initDashboardMap();
    markersLayer.clearLayers();
    if (!stories || !stories.length) return;

    stories.forEach(function (story) {
      var lat = parseFloat(story.lat);
      var lng = parseFloat(story.lng);
      if (isNaN(lat) || isNaN(lng)) return;
      if (activeFilter && story.country_code !== activeFilter) return;

      var color  = storyColor(story);
      var radius = story.is_breaking ? 9 : 6;

      var marker = L.circleMarker([lat, lng], {
        radius:      radius,
        fillColor:   color,
        fillOpacity: 0.85,
        color:       story.is_breaking ? 'rgba(255,255,255,0.6)' : darken(color),
        weight:      1.5
      });

      /* Dark-themed popup */
      var cat = story.category || 'News';
      var ttl = (story.title   || 'Untitled').substring(0, 120);
      marker.bindPopup(
        '<div class="map-popup">'
          + '<div class="map-popup-category" style="color:' + color + '">' + cat + '</div>'
          + '<div class="map-popup-title">' + ttl + '</div>'
          + '</div>',
        { maxWidth: 280, className: 'xray-popup' }
      );

      /* Click → story detail page */
      marker.on('click', function () {
        if (story.id) window.location.href = 'story.html?id=' + story.id;
      });

      /* Pulsing overlay ring for breaking news */
      if (story.is_breaking) {
        var sz = radius * 2 + 12;
        var pi = L.divIcon({
          className: '',
          html: '<div class="breaking-marker" style="'
              + 'width:' + sz + 'px;height:' + sz + 'px;'
              + 'border-radius:50%;'
              + 'position:absolute;top:50%;left:50%;'
              + 'transform:translate(-50%,-50%);'
              + 'pointer-events:none;"></div>',
          iconSize:   [0, 0],
          iconAnchor: [0, 0]
        });
        L.marker([lat, lng], { icon: pi, interactive: false }).addTo(markersLayer);
      }

      markersLayer.addLayer(marker);
    });
  }

  /* ─── HUD counters ────────────────────────────────────────────────────── */
  function updateHUD(stories) {
    if (!stories) return;
    var total    = stories.length;
    var verified = stories.filter(function (s) { return s.is_verified; }).length;
    var pending  = total - verified;
    var et = document.getElementById('hud-total');
    var ev = document.getElementById('hud-verified');
    var ep = document.getElementById('hud-pending');
    if (et) et.textContent = total;
    if (ev) ev.textContent = verified;
    if (ep) ep.textContent = pending;
  }

  /* ─── Public GlobeAPI ───────────────────────────────────────────────────── */
  /**
   * Interface-compatible with globe.js so news-feed.js and the
   * dashboard inline script work without modification.
   */
  window.GlobeAPI = {

    /** Called by dashboard inline script. Map already inits via DOMContentLoaded. */
    init: function (containerId, onCountryClickFn) {
      initDashboardMap();
    },

    /** Truthy map reference used by instanceof checks in inline script */
    getInstance: function () {
      return mapInstance;
    },

    /** Render story circle-markers on the map */
    updatePins: function (stories) {
      renderMarkers(stories);
    },

    /** Update HUD stat counters */
    updateCountryStatsFromStories: function (stories) {
      updateHUD(stories);
    },

    /** No-op: flight-arc animations are Globe.gl-only */
    updateArcs: function () {},

    /** No-op: heat-map overlay modes are Globe.gl-only */
    switchOverlay: function () {},

    /** No-op: outline toggle is Globe.gl-only */
    toggleOutline: function () {},

    /** Clear active country filter */
    clearFilter: function () {
      activeFilter = null;
    },

    /** Filter pins to a specific country ISO-2 code */
    filterByCountry: function (code) {
      activeFilter = code || null;
    }
  };

  /* ─── Auto-init on DOM ready ─────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboardMap);
  } else {
    initDashboardMap();
  }

  /* Exposed for compatibility with dashboard inline script */
  window.initDashboardMap = initDashboardMap;

}());
