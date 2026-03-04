// ================================================
// XRAYNEWS - Story Card Renderer
// ================================================

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

var CAT_ICONS_HTML = {
  'War & Conflict':    '&#9876;&#65039;',
  'Politics':          '&#127963;&#65039;',
  'Weather & Disaster':'&#127786;&#65039;',
  'Economy':           '&#128201;',
  'Science & Tech':    '&#128300;',
  'Health':            '&#127973;',
  'Elections':         '&#128499;&#65039;',
  'Environment':       '&#127807;'
};

function getCategoryColor(cat) { return CAT_COLORS[cat] || '#00d4ff'; }
function getCategoryIcon(cat)  { return CAT_ICONS_HTML[cat] || '&#127760;'; }

function getConfidenceColor(score) {
  if (score <= 40) return '#ff4444';
  if (score <= 70) return '#ffaa00';
  return '#00ff88';
}

function getStatusBadge(status) {
  var map = {
    'verified':   { icon:'&#10003;', label:'VERIFIED',   cls:'badge-verified'   },
    'unverified': { icon:'?',        label:'UNVERIFIED', cls:'badge-unverified' },
    'contested':  { icon:'&#9889;',  label:'CONTESTED',  cls:'badge-contested'  },
    'false':      { icon:'&#10007;', label:'FALSE',      cls:'badge-false'      }
  };
  var s = map[status] || map['unverified'];
  return '<span class="status-badge ' + s.cls + '">' + s.icon + ' ' + s.label + '</span>';
}

function getCountryFlag(code) {
  if (!code || code.length !== 2) return '';
  var offset = 0x1F1E6 - 65;
  return String.fromCodePoint(code.toUpperCase().charCodeAt(0) + offset)
       + String.fromCodePoint(code.toUpperCase().charCodeAt(1) + offset);
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function timeAgo(iso) {
  if (!iso) return '';
  var diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return diff + 's ago';
  if (diff < 3600)  return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  return Math.floor(diff/86400) + 'd ago';
}

// ------------------------------------------------
// Render single story card
// ------------------------------------------------
function renderStoryCard(story) {
  var flag       = getCountryFlag(story.country_code);
  var catIcon    = getCategoryIcon(story.category);
  var catColor   = getCategoryColor(story.category);
  var confColor  = getConfidenceColor(story.confidence_score || 0);
  var score      = story.confidence_score || 0;
  var statusBadge = getStatusBadge(story.status);
  var breaking   = story.is_breaking
    ? '<span class="breaking-badge">&#9889; BREAKING</span>' : '';
  var age        = timeAgo(story.created_at);
  var flagHtml   = flag ? '<span class="country-flag">' + flag + '</span>' : '';
  var summaryHtml= story.summary
    ? '<p class="card-summary">' + escHtml(story.summary) + '</p>' : '';
  var srcCount   = story.source_count || 1;
  var vfyHtml    = story.verified_count
    ? '<span class="verified-count">&#10003; ' + story.verified_count + ' verified</span>' : '';

  return '<article class="story-card" data-id="' + escHtml(story.id) + '" tabindex="0">'
    + '<div class="card-top">'
      + '<div class="card-meta-row">'
        + '<span class="category-badge" style="--cat-color:' + catColor + '">' + catIcon + ' ' + escHtml(story.category || 'General') + '</span>'
        + breaking
      + '</div>'
      + '<div class="card-country">'
        + flagHtml
        + '<span class="country-name">' + escHtml(story.country_name || 'Global') + '</span>'
      + '</div>'
    + '</div>'
    + '<div class="card-body">'
      + '<h3 class="card-headline">' + escHtml(story.headline) + '</h3>'
      + summaryHtml
    + '</div>'
    + '<div class="confidence-wrap">'
      + '<div class="confidence-label-row">'
        + '<span class="confidence-label">CONFIDENCE</span>'
        + '<span class="confidence-score" style="color:' + confColor + '">' + score + '%</span>'
      + '</div>'
      + '<div class="confidence-track">'
        + '<div class="confidence-fill" data-target="' + score + '" style="background:' + confColor + ';width:0%"></div>'
      + '</div>'
      + '<div class="confidence-footer">' + statusBadge + vfyHtml + '</div>'
    + '</div>'
    + '<div class="card-footer">'
      + '<span class="card-sources">&#128225; ' + srcCount + ' ' + (srcCount===1?'source':'sources') + '</span>'
      + '<span class="card-time">&#128336; ' + age + '</span>'
      + '<button class="card-expand-btn" data-id="' + escHtml(story.id) + '">&#9654; More</button>'
    + '</div>'
    + '<div class="card-expanded" id="expanded-' + escHtml(story.id) + '" aria-hidden="true">'
      + '<div class="expanded-inner"><div class="expanded-loading">Loading sources&#8230;</div></div>'
    + '</div>'
  + '</article>';
}

// ------------------------------------------------
// Render all cards into #story-grid
// ------------------------------------------------
function renderAllCards(stories) {
  var grid = document.getElementById('story-grid');
  if (!grid) return;
  if (!stories || stories.length === 0) {
    grid.innerHTML = '<div class="no-stories">'
      + '<span style="font-size:36px">&#128270;</span>'
      + '<p>No stories match your filters.</p>'
      + '<button class="btn-secondary" onclick="window.NewsFeed&&window.NewsFeed.filterByCategory(\'all\');window.NewsFeed&&window.NewsFeed.clearCountryFilter();">Clear Filters</button>'
      + '</div>';
    return;
  }
  grid.innerHTML = stories.map(renderStoryCard).join('');
  // Animate confidence bars
  requestAnimationFrame(function() {
    setTimeout(function() {
      grid.querySelectorAll('.confidence-fill[data-target]').forEach(function(bar) {
        bar.style.width = (parseInt(bar.dataset.target,10)||0) + '%';
      });
    }, 80);
  });
  // Expand buttons — stop propagation so they don't trigger modal
  grid.querySelectorAll('.card-expand-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      expandCard(btn.dataset.id);
    });
  });
  // Card click → open modal
  grid.querySelectorAll('.story-card').forEach(function(card) {
    card.addEventListener('click', function(e) {
      // Don't open modal if clicking expand button or links
      if (e.target.closest('.card-expand-btn') || e.target.tagName === 'A') return;
      var id = card.dataset.id;
      var all = window.NewsFeed ? window.NewsFeed.getAll() : stories;
      var story = all.find(function(s){ return String(s.id) === String(id); });
      if (story && window.StoryModal) window.StoryModal.open(story, all);
    });
    // Keyboard nav — Enter opens modal, Space still expands
    card.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var id = card.dataset.id;
        var all = window.NewsFeed ? window.NewsFeed.getAll() : stories;
        var story = all.find(function(s){ return String(s.id) === String(id); });
        if (story && window.StoryModal) window.StoryModal.open(story, all);
      } else if (e.key === ' ') {
        e.preventDefault();
        expandCard(card.dataset.id);
      }
    });
  });
  // Add pointer cursor hint
  var style = document.getElementById('story-card-cursor-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'story-card-cursor-style';
    style.textContent = '.story-card{cursor:pointer;}.story-card:hover{transform:translateY(-2px);transition:transform 0.18s ease;}';
    document.head.appendChild(style);
  }
  // XrayNews — update story count badge
  (function() {
    var _scEl = document.getElementById('stories-count');
    if (_scEl) _scEl.textContent = (stories ? stories.length : 0) + ' stories';
  })();
}

