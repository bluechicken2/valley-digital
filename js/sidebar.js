// ================================================
// XRAYNEWS — Country Sidebar
// js/sidebar.js
// ================================================
(function () {
  'use strict';

  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function flag(code) {
    if (!code || code.length !== 2) return '';
    var o = 0x1F1E6 - 65;
    return String.fromCodePoint(code.toUpperCase().charCodeAt(0)+o)
         + String.fromCodePoint(code.toUpperCase().charCodeAt(1)+o);
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
  var CAT_COLORS = {
    'War & Conflict':'#ff4444','Politics':'#7b2fff','Weather & Disaster':'#ffaa00',
    'Economy':'#00d4ff','Science & Tech':'#00ff88','Health':'#ff69b4',
    'Elections':'#4488ff','Environment':'#44ff88'
  };
  var STATUS_MAP = {
    verified:{icon:'&#10003;',cls:'badge-verified',label:'VERIFIED'},
    unverified:{icon:'?',cls:'badge-unverified',label:'UNVERIFIED'},
    contested:{icon:'&#9889;',cls:'badge-contested',label:'CONTESTED'},
    false:{icon:'&#10007;',cls:'badge-false',label:'FALSE'}
  };

  function _activityLabel(n) {
    if (n <= 1) return { label:'LOW',     bars:1, color:'rgba(0,212,255,0.6)'  };
    if (n <= 4) return { label:'MEDIUM',  bars:3, color:'rgba(123,47,255,0.8)' };
    if (n <= 8) return { label:'HIGH',    bars:5, color:'rgba(255,170,0,0.9)'  };
    return              { label:'CRITICAL',bars:6, color:'rgba(255,68,68,1)'    };
  }

  function _ensure() {
    if (document.getElementById('sb')) return;
    var el = document.createElement('div');
    el.id = 'sb';
    el.setAttribute('role', 'complementary');
    el.setAttribute('aria-label', 'Country detail');
    el.innerHTML = [
      '<div class="sb-overlay" id="sb-overlay"></div>',
      '<div class="sb-panel" id="sb-panel">',
        '<div class="sb-head">',
          '<div class="sb-head-info">',
            '<span class="sb-flag" id="sb-flag"></span>',
            '<div>',
              '<div class="sb-name" id="sb-name"></div>',
              '<div class="sb-sub"  id="sb-sub"></div>',
            '</div>',
          '</div>',
          '<button class="sb-close" id="sb-close" aria-label="Close sidebar">&#10005;</button>',
        '</div>',
        '<div class="sb-act" id="sb-act"></div>',
        '<div class="sb-divider"></div>',
        '<div class="sb-stories-title">ACTIVE STORIES</div>',
        '<div class="sb-list" id="sb-list"></div>',
        '<div class="sb-foot" id="sb-foot"></div>',
      '</div>'
    ].join('');
    document.body.appendChild(el);
    document.getElementById('sb-close').addEventListener('click', close);
    document.getElementById('sb-overlay').addEventListener('click', close);
  }

  function _miniCard(story) {
    var sm   = STATUS_MAP[story.status] || STATUS_MAP.unverified;
    var sc   = story.confidence_score || 0;
    var col  = confColor(sc);
    var catC = CAT_COLORS[story.category] || '#00d4ff';
    var dots = '';
    for (var i = 0; i < 5; i++) dots += '<span class="sb-dot' + (sc/20 > i ? ' sb-dot-on' : '') + '"></span>';
    return '<div class="sb-card" data-id="' + esc(story.id) + '" tabindex="0" role="button" aria-label="' + esc(story.headline) + '">'
      + '<div class="sb-card-top">'
        + '<span class="sb-cat" style="border-color:' + catC + ';color:' + catC + '">' + esc(story.category||'') + '</span>'
        + (story.is_breaking ? '<span class="sb-brk">&#9889; BREAKING</span>' : '')
      + '</div>'
      + '<div class="sb-card-hl">' + esc(story.headline) + '</div>'
      + '<div class="sb-card-foot">'
        + '<span style="color:' + col + ';font-weight:700;font-size:12px">' + sc + '%</span>'
        + '<span class="sb-dots">' + dots + '</span>'
        + '<span class="status-badge ' + sm.cls + '" style="font-size:9px;padding:2px 6px">' + sm.icon + ' ' + sm.label + '</span>'
        + '<span class="sb-age">' + timeAgo(story.created_at) + '</span>'
        + '<span class="sb-srcs">&#128225; ' + (story.source_count||1) + '</span>'
      + '</div>'
    + '</div>';
  }

  function open(countryCode, countryName, stories) {
    _ensure();
    var fg = flag(countryCode);
    var act = _activityLabel(stories.length);
    var barHtml = '';
    for (var i = 0; i < 6; i++) barHtml += '<div class="sb-bar' + (i < act.bars ? ' sb-bar-on' : '') + '" style="' + (i < act.bars ? 'background:' + act.color : '') + '"></div>';

    document.getElementById('sb-flag').textContent  = fg;
    document.getElementById('sb-name').textContent  = countryName.toUpperCase();
    document.getElementById('sb-sub').textContent   = stories.length + ' active ' + (stories.length===1?'story':'stories');
    document.getElementById('sb-act').innerHTML     = '<div class="sb-act-label">ACTIVITY LEVEL <span style="color:' + act.color + '">' + act.label + '</span></div><div class="sb-act-bars">' + barHtml + '</div>';
    document.getElementById('sb-list').innerHTML    = stories.length
      ? stories.map(_miniCard).join('')
      : '<div class="sb-empty">No active stories for this country.</div>';
    document.getElementById('sb-foot').innerHTML    = stories.length
      ? '<button class="sb-view-all" onclick="window.NewsFeed&&window.NewsFeed.filterByCountry(\'' + esc(countryCode) + '\');window.CountrySidebar.close();">VIEW ALL STORIES FOR ' + esc(countryName.toUpperCase()) + ' &#8594;</button>'
      : '';

    // Attach card clicks
    var list = document.getElementById('sb-list');
    list.querySelectorAll('.sb-card').forEach(function (card) {
      function _open() {
        var id = card.dataset.id;
        var story = stories.find(function(s){return String(s.id)===String(id);});
        if (story && window.StoryModal) window.StoryModal.open(story, stories);
      }
      card.addEventListener('click', _open);
      card.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' '){e.preventDefault();_open();} });
    });

    var sb = document.getElementById('sb');
    sb.classList.add('sb-open');
    document.body.classList.add('sb-body-open');
  }

  function close() {
    var sb = document.getElementById('sb');
    if (sb) sb.classList.remove('sb-open');
    document.body.classList.remove('sb-body-open');
  }

  window.CountrySidebar = { open: open, close: close };
})();
