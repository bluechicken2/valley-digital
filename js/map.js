// ================================================
// XRAYNEWS — Flat 2D Leaflet Map (v10)
// window.GlobeAPI is 100% interface-compatible
// ================================================
(function () {

  var mapInstance  = null;
  var markerLayer  = null;
  var borderLayer  = null;
  var _allStories  = [];  // cache for country click sidebar

  var CAT_COLORS = {
    'War & Conflict':     '#ff4444',
    'Politics':           '#a855f7',
    'Weather & Disaster': '#f59e0b',
    'Economy':            '#00d4ff',
    'Science & Tech':     '#00ff88',
    'Health':             '#f472b6',
    'Elections':          '#818cf8',
    'Environment':        '#34d399'
  };

  function storyColor(story) {
    if (story.breaking || story.is_breaking) return '#ffffff';
    return CAT_COLORS[story.category] || '#00d4ff';
  }

  function makePinIcon(color, radius, isBreaking) {
    var size = radius * 2 + 16;
    var half = size / 2;
    var glow = isBreaking ? 6 : 3;
    var pulse = isBreaking ? ' class="map-pin-pulse"' : '';
    var html = '<div' + pulse + ' style="width:' + size + 'px;height:' + size + 'px">'
      + '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '">'
      + '<defs><filter id="g"><feGaussianBlur stdDeviation="' + glow + '"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'
      + '<circle cx="' + half + '" cy="' + half + '" r="' + (radius+3) + '" fill="' + color + '" opacity="0.18"/>'
      + '<circle cx="' + half + '" cy="' + half + '" r="' + radius + '" fill="' + color + '" filter="url(#g)" opacity="0.92"/>'
      + '</svg></div>';
    return L.divIcon({
      html: html,
      className: '',
      iconSize:    [size, size],
      iconAnchor:  [half, half],
      tooltipAnchor: [half + 4, 0]
    });
  }

  function initDashboardMap() {
    var el = document.getElementById('globe-container');
    if (!el || typeof L === 'undefined') {
      console.warn('[Map] Leaflet or container not ready');
      return;
    }
    if (mapInstance) return;

    mapInstance = L.map('globe-container', {
      center:             [20, 0],
      zoom:               2,
      minZoom:            1,
      maxZoom:            10,
      zoomSnap:           0.1,
      zoomDelta:          0.5,
      zoomControl:        false,
      scrollWheelZoom:    true,
      worldCopyJump:      false,
      maxBounds:          [[-85,-220],[85,220]],
      maxBoundsViscosity: 0.7,
      attributionControl: false
    });

    // Layer 1: Dark base tiles (no labels)
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
      { subdomains:'abcd', maxZoom:10, updateWhenZooming:false, keepBuffer:3 }
    ).addTo(mapInstance);

    // Layer 2: English labels on top
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
      { subdomains:'abcd', maxZoom:10, updateWhenZooming:false }
    ).addTo(mapInstance);

    // Layer 3: Marker layer
    markerLayer = L.layerGroup().addTo(mapInstance);

    // Layer 4: Country borders from GeoJSON (behind markers)
    fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson')
      .then(function(r){ return r.json(); })
      .then(function(data){
        borderLayer = L.geoJSON(data, {
          style: function(feature) {
            return {
              color:       '#00bfff',
              weight:      0.8,
              opacity:     0.4,
              fillOpacity: 0,
              fillColor:   '#00bfff'
            };
          },
          onEachFeature: function(feature, layer) {
            layer.on({
              mouseover: function(e) {
                e.target.setStyle({ weight: 1.8, opacity: 0.9, fillOpacity: 0.05 });
              },
              mouseout: function(e) {
                borderLayer.resetStyle(e.target);
              },
              click: function(e) {
                var props = feature.properties || {};
                var code  = props.ISO_A2 || props.ADM0_A3 || '';
                var name  = props.ADMIN || props.NAME || props.NAME_EN || code;
                if (!code || !name) return;
                // Filter stories for this country
                var countryStories = _allStories.filter(function(s) {
                  return (s.country_code || '').toUpperCase() === code.toUpperCase();
                });
                if (window.CountrySidebar) {
                  window.CountrySidebar.open(code, name, countryStories);
                }
              }
            });
          }
        });
        borderLayer.addTo(mapInstance);
        borderLayer.bringToBack();
      })
      .catch(function(e){ console.warn('[Map] Borders failed:', e.message); });

    // Zoom controls
    L.control.zoom({ position:'bottomright' }).addTo(mapInstance);

    // Fill container
    mapInstance.fitWorld({ animate:false });
    mapInstance.options.minZoom = mapInstance.getZoom();

    // Force dark background
    var dark = '#080b12';
    mapInstance.getContainer().style.background = dark;
    ['tilePane','shadowPane','overlayPane','markerPane','tooltipPane','popupPane'].forEach(function(p){
      try { mapInstance.getPane(p).style.background = dark; } catch(e){}
    });

    // Hide loaders
    ['globe-spinner','globe-placeholder'].forEach(function(id){
      var el2 = document.getElementById(id);
      if (el2) el2.style.display = 'none';
    });
    if (window.Loader) window.Loader.hide();

    console.log('[Map] Leaflet 2D map ready — v10 (glowing pins, borders, labels)');
  }

  function renderMarkers(stories) {
    if (!mapInstance) initDashboardMap();
    if (!markerLayer) return;
    markerLayer.clearLayers();

    stories.forEach(function(story){
      var lat = parseFloat(story.lat);
      var lng = parseFloat(story.lng);
      if ((!lat && !lng) || isNaN(lat) || isNaN(lng)) return;

      var isBreaking = story.breaking || story.is_breaking;
      var color  = storyColor(story);
      var score  = story.xray_score || story.confidence_score || 50;
      var radius = isBreaking ? 10 : score >= 80 ? 8 : score >= 60 ? 6 : 4;

      var marker = L.marker([lat, lng], {
        icon: makePinIcon(color, radius, isBreaking),
        zIndexOffset: isBreaking ? 1000 : score
      });

      var cat      = story.category || 'News';
      var title    = (story.title || story.headline || '').substring(0, 100);
      var country  = story.country_name || story.country_code || '';
      var score    = story.xray_score || story.confidence_score || null;
      var scoreBar = '';
      if (score) {
        var barColor = score >= 80 ? '#00ff88' : score >= 60 ? '#f59e0b' : '#ff4444';
        scoreBar = '<div class="map-tip-score">'
          + '<span class="map-tip-score-label">TRUTH</span>'
          + '<div class="map-tip-score-track"><div class="map-tip-score-fill" style="width:' + score + '%;background:' + barColor + '"></div></div>'
          + '<span class="map-tip-score-val" style="color:' + barColor + '">' + score + '</span>'
          + '</div>';
      }
      var tipHtml = '<div class="map-tip">'
        + '<div class="map-tip-header">'
        + '<span class="map-tip-cat" style="color:' + color + ';border-color:' + color + '">' + (isBreaking ? '⚡ BREAKING' : cat.toUpperCase()) + '</span>'
        + (country ? '<span class="map-tip-country">' + country + '</span>' : '')
        + '</div>'
        + '<div class="map-tip-title">' + title + (title.length >= 100 ? '…' : '') + '</div>'
        + scoreBar
        + '<div class="map-tip-cta">Click to read →</div>'
        + '</div>';
      marker.bindTooltip(tipHtml, {
        sticky: true,
        opacity: 1,
        className: 'map-tip-wrapper',
        offset: [14, 0]
      });

      marker.on('click', function(){
        if (story.id) window.location.href = 'story.html?id=' + story.id;
      });

      markerLayer.addLayer(marker);
    });

    if (borderLayer) borderLayer.bringToBack();
  }

  function updateHUD(stories) {
    var total    = stories.length;
    var verified = stories.filter(function(s){ return s.is_verified || s.status==='verified'; }).length;
    var pending  = total - verified;
    function setEl(id,val){ var e=document.getElementById(id); if(e) e.textContent=val; }
    setEl('hud-total',    total);
    setEl('hud-verified', verified);
    setEl('hud-pending',  pending);
  }

  window.GlobeAPI = {
    init: function(containerId, fn){ initDashboardMap(); },
    getInstance: function(){ return mapInstance; },
    updatePins: function(stories){
      if (!mapInstance) initDashboardMap();
      _allStories = stories || [];  // populate cache for country sidebar
      renderMarkers(_allStories);
    },
    updateCountryStatsFromStories: function(stories){ updateHUD(stories||[]); },
    clearFilter: function() {
      if (borderLayer) {
        borderLayer.eachLayer(function(l) { borderLayer.resetStyle(l); });
      }
    },
    filterByCountry: function(code) {
      // Highlight matching country border
      if (borderLayer) {
        borderLayer.eachLayer(function(l) {
          var c = (l.feature && l.feature.properties && l.feature.properties.ISO_A2) || '';
          if (c.toUpperCase() === (code||'').toUpperCase()) {
            l.setStyle({ weight: 2.5, opacity: 1, fillOpacity: 0.08 });
          } else {
            borderLayer.resetStyle(l);
          }
        });
      }
    },
    updateArcs:      function(){},
    switchOverlay:   function(){}
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboardMap);
  } else {
    initDashboardMap();
  }

}());
