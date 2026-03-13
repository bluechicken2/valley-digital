// ================================================
// XRAYNEWS — Flat 2D Leaflet Map (v12 - HEAT MAP SINGLE COLOR)
// Countries colored by story density instead of individual pins
// ================================================

(function () {

  var mapInstance  = null;
  var countryLayer = null;
  var borderLayer  = null;
  var _allStories  = [];
  var _countryData = {};  // country_code -> { stories: [], count: number }

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

  // Heat map: single color (cyan) with brightness intensity based on story count
  function getHeatColor(count, maxCount) {
    if (count === 0) return 'rgba(30, 30, 40, 0.15)';
    var ratio = Math.min(count / maxCount, 1);
    // Single cyan color, opacity increases with story count
    // Low: 0.2 opacity, High: 0.85 opacity
    var opacity = 0.2 + (ratio * 0.65);
    return 'rgba(0, 212, 255, ' + opacity + ')';
  }

  function storyColor(story) {
    if (story.breaking || story.is_breaking) return '#ffffff';
    return CAT_COLORS[story.category] || '#00d4ff';
  }

  function initDashboardMap() {
    var el = document.getElementById('globe-container');
    if (!el || typeof L === 'undefined') {
      console.warn('[Map] Leaflet or container not ready');
      return;
    }
    if (mapInstance) return;

    // Clear any text selection on map interactions
    var container = document.getElementById('globe-container');
    if (container) {
      container.addEventListener('mousedown', function(e) {
        if (window.getSelection) {
          var sel = window.getSelection();
          if (sel.rangeCount > 0) sel.removeAllRanges();
        }
      });
      container.addEventListener('click', function(e) {
        if (window.getSelection) {
          var sel = window.getSelection();
          if (sel.rangeCount > 0) sel.removeAllRanges();
        }
      });
    }

    mapInstance = L.map('globe-container', {
      center:             [20, 0],
      zoom:               2,
      minZoom:            2,
      maxZoom:            10,
      zoomSnap:           0.1,
      zoomDelta:          0.5,
      zoomControl:        false,
      scrollWheelZoom:    true,
      worldCopyJump:      false,
      maxBounds:          [[-90,-270],[90,270]],
      attributionControl: false
    });

    // Dark labels only - no base map
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
      { subdomains:'abcd', maxZoom:10, updateWhenZooming:false, noWrap:true, opacity:0.7 }
    ).addTo(mapInstance);

    // Country heat map layer
    countryLayer = L.layerGroup().addTo(mapInstance);

    // Load country borders and apply heat coloring
    fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson')
      .then(function(r){ return r.json(); })
      .then(function(data){
        borderLayer = L.geoJSON(data, {
          style: function(feature) {
            var code = feature.properties.ISO_A2;
            var countryInfo = _countryData[code] || { count: 0 };
            var maxCount = Math.max(...Object.values(_countryData).map(function(c){ return c.count; }), 1);
            return {
              color:       '#00bfff',
              weight:      1,
              opacity:     0.6,
              fillColor:   getHeatColor(countryInfo.count, maxCount),
              fillOpacity: 0.7
            };
          },
          onEachFeature: function(feature, layer) {
            var code = feature.properties.ISO_A2;
            var countryInfo = _countryData[code] || { count: 0 };
            var countryName = feature.properties.NAME || feature.properties.ADMIN || code;
            
            // Hover effect
            layer.on({
              mouseover: function(e) {
                e.target.setStyle({ weight: 2.5, opacity: 1, fillOpacity: 0.85 });
              },
              mouseout: function(e) {
                var maxCount = Math.max(...Object.values(_countryData).map(function(c){ return c.count; }), 1);
                e.target.setStyle({ 
                  weight: 1, 
                  opacity: 0.6, 
                  fillOpacity: 0.7,
                  fillColor: getHeatColor(countryInfo.count, maxCount)
                });
              },
              click: function(e) {
                // Prevent text selection and any browser default behavior
                if (e.originalEvent) {
                  e.originalEvent.preventDefault();
                  e.originalEvent.stopPropagation();
                  e.originalEvent.cancelBubble = true;
                }
                if (e.target) e.target.options = e.target.options || {};
                // Filter stories by this country
                if (countryInfo.count > 0 && countryInfo.stories) {
                  // Update news feed with filtered stories
                  if (window.filterByCountry) {
                    window.filterByCountry(code);
                  }
                  // Show country in sidebar if available
                  if (window.CountrySidebar) {
                    window.CountrySidebar.open(code, countryName, countryInfo.stories);
                  }
                }
              }
            });
            
            // Tooltip showing story count
            if (countryInfo.count > 0) {
              layer.bindTooltip(
                '<div style="text-align:center">'
                + '<strong style="font-size:14px">' + countryName + '</strong><br>'
                + '<span style="color:#00d4ff;font-size:18px;font-weight:bold">' + countryInfo.count + '</span> '
                + '<span style="color:#888">story' + (countryInfo.count !== 1 ? 's' : '') + '</span>'
                + '</div>',
                { direction: 'top', className: 'country-tooltip' }
              );
            }
          }
        }).addTo(countryLayer);
      })
      .catch(function(err){
        console.error('[Map] Failed to load country borders:', err);
      });
  }

  function renderHeatMap(stories) {
    if (!mapInstance) initDashboardMap();
    if (!countryLayer) return;

    // Group stories by country
    _countryData = {};
    stories.forEach(function(story) {
      var code = story.country_code;
      if (!code) return;
      code = code.toUpperCase();
      if (!_countryData[code]) {
        _countryData[code] = { stories: [], count: 0 };
      }
      _countryData[code].stories.push(story);
      _countryData[code].count++;
    });

    // If border layer exists, refresh the styling
    if (borderLayer) {
      borderLayer.eachLayer(function(layer) {
        var code = layer.feature.properties.ISO_A2;
        var countryInfo = _countryData[code] || { count: 0 };
        var maxCount = Math.max(...Object.values(_countryData).map(function(c){ return c.count; }), 1);
        layer.setStyle({
          fillColor: getHeatColor(countryInfo.count, maxCount),
          fillOpacity: 0.7
        });
        
        // Update tooltip
        var countryName = layer.feature.properties.NAME || layer.feature.properties.ADMIN || code;
        if (countryInfo.count > 0) {
          layer.bindTooltip(
            '<div style="text-align:center">'
            + '<strong style="font-size:14px">' + countryName + '</strong><br>'
            + '<span style="color:#00d4ff;font-size:18px;font-weight:bold">' + countryInfo.count + '</span> '
            + '<span style="color:#888">story' + (countryInfo.count !== 1 ? 's' : '') + '</span>'
            + '</div>',
            { direction: 'top', className: 'country-tooltip' }
          );
        }
      });
    }
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
    updatePins: function(stories){
      if (!mapInstance) initDashboardMap();
      _allStories = stories || [];
      renderHeatMap(_allStories);
      updateHUD(_allStories);
    },
    updateCountryStatsFromStories: function(stories){
      // Update HUD with story stats (called by news-feed.js)
      updateHUD(stories || []);
    },
    getStories: function(){ return _allStories; },
    getCountryStories: function(code){
      var info = _countryData[code && code.toUpperCase()];
      return info ? info.stories : [];
    }
  };

})();