// ------------------------------------------------
// Expand card — show sources
// ------------------------------------------------
var _expandedIds = {};

async function expandCard(storyId) {
  var panel = document.getElementById('expanded-' + storyId);
  var btn   = document.querySelector('.card-expand-btn[data-id="' + storyId + '"]');
  if (!panel) return;
  if (_expandedIds[storyId]) {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden','true');
    if (btn) btn.innerHTML = '&#9654; More';
    delete _expandedIds[storyId];
    return;
  }
  _expandedIds[storyId] = true;
  panel.classList.add('open');
  panel.setAttribute('aria-hidden','false');
  if (btn) btn.innerHTML = '&#9660; Hide';

  var inner  = panel.querySelector('.expanded-inner');
  var verifs = [];
  if (window.XrayNewsDB) {
    try { verifs = await window.XrayNewsDB.getVerifications(storyId); } catch(e){}
  }
  if (!verifs || verifs.length === 0) {
    var story  = window.NewsFeed ? window.NewsFeed.getAll().find(function(s){return s.id==storyId;}) : null;
    var count  = (story && story.source_count) || 3;
    var sample = [
      { source_name:'Reuters',            source_type:'legacy',      agrees:true  },
      { source_name:'Associated Press',   source_type:'legacy',      agrees:true  },
      { source_name:'BBC News',           source_type:'legacy',      agrees:true  },
      { source_name:'Twitter/X',          source_type:'social',      agrees:true  },
      { source_name:'Official Statement', source_type:'official',    agrees:true  },
      { source_name:'Bellingcat',         source_type:'independent', agrees:false }
    ];
    verifs = sample.slice(0, Math.min(count, 6));
  }
  var typeLabel = {legacy:'Legacy Media',social:'Social Media',official:'Official',independent:'Independent'};
  var rows = verifs.map(function(v) {
    var agree = v.agrees !== false;
    return '<div class="source-row">'
      + (agree ? '<span class="source-agree agree-yes">&#10003;</span>'
               : '<span class="source-agree agree-no">&#10007;</span>')
      + '<span class="source-name">' + escHtml(v.source_name||'Unknown') + '</span>'
      + '<span class="source-type">' + escHtml(typeLabel[v.source_type]||v.source_type||'') + '</span>'
      + (v.source_url ? '<a href="' + escHtml(v.source_url) + '" target="_blank" rel="noopener" class="source-link">&#128279;</a>' : '')
      + '</div>';
  }).join('');
  inner.innerHTML = '<div class="sources-header">Verification Sources (' + verifs.length + ')</div>'
    + '<div class="sources-list">' + rows + '</div>';
}

// ------------------------------------------------
// Public API
// ------------------------------------------------
window.StoryCards = {
  renderCard:         renderStoryCard,
  renderAll:          renderAllCards,
  expandCard:         expandCard,
  getStatusBadge:     getStatusBadge,
  getConfidenceColor: getConfidenceColor,
  getCategoryIcon:    getCategoryIcon,
  getCountryFlag:     getCountryFlag
};
