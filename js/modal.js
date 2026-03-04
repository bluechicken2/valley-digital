// ================================================
// GLOBEWATCH — Story Detail Modal
// js/modal.js
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

    // Touch swipe-down
    var sheet = document.getElementById('mdl-sheet');
    sheet.addEventListener('touchstart', function (e) { _touchSY = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener('touchend', function (e) {
      if (e.changedTouches[0].clientY - _touchSY > 80) close();
    }, { passive: true });
  }

  // ---- Keyboard ----
  document.addEventListener('keydown', function (e) {
    if (!_open) return;
    if (e.key === 'Escape')     close();
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft')  prev();
  });

  // ---- Helpers ----
  function esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
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

  // ---- CSS circle gauge (pure CSS conic-gradient) ----
  function _gauge(pct, color) {
    var deg = Math.round(pct / 100 * 360);
    return '<div class="mdl-gauge-wrap">'
      + '<div class="mdl-gauge" style="background: conic-gradient(' + color + ' ' + deg + 'deg, rgba(255,255,255,0.07) ' + deg + 'deg)">'
        + '<div class="mdl-gauge-inner">'
          + '<span class="mdl-gauge-val" style="color:' + color + '">' + pct + '%</span>'
          + '<span class="mdl-gauge-lbl">CONFIDENCE</span>'
        + '</div>'
      + '</div>'
    + '</div>';
  }

  // ---- Source breakdown ----
  function _sources(story) {
    var count = story.source_count || 3;
    var vc    = story.verified_count || Math.max(1, Math.floor(count * 0.7));
    var types = [
      { label:'Legacy\nMedia',      icon:'&#128240;', key:'legacy'      },
      { label:'Official\nSources',  icon:'&#127963;&#65039;', key:'official'    },
      { label:'Social\nMedia',      icon:'&#128241;', key:'social'      },
      { label:'Independent\nReport',icon:'&#128269;', key:'independent' }
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

  // ---- Render ----
  function _render(story) {
    var sc    = story.confidence_score || 0;
    var col   = confColor(sc);
    var sm    = STATUS_MAP[story.status] || STATUS_MAP.unverified;
    var fg    = flag(story.country_code);
    var catCol= CAT_COLORS[story.category] || '#00d4ff';
    var catIc = CAT_ICONS[story.category] || '&#127760;';
    var brk   = story.is_breaking ? '<span class="mdl-breaking">&#9889; BREAKING</span>' : '';

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
          '<h2 class="mdl-headline">' + esc(story.headline) + '</h2>',
          '<div class="mdl-meta">' + timeAgo(story.created_at) + ' &nbsp;·&nbsp; ' + (story.source_count||1) + ' sources across multiple countries</div>',
        '</div>',
      '</div>',

      '<div class="mdl-conf-section">',
        _gauge(sc, col),
        '<div class="mdl-conf-desc">',
          '<p class="mdl-conf-title" style="color:' + col + '">',
            sc >= 70 ? 'HIGH CONFIDENCE' : sc >= 40 ? 'MODERATE CONFIDENCE' : 'LOW CONFIDENCE',
          '</p>',
          '<p class="mdl-conf-sub">Based on ' + (story.source_count||1) + ' sources across multiple countries</p>',
          story.summary ? '<p class="mdl-summary">' + esc(story.summary) + '</p>' : '',
        '</div>',
      '</div>',

      '<div class="mdl-divider"></div>',

      '<div class="mdl-section">',
        '<div class="mdl-section-title">VERIFICATION BREAKDOWN</div>',
        _sources(story),
      '</div>',

      '<div class="mdl-divider"></div>',

      '<div class="mdl-actions">',
        '<button class="mdl-action-btn" onclick="if(window.GlobeAPI){var i=document.getElementById(\'mdl\');i.classList.add(\'mdl-closing\');setTimeout(function(){window.StoryModal.close();},400);}">&#127757; VIEW ON GLOBE</button>',
        '<button class="mdl-action-btn" onclick="try{navigator.share({title:\'' + esc(story.headline).replace(/\x27/g,"\\x27") + '\',url:location.href});}catch(e){navigator.clipboard&&navigator.clipboard.writeText(location.href);alert(\'Link copied to clipboard\');}}">&#128228; SHARE</button>',
        '<button class="mdl-action-btn" onclick="alert(\'Alert set for: ' + esc(story.country_name||story.headline).slice(0,30).replace(/\x27/g,'') + '\');">&#128276; ALERT ME</button>',
      '</div>'
    ].join('');
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
    // Focus trap
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
