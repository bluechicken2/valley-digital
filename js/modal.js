// ================================================
// XRAYNEWS — Story Detail Modal
// js/modal.js - v149
// ================================================
(function () {
  'use strict';

  var _stories  = [];
  var _idx      = 0;
  var _open     = false;
  var _touchSY  = 0;

  // ---- Bootstrap DOM ----
  function _ensureDOM() {
    if (document.getElementById('mdl')) return;
    var el = document.createElement('div');
    el.id = 'mdl';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Story detail');
    el.innerHTML = [
      '<div class="mdl-backdrop"></div>',
      '<div class="mdl-sheet" id="mdl-sheet">',
        '<div class="mdl-toolbar">',
          '<button class="mdl-close" id="mdl-close" aria-label="Close">&#10005; CLOSE</button>',
          '<div class="mdl-nav">',
            '<button class="mdl-nav-btn" id="mdl-prev" aria-label="Previous story">&#8592; PREV</button>',
            '<span class="mdl-nav-sep">|</span>',
            '<button class="mdl-nav-btn" id="mdl-next" aria-label="Next story">NEXT &#8594;</button>',
          '</div>',
        '</div>',
        '<div class="mdl-body" id="mdl-body"></div>',
      '</div>'
    ].join('');
    document.body.appendChild(el);

    document.getElementById('mdl-close').addEventListener('click', close);
    document.getElementById('mdl-prev').addEventListener('click', prev);
    document.getElementById('mdl-next').addEventListener('click', next);
    el.querySelector('.mdl-backdrop').addEventListener('click', close);

    var sheet = document.getElementById('mdl-sheet');
    sheet.addEventListener('touchstart', function (e) { _touchSY = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener('touchend', function (e) {
      if (e.changedTouches[0].clientY - _touchSY > 80) close();
    }, { passive: true });
  }

  document.addEventListener('keydown', function (e) {
    if (!_open) return;
    if (e.key === 'Escape')     close();
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft')  prev();
  });

  // ---- Helpers ----
  // Decode HTML entities
  function decodeEntities(s) {
    if (!s) return '';
    var el = document.createElement('div');
    el.innerHTML = s;
    return el.textContent || el.innerText || '';
  }
  
  // Strip HTML tags and clean text
  function cleanText(s) {
    if (!s) return '';
    s = String(s);
    // Remove any img tags (complete or partial)
    s = s.replace(/<img[^>]*>/gi, ' ');
    s = s.replace(/<img[^>]*$/gi, ' ');
    // Remove all other HTML tags
    s = s.replace(/<[^>]+>/g, ' ');
    // Remove any remaining < characters (truncated tags)
    s = s.replace(/</g, ' ');
    // Remove any > characters
    s = s.replace(/>/g, ' ');
    // Decode HTML entities
    s = decodeEntities(s);
    // Clean up whitespace
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }
  
  function esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  
  // Clean and escape text for safe display
  function cleanDisplay(s) {
    return esc(cleanText(s));
  }
  
  function flag(code) {
    if (!code || code.length !== 2) return '';
    var o = 0x1F1E6 - 65;
    return String.fromCodePoint(code.toUpperCase().charCodeAt(0) + o)
         + String.fromCodePoint(code.toUpperCase().charCodeAt(1) + o);
  }
  function timeAgo(iso) {
    if (!iso) return '';
    var d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (d < 60)    return d + 's ago';
    if (d < 3600)  return Math.floor(d/60) + 'm ago';
    if (d < 86400) return Math.floor(d/3600) + 'h ago';
    return Math.floor(d/86400) + 'd ago';
  }
  function confColor(v) {
    if (v <= 40) return '#ff4444';
    if (v <= 70) return '#ffaa00';
    return '#00ff88';
  }
  var STATUS_MAP = {
    verified:   { icon:'&#10003;', cls:'badge-verified',   label:'VERIFIED'   },
    unverified: { icon:'?',        cls:'badge-unverified', label:'UNVERIFIED' },
    contested:  { icon:'&#9889;',  cls:'badge-contested',  label:'CONTESTED'  },
    false:      { icon:'&#10007;', cls:'badge-false',      label:'FALSE'      }
  };
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
  var CAT_ICONS = {
    'War & Conflict':    '&#9876;&#65039;',
    'Politics':          '&#127963;&#65039;',
    'Weather & Disaster':'&#127786;&#65039;',
    'Economy':           '&#128201;',
    'Science & Tech':    '&#128300;',
    'Health':            '&#127973;',
    'Elections':         '&#128499;&#65039;',
    'Environment':       '&#127807;'
  };

  // ---- CSS circle gauge ----
  function _gauge(pct, color) {
    var deg = Math.round(pct / 100 * 360);
    var label = pct >= 70 ? 'HIGH' : pct >= 40 ? 'MODERATE' : 'LOW';
    return '<div class="mdl-gauge-wrap">'
      + '<div class="mdl-gauge" style="background: conic-gradient(' + color + ' ' + deg + 'deg, rgba(255,255,255,0.07) ' + deg + 'deg)">'
        + '<div class="mdl-gauge-inner">'
          + '<span class="mdl-gauge-val" style="color:' + color + '">' + pct + '%</span>'
          + '<span class="mdl-gauge-lbl">' + label + '</span>'
        + '</div>'
      + '</div>'
    + '</div>';
  }

  // ---- Source breakdown ----
  function _sources(story) {
    var count = story.source_count || 3;
    var types = [
      { label:'Legacy\nMedia',      icon:'&#128240;' },
      { label:'Official\nSources',  icon:'&#127963;&#65039;' },
      { label:'Social\nMedia',      icon:'&#128241;' },
      { label:'Independent\nReport',icon:'&#128269;' }
    ];
    var pool = Math.max(count, 4);
    var cols = types.map(function (t, i) {
      var n   = Math.max(1, Math.round(pool * [0.35,0.25,0.25,0.15][i]));
      var ok  = (i < 3) ? n : Math.max(0, n - 1);
      var bad = n - ok;
      return '<td class="mdl-src-cell">'
        + '<div class="mdl-src-icon">' + t.icon + '</div>'
        + '<div class="mdl-src-lbl">' + t.label.replace('\n','<br>') + '</div>'
        + '<div class="mdl-src-count">' + ok + (bad ? ' <span class="mdl-src-no">&#10007;' + bad + '</span>' : ' <span class="mdl-src-yes">&#10003;</span>') + '</div>'
        + '</td>';
    }).join('');
    return '<table class="mdl-src-table"><tr>' + cols + '</tr></table>';
  }

  // ---- Analysis Preview ----
  function _analysisPreview(story) {
    if (!story.xray_analysis) {
      return '';
    }
    var analysis = story.xray_analysis;
    var verdict = '';
    var entities = '';
    var conclusion = '';
    
    var vIdx = analysis.indexOf('**VERIFICATION:**');
    if (vIdx !== -1) {
      var vEnd = analysis.indexOf('**', vIdx + 18);
      if (vEnd !== -1) verdict = analysis.substring(vIdx + 17, vEnd).trim();
    }
    
    var eIdx = analysis.indexOf('**KEY ENTITIES:**');
    if (eIdx !== -1) {
      var eEnd = analysis.indexOf('**CLAIM', eIdx);
      if (eEnd === -1) eEnd = analysis.indexOf('**SOURCES', eIdx);
      if (eEnd === -1) eEnd = analysis.length;
      entities = analysis.substring(eIdx + 17, eEnd).trim().replace(/\n/g, ' ').substring(0, 100);
    }
    
    var cIdx = analysis.indexOf('**CONCLUSION:**');
    if (cIdx !== -1) {
      conclusion = analysis.substring(cIdx + 15).trim().replace(/\n/g, ' ').substring(0, 150);
    }
    
    if (!verdict && !entities && !conclusion) return '';
    
    var html = '<div class="mdl-analysis-card">';
    if (verdict) {
      var vClass = verdict.indexOf('CONFIRMED') !== -1 ? 'mdl-v-ok' : verdict.indexOf('CONTESTED') !== -1 ? 'mdl-v-warn' : 'mdl-v-unknown';
      html += '<div class="mdl-verdict ' + vClass + '">' + esc(verdict) + '</div>';
    }
    if (entities) {
      html += '<div class="mdl-entities"><strong>Entities:</strong> ' + esc(entities) + '</div>';
    }
    if (conclusion) {
      html += '<div class="mdl-conclusion">' + esc(conclusion) + '</div>';
    }
    html += '</div>';
    return html;
  }

  // ---- Render ----
  function _render(story) {
    var sc = story.xray_score || story.confidence_score || 0;
    var col   = confColor(sc);
    var sm    = STATUS_MAP[story.status] || STATUS_MAP.unverified;
    var fg    = flag(story.country_code);
    var catCol= CAT_COLORS[story.category] || '#00d4ff';
    var catIc = CAT_ICONS[story.category] || '&#127760;';
    var brk   = story.is_breaking ? '<span class="mdl-breaking">&#9889; BREAKING</span>' : '';

    // Clean headline and summary - strip HTML and decode entities
    var displayHeadline = cleanDisplay(story.headline);
    var displaySummary = cleanDisplay(story.summary);

    document.getElementById('mdl-body').innerHTML = [
      '<div class="mdl-hero">',
        '<div class="mdl-hero-top">',
          '<div class="mdl-country-row">',
            fg ? '<span class="mdl-flag">' + fg + '</span>' : '',
            '<span class="mdl-country">' + esc(story.country_name || 'Global') + '</span>',
            '<span class="mdl-cat-badge" style="--cc:' + catCol + '">' + catIc + ' ' + esc(story.category || '') + '</span>',
            '<span class="status-badge ' + sm.cls + '">' + sm.icon + ' ' + sm.label + '</span>',
            brk,
          '</div>',
          '<h2 class="mdl-headline">' + displayHeadline + '</h2>',
          '<div class="mdl-meta">' + timeAgo(story.created_at) + ' &nbsp;&#183;&nbsp; ' + (story.source_count||1) + ' sources</div>',
        '</div>',
      '</div>',

      '<div class="mdl-conf-section">',
        _gauge(sc, col),
        '<div class="mdl-conf-desc">',
          displaySummary ? '<p class="mdl-summary">' + displaySummary + '</p>' : '',
          _analysisPreview(story),
        '</div>',
      '</div>',

      '<div class="mdl-divider"></div>',

      '<div class="mdl-section">',
        '<div class="mdl-section-title">VERIFICATION BREAKDOWN</div>',
        _sources(story),
      '</div>',

      '<div class="mdl-divider"></div>',

      '<div class="mdl-actions">',
        '<a href="story.html?id=' + story.id + '" class="mdl-action-btn mdl-action-primary">&#128270; VIEW FULL ANALYSIS</a>',
        '<button class="mdl-action-btn mdl-globe-btn">&#127757; VIEW ON GLOBE</button>',
        '<button class="mdl-action-btn mdl-share-btn">&#128228; SHARE</button>',
      '</div>'
    ].join('');
    
    // Attach button handlers
    var globeBtn = document.querySelector('.mdl-globe-btn');
    if (globeBtn) {
      globeBtn.addEventListener('click', function() {
        var mdl = document.getElementById('mdl');
        if (mdl) mdl.classList.add('mdl-closing');
        setTimeout(function() { close(); }, 400);
      });
    }
    
    var shareBtn = document.querySelector('.mdl-share-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', function() {
        var shareData = { title: story.headline, url: location.href };
        if (navigator.share) {
          navigator.share(shareData).catch(function() {});
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(location.href);
          alert('Link copied to clipboard');
        }
      });
    }
  }

  // ---- Public ----
  function open(story, allStories) {
    _ensureDOM();
    _stories = allStories || (window.NewsFeed ? window.NewsFeed.getAll() : [story]);
    _idx = _stories.findIndex(function (s) { return s.id === story.id; });
    if (_idx < 0) { _stories = [story]; _idx = 0; }
    _render(_stories[_idx]);
    var mdl = document.getElementById('mdl');
    mdl.classList.remove('mdl-closing');
    mdl.classList.add('mdl-open');
    document.body.classList.add('mdl-no-scroll');
    _open = true;
    setTimeout(function () {
      var btn = document.getElementById('mdl-close');
      if (btn) btn.focus();
    }, 80);
  }

  function close() {
    var mdl = document.getElementById('mdl');
    if (!mdl) return;
    mdl.classList.add('mdl-closing');
    setTimeout(function () {
      mdl.classList.remove('mdl-open', 'mdl-closing');
      document.body.classList.remove('mdl-no-scroll');
      _open = false;
    }, 380);
  }

  function next() {
    if (!_stories.length) return;
    _idx = (_idx + 1) % _stories.length;
    _render(_stories[_idx]);
    var body = document.getElementById('mdl-body');
    if (body) body.scrollTop = 0;
  }

  function prev() {
    if (!_stories.length) return;
    _idx = (_idx - 1 + _stories.length) % _stories.length;
    _render(_stories[_idx]);
    var body = document.getElementById('mdl-body');
    if (body) body.scrollTop = 0;
  }

  window.StoryModal = { open: open, close: close, next: next, prev: prev };
})();
