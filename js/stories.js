// ================================================
// XRAYNEWS - Story Card Renderer
// ================================================

// ---- Save/Bookmark helpers ----
// NOTE: These are kept for backwards compat and sync access during render
// The actual save operations now use XrayNewsSaved (Supabase + localStorage fallback)

function _getSaved() {
  // Use XrayNewsSaved if available, otherwise direct localStorage
  if (window.XrayNewsSaved) {
    return window.XrayNewsSaved._getLocalSaved();
  }
  try { return JSON.parse(localStorage.getItem('xraynews_saved') || '[]'); } catch(e) { return []; }
}

function _isSaved(id) {
  // Sync check - uses localStorage cache for fast render
  // For async check with Supabase, use XrayNewsSaved.isStorySaved(id)
  if (window.XrayNewsSaved) {
    return window.XrayNewsSaved._isSavedLocal(id);
  }
  return _getSaved().some(function(s){ return String(s.id) === String(id); });
}

// Legacy sync toggle - kept for backwards compat, but prefer async version below
function toggleSaveStory(story) {
  var saved = _getSaved();
  var idx = saved.findIndex(function(s){ return String(s.id) === String(story.id); });
  if (idx >= 0) {
    saved.splice(idx, 1);
    localStorage.setItem('xraynews_saved', JSON.stringify(saved));
    return false;
  } else {
    saved.unshift(story);
    if (saved.length > 100) saved = saved.slice(0, 100);
    localStorage.setItem('xraynews_saved', JSON.stringify(saved));
    return true;
  }
}

