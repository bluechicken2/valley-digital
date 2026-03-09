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
    if (n <= 1) return { label:'LOW',      bars:1, color:'rgba(140,40,255,0.85)' };  // purple
    if (n <= 4) return { label:'MEDIUM',   bars:3, color:'rgba(255,210,0,0.9)'   };  // yellow
    if (n <= 8) return { label:'HIGH',     bars:5, color:'rgba(255,120,0,0.95)'  };  // orange
    return              { label:'CRITICAL', bars:6, color:'rgba(255,45,45,1)'     };  // red
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
        '<div class="sb-briefing-section" id="sb-briefing-section" style="visibility:hidden;max-height:0;overflow:hidden;">',
          '<div class="sb-briefing-head">',
            '<span class="sb-briefing-icon">&#127760;</span>',
            '<span>DAILY BRIEFING</span>',
          '</div>',
          '<div class="sb-briefing-content" id="sb-briefing-content"></div>',
        '</div>',
        '<div class="sb-divider" id="sb-briefing-divider" style="visibility:hidden;max-height:0;overflow:hidden;"></div>',
        '<div class="sb-stories-title">ACTIVE STORIES</div>',
        '<div class="sb-list" id="sb-list"></div>',
        '<div class="sb-foot" id="sb-foot"></div>',
      '</div>'
    ].join('');
    document.body.appendChild(el);
    document.getElementById('sb-close').addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      close();
    });
    document.getElementById('sb-overlay').addEventListener('click', function(e) {
      e.preventDefault();
      close();
    });

  }

  function _miniCard(story) {
    var sm   = STATUS_MAP[story.status] || STATUS_MAP.unverified;
    var sc   = story.confidence_score || 0;
    var col  = confColor(sc);
    var catC = CAT_COLORS[story.category] || '#00d4ff';
    
    // Thread badge
    var threadBadgeHtml = '';
    if (story.story_thread_id) {
      threadBadgeHtml = '<span class="sb-thread-badge" title="Part of thread">&#129521;</span>';
    }

    // Social badge (Reddit or Twitter/X)
    var socialBadgeHtml = '';
    if (story.source_type === 'social') {
      if (story.twitter_author) {
        // Twitter/X source
        socialBadgeHtml = '<span class="sb-social-badge sb-twitter-badge" title="From X/Twitter">&#120143; ' + esc(story.twitter_author) + '</span>';
      } else if (story.reddit_score > 0) {
        // Reddit source with score
        var scoreText = story.reddit_score >= 1000 ? (story.reddit_score/1000).toFixed(1) + 'k' : story.reddit_score;
        socialBadgeHtml = '<span class="sb-social-badge sb-reddit-badge" title="From Reddit">&#127760; Reddit &#8226; ' + scoreText + '</span>';
      } else {
        // Generic social source
        socialBadgeHtml = '<span class="sb-social-badge" title="Social media source">&#127760; Social</span>';
      }
    }
    
    return '<div class="sb-card" data-id="' + esc(story.id) + '" tabindex="0" role="button" aria-label="' + esc(story.headline) + '">'
      + '<div class="sb-card-top">'
        + '<span class="sb-cat" style="border-color:' + catC + ';color:' + catC + '">' + esc(story.category||'') + '</span>'
        + (story.is_breaking ? '<span class="sb-brk">&#9889; BREAKING</span>' : '')
        + threadBadgeHtml
        + socialBadgeHtml
      + '</div>'
      + '<div class="sb-card-hl">' + esc(story.headline) + '</div>'
      + '<div class="sb-card-foot">'
        + '<span style="color:' + col + ';font-weight:700;font-size:12px">' + sc + '%</span>'
        + '<div class="sb-score-bar-track"><div class="sb-score-bar-fill" style="width:' + Math.round(sc) + '%;background:' + col + '"></div></div>'
        + '<span class="status-badge ' + sm.cls + '" style="font-size:9px;padding:2px 6px">' + sm.icon + ' ' + sm.label + '</span>'
        + '<span class="sb-age">' + timeAgo(story.created_at) + '</span>'
        + '<span class="sb-srcs">&#128225; ' + (story.source_count||1) + '</span>'
      + '</div>'
    + '</div>';
  }

  // Fetch briefing from Supabase
  async function _fetchBriefing(countryCode) {
    var today = new Date().toISOString().split('T')[0];
    var url = window.XrayNewsDB 
      ? window.XrayNewsDB.getUrl() + '/rest/v1/country_briefings?select=*&country_code=eq.' + countryCode + '&briefing_date=eq.' + today
      : null;
    
    if (!url) return null;
    
    try {
      var resp = await fetch(url, {
        headers: {
          'apikey': window.XrayNewsDB.getKey(),
          'Authorization': 'Bearer ' + window.XrayNewsDB.getKey()
        }
      });
      var data = await resp.json();
      return data && data.length > 0 ? data[0] : null;
    } catch(e) {
      console.warn('Could not fetch briefing:', e);
      return null;
    }
  }

  // Render briefing content
  function _renderBriefing(briefing, countryName) {
    if (!briefing) return '';
    
    var summaryHtml = esc(briefing.summary || 'No summary available');
    summaryHtml = summaryHtml.replace(/\n/g, '<br>');
    
    return '<div class="sb-briefing-inner">'
      + '<div class="sb-briefing-date">' + briefing.briefing_date + '</div>'
      + '<div class="sb-briefing-stats">'
        + '<span class="sb-briefing-stat">&#128240; ' + briefing.story_count + ' stories</span>'
        + (briefing.top_story_id ? '<a href="story.html?id=' + briefing.top_story_id + '" class="sb-briefing-top">View Top Story &#8594;</a>' : '')
      + '</div>'
      + '<div class="sb-briefing-summary">' + summaryHtml + '</div>'
    + '</div>';
  }

  async function open(countryCode, countryName, stories) {
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

    // Fetch and display briefing
    var briefingSection = document.getElementById('sb-briefing-section');
    var briefingDivider = document.getElementById('sb-briefing-divider');
    var briefingContent = document.getElementById('sb-briefing-content');
    
    // Use visibility instead of display to prevent layout reflow that causes sidebar shift
    if (briefingSection && briefingContent) {
      briefingContent.innerHTML = '<div class="sb-briefing-loading">Loading briefing...</div>';
      briefingSection.style.visibility = 'visible';
      briefingSection.style.maxHeight = '500px';
      briefingDivider.style.visibility = 'visible';
      
      var briefing = await _fetchBriefing(countryCode);
      
      if (briefing) {
        briefingContent.innerHTML = _renderBriefing(briefing, countryName);
      } else {
        briefingSection.style.visibility = 'hidden';
        briefingSection.style.maxHeight = '0';
        briefingDivider.style.visibility = 'hidden';
      }
    }

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
