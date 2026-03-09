// ================================================
// XRAYNEWS — Flat 2D Leaflet Map (v2)
// window.GlobeAPI is 100% interface-compatible
// with globe.js so that news-feed.js needs no changes.
// ================================================
(function () {

  var mapInstance  = null;
  var markerLayer  = null;
  var _onCountryClick = null;

  var CAT_COLORS = {
    'War & Conflict':     '#ff4444',
    'Politics':           '#7b2fff',
    'Weather & Disaster': '#ffaa00',
    'Economy':            '#00d4ff',
    'Science & Tech':     '#00ff88',
    'Health':             '#ff6b9d',
    'Elections':          '#a78bfa',
    'Environment':        '#40e0a0'
  };

  function storyColor(story) {
    if (story.breaking || story.is_breaking) return '#ffffff';
    return CAT_COLORS[story.category] || '#00d4ff';
  }

  // ------------------------------------------------
  // Init map
  // ------------------------------------------------
  function initDashboardMap() {
    var el = document.getElementById('globe-container');
    if (!el || typeof L === 'undefined') {
      console.warn('[Map] Leaflet or container not ready');
      return;
    }
    if (mapInstance) return;

    mapInstance = L.map('globe-container', {
      center:              [20, 0],
      zoom:                2,
      minZoom:             1,
      maxZoom:             10,
      zoomSnap:            0.1,
      zoomDelta:           0.5,
      zoomControl:         false,
      scrollWheelZoom:     true,
      worldCopyJump:       false,
      maxBounds:           [[-85, -220], [85, 220]],
      maxBoundsViscosity:  0.7,
      attributionControl:  false
    });

    // fitWorld fills the container with the world
    mapInstance.fitWorld({ animate: false });
    // Lock minZoom so user cannot zoom out past world fill
    mapInstance.options.minZoom = mapInstance.getZoom();

    // Dark no-label tiles (no Chinese, no any-language text)
    // noWrap is NOT set — tiles repeat to fill container at low zoom
    // maxBounds on the map itself controls where the user can pan
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
      {
        subdomains:        'abcd',
        maxZoom:           10,
        updateWhenZooming: false,
        keepBuffer:        3
      }
    ).addTo(mapInstance);

    // Zoom control bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);

    // Init empty marker layer
    markerLayer = L.layerGroup().addTo(mapInstance);

    // Force dark background on ALL map panes directly — defeats Leaflet default white
    var dark = '#080b12';
    mapInstance.getContainer().style.background = dark;
    ['tilePane','shadowPane','overlayPane','markerPane','tooltipPane','popupPane'].forEach(function(p) {
      try { mapInstance.getPane(p).style.background = dark; } catch(e) {}
    });

    // Hide loading overlays
    var spinner = document.getElementById('globe-spinner');
    if (spinner) spinner.style.display = 'none';
    var placeholder = document.getElementById('globe-placeholder');
    if (placeholder) placeholder.style.display = 'none';
    if (window.Loader) window.Loader.hide();

    console.log('[Map] Leaflet 2D map ready — v2 (no labels, no wrap)');
  }

  // ------------------------------------------------
  // Render story markers
  // ------------------------------------------------
  function renderMarkers(stories) {
    if (!mapInstance) initDashboardMap();
    if (!markerLayer) return;
    markerLayer.clearLayers();

    stories.forEach(function (story) {
      var lat = parseFloat(story.lat);
      var lng = parseFloat(story.lng);
      if (!lat && !lng) return;
      if (isNaN(lat) || isNaN(lng)) return;

      var isBreaking = story.breaking || story.is_breaking;
      var color      = storyColor(story);
      var score      = story.xray_score || story.confidence_score || 50;
      var radius     = isBreaking ? 9 : score >= 80 ? 7 : score >= 60 ? 5.5 : 4;

      var marker = L.circleMarker([lat, lng], {
        radius:      radius,
        fillColor:   color,
        fillOpacity: 0.88,
        color:       isBreaking ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.4)',
        weight:      isBreaking ? 2 : 1
      });

      // Tooltip on hover
      var cat   = story.category || 'News';
      var title = (story.title || story.headline || '').substring(0, 90);
      marker.bindTooltip(
        '<div class="map-tooltip">'
          + '<span class="map-tooltip-cat" style="color:' + color + '">' + cat.toUpperCase() + (isBreaking ? ' ⚡' : '') + '</span>'
          + '<div class="map-tooltip-title">' + title + '</div>'
        + '</div>',
        { sticky: true, opacity: 1, className: 'map-tooltip-wrapper', offset: [10, 0] }
      );

      // Click → story page
      marker.on('click', function () {
        if (story.id) {
          window.location.href = 'story.html?id=' + story.id;
        }
      });

      markerLayer.addLayer(marker);
    });
  }

  // ------------------------------------------------
  // HUD update
  // ------------------------------------------------
  function updateHUD(stories) {
    var total    = stories.length;
    var verified = stories.filter(function (s) { return s.is_verified || s.status === 'verified'; }).length;
    var pending  = total - verified;
    var setEl    = function (id, val) {
      var el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setEl('hud-total',    total);
    setEl('hud-verified', verified);
    setEl('hud-pending',  pending);
  }

  // ------------------------------------------------
  // Public API (interface-compatible with globe.js)
  // ------------------------------------------------
  window.GlobeAPI = {

    init: function (containerId, onCountryClickFn) {
      _onCountryClick = onCountryClickFn || null;
      initDashboardMap();
    },

    getInstance: function () { return mapInstance; },

    updatePins: function (stories) {
      if (!mapInstance) initDashboardMap();
      renderMarkers(stories || []);
    },

    updateCountryStatsFromStories: function (stories) {
      updateHUD(stories || []);
    },

    clearFilter:     function () {},
    filterByCountry: function () {},
    updateArcs:      function () {},
    switchOverlay:   function () {}
  };

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboardMap);
  } else {
    initDashboardMap();
  }

}());