// Async toggle for Supabase-backed saves - USE THIS for button handlers
async function toggleSaveStoryAsync(story) {
  if (window.XrayNewsSaved) {
    var storyMeta = {
      id: story.id,
      headline: story.headline,
      summary: story.summary,
      country_code: story.country_code,
      country_name: story.country_name,
      category: story.category,
      xray_score: story.xray_score,
      status: story.status,
      story_thread_id: story.story_thread_id
    };
    return await window.XrayNewsSaved.toggleSaveStory(story.id, storyMeta);
  }
  // Fallback to sync version
  return toggleSaveStory(story);
}

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
    .replace(/"/g,'&quot;').replace(/\'/g,'&#39;');
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
// Resolve display name for story source
// Falls back to domain extraction from source_url
// ------------------------------------------------
function getSourceName(story) {
  if (story.source_name) return String(story.source_name);
  if (story.source_url) {
    try {
      var u = new URL(story.source_url);
      return u.hostname.replace(/^www\./, '');
    } catch(e) {}
  }
  return null;
}

// ------------------------------------------------
// Thread badge cache - stores thread counts
// ------------------------------------------------
var _threadCounts = {};

function setThreadCounts(threadData) {
  // threadData should be { thread_id: count, ... }
  _threadCounts = threadData || {};
}

function getThreadCount(threadId) {
  return _threadCounts[threadId] || 0;
}

// ------------------------------------------------
// Render single story card
// ------------------------------------------------
function renderStoryCard(story) {
  var flag       = getCountryFlag(story.country_code);
  var catIcon    = getCategoryIcon(story.category);
  var catColor   = getCategoryColor(story.category);
  var confColor  = getConfidenceColor(story.xray_score || story.confidence_score || 0);
  var score      = story.xray_score || story.confidence_score || 0;
  var verdict    = story.xray_verdict || '';
  var xrayBadge  = story.xray_score ? '<span class="xray-badge" title="Scored by Xray Truth Engine">🤖 XRAY</span>' : '';
  var statusBadge = getStatusBadge(story.status);
  var breaking   = story.is_breaking
    ? '<span class="breaking-badge">&#9889; BREAKING</span>' : '';
  var isFresh    = story.created_at &&
    (Date.now() - new Date(story.created_at).getTime()) < 60 * 60 * 1000;
  var freshBadge = isFresh ? '<span class="fresh-badge">&#9679; NEW</span>' : '';
  
  // Thread badge
  var threadBadge = '';
  if (story.story_thread_id) {
    var threadCount = getThreadCount(story.story_thread_id);
    threadBadge = '<span class="thread-badge" title="Part of a thread with ' + (threadCount || 'multiple') + ' stories">🧵 ' + (threadCount || '') + '</span>';
  }
  
  var age        = timeAgo(story.created_at);
  var flagHtml   = flag ? '<span class="country-flag">' + flag + '</span>' : '';
  var summaryHtml= story.summary
    ? '<p class="card-summary">' + escHtml(story.summary) + '</p>' : '';
  var srcCount   = story.source_count || 1;
  var vfyHtml    = story.verified_count
    ? '<span class="verified-count">&#10003; ' + story.verified_count + ' verified</span>' : '';
  var srcName    = getSourceName(story);
  var sourceBadgeHtml = srcName
    ? '<span class="source-badge">' + escHtml(srcName.slice(0, 24)) + '</span>' : '';

  return '<article class="story-card" data-id="' + escHtml(story.id) + '" data-thread="' + escHtml(story.story_thread_id || '') + '" tabindex="0" style="--card-accent:' + catColor + '">'
    + '<div class="card-top">'
      + '<div class="card-meta-row">'
        + '<span class="category-badge" style="--cat-color:' + catColor + '">' + catIcon + ' ' + escHtml(story.category || 'General') + '</span>'
        + breaking
        + freshBadge
        + threadBadge
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
        + '<span class="confidence-label">TRUTH SCORE</span>' + xrayBadge
        + '<span class="confidence-score" style="color:' + confColor + '">' + score + '%</span>'
      + '</div>'
      + '<div class="confidence-track">'
        + '<div class="confidence-fill" data-target="' + score + '" style="background:' + confColor + ';width:0%" title="' + escHtml(verdict) + '"></div>'
      + '</div>'
      + '<div class="confidence-footer">' + statusBadge + vfyHtml + '</div>'
    + '</div>'
    + '<div class="card-footer">'
      + '<span class="card-sources">&#128225; ' + srcCount + ' ' + (srcCount===1?'source':'sources') + '</span>'
      + sourceBadgeHtml
      + '<span class="card-time">&#128336; ' + age + '</span>'
      + '<button class="card-expand-btn" data-id="' + escHtml(story.id) + '">&#9654; More</button>'
      + '<button class="card-save-btn" data-id="' + escHtml(story.id) + '"' + ' title="Save story">' + (_isSaved(story.id) ? '&#9733;' : '&#9734;') + '</button>'
      + '<a class="card-detail-link" href="story.html?id=' + escHtml(story.id) + '" title="Full Xray Analysis">&#128269; Xray</a>'
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
  
  // Pre-compute thread counts from stories array
  var threadCounts = {};
  stories.forEach(function(s) {
    if (s.story_thread_id) {
      threadCounts[s.story_thread_id] = (threadCounts[s.story_thread_id] || 0) + 1;
    }
  });
  setThreadCounts(threadCounts);
  
  grid.innerHTML = stories.map(renderStoryCard).join('');
  // Animate confidence bars
  requestAnimationFrame(function() {
    setTimeout(function() {
      grid.querySelectorAll('.confidence-fill[data-target]').forEach(function(bar) {
        bar.style.width = (parseInt(bar.dataset.target,10)||0) + '%';
      });
    }, 80);
  });
  // Expand buttons
  grid.querySelectorAll('.card-expand-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      expandCard(btn.dataset.id);
    });
  });
  // ── Save/bookmark button handlers (ASYNC with Supabase) ────────────────────
  grid.querySelectorAll('.card-save-btn').forEach(function(btn) {
    btn.addEventListener('click', async function(e) {
      e.stopPropagation(); // prevent modal open
      var id    = btn.dataset.id;
      var pool  = window.NewsFeed ? window.NewsFeed.getAll() : (stories || []);
      var story = pool.find(function(s){ return String(s.id) === String(id); });
      if (!story) return;
      
      // Show loading state
      var origHtml = btn.innerHTML;
      btn.disabled = true;
      btn.style.opacity = '0.6';
      
      try {
        // Use async toggle (Supabase + localStorage fallback)
        var nowSaved = await toggleSaveStoryAsync(story);
        btn.innerHTML   = nowSaved ? '&#9733;' : '&#9734;';
        btn.style.color = nowSaved ? '#ffd700' : '';
        btn.title       = nowSaved ? 'Saved ✓' : 'Save story';
      } catch(err) {
        console.warn('[StoryCards] Save error:', err);
        btn.innerHTML = origHtml; // restore on error
      } finally {
        btn.disabled = false;
        btn.style.opacity = '';
      }
    });
  });
    // Card click → open modal
  grid.querySelectorAll('.story-card').forEach(function(card) {
    card.addEventListener('click', function(e) {
      if (e.target.closest('.card-expand-btn') || e.target.tagName === 'A') return;
      var id = card.dataset.id;
      var all = window.NewsFeed ? window.NewsFeed.getAll() : stories;
      var story = all.find(function(s){ return String(s.id) === String(id); });
      if (story && window.StoryModal) window.StoryModal.open(story, all);
    });
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
  var style = document.getElementById('story-card-cursor-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'story-card-cursor-style';
    style.textContent = '.story-card{cursor:pointer;}.story-card:hover{transform:translateY(-2px);transition:transform 0.18s ease;}';
    document.head.appendChild(style);
  }
  // stories-count managed by news-feed.js _applyAll()
  
  // Background: Refresh save states from Supabase (non-blocking)
  if (window.XrayNewsSaved) {
    window.XrayNewsSaved.getSavedStories().then(function(result) {
      if (result.source === 'supabase') {
        // Update button states based on fresh data
        result.stories.forEach(function(savedStory) {
          var btn = grid.querySelector('.card-save-btn[data-id="' + savedStory.id + '"]');
          if (btn) {
            btn.innerHTML = '&#9733;';
            btn.style.color = '#ffd700';
            btn.title = 'Saved ✓';
          }
        });
      }
    }).catch(function(){}); // silent fail
  }
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
    // No fake data - show empty state message
    inner.innerHTML = '<div class="sources-header">Verification Sources</div>'
      + '<div class="sources-empty">'
      + '<div class="sources-empty-icon">&#128269;</div>'
      + '<div class="sources-empty-text">No verifications yet</div>'
      + '<div class="sources-empty-sub">Sources will appear as this story is verified</div>'
      + '</div>';
    return;
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
  getCountryFlag:     getCountryFlag,
  // Expose async save function
  toggleSaveStoryAsync: toggleSaveStoryAsync,
  // Expose for external refresh of save states
  refreshSaveStates: function() {
    if (window.XrayNewsSaved) {
      return window.XrayNewsSaved.getSavedStories();
    }
    return Promise.resolve({ stories: _getSaved(), source: 'localStorage' });
  },
  // Thread support
  setThreadCounts:    setThreadCounts,
  getThreadCount:     getThreadCount
};
