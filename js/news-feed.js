// ================================================
// GLOBEWATCH - News Feed Manager
// ================================================

var _allStories = [];
var _filtered   = [];
var _country    = null;
var _category   = 'all';
var _status     = 'all';
var _sort       = 'latest';

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
// Load stories (Supabase -> sample fallback)
// ------------------------------------------------
async function loadStories() {
  var data = null;
  if (window.GlobeWatchDB) {
    try { data = await window.GlobeWatchDB.getStories({ limit: 60 }); } catch(e) { data = null; }
  }
  if (!data || data.length === 0) {
    try {
      var r = await fetch('data/sample-stories.json');
      if (r.ok) data = await r.json();
    } catch(e) { console.warn('[Feed] Sample fallback failed:', e.message); }
  }
  _allStories = data || [];
  _filtered   = _allStories.slice();
  _applyAll();
  if (window.GlobeAPI) {
    window.GlobeAPI.updatePins(_allStories);
    window.GlobeAPI.updateCountryStatsFromStories(_allStories);
  }
  populateTickers(_allStories);
  return _allStories;
}

// ------------------------------------------------
// Tickers
// ------------------------------------------------
function populateTickers(stories) {
  _buildBreakingTicker(stories);
  _buildVerifiedTicker(stories);
}

function _storyTickerItem(s) {
  var flag    = getCountryFlag(s.country_code);
  var brk     = s.is_breaking ? '<span class="ticker-breaking-tag">&#9889; BREAKING &middot;</span>' : '';
  var flagHtml= flag ? '<span class="ticker-flag">' + flag + '</span>' : '';
  return '<span class="ticker-item">' + brk + flagHtml
       + '<span class="ticker-headline">' + escHtml(s.headline) + '</span></span>'
       + '<span class="ticker-dot">&middot;</span>';
}

function _buildBreakingTicker(stories) {
  var track = document.getElementById('ticker-breaking-track');
  if (!track) return;
  var sorted = stories.slice().sort(function(a,b){ return (b.is_breaking?1:0)-(a.is_breaking?1:0); });
  var html = sorted.map(_storyTickerItem).join('');
  track.innerHTML = html + html;
}

function _buildVerifiedTicker(stories) {
  var track = document.getElementById('ticker-verified-track');
  if (!track) return;
  var pool = stories.filter(function(s){ return s.status==='verified'||s.confidence_score>=70; });
  var src  = pool.length > 0 ? pool : stories;
  var html = src.map(function(s) {
    var flag  = getCountryFlag(s.country_code);
    var score = s.confidence_score || 0;
    var flagHtml = flag ? '<span class="ticker-flag">' + flag + '</span>' : '';
    return '<span class="ticker-item">'
      + '<span style="color:#00ff88;font-weight:700">&#10003;</span>'
      + flagHtml
      + '<span class="ticker-headline">' + escHtml(s.headline) + '</span>'
      + '<span class="ticker-confidence">' + score + '%</span>'
      + '</span><span class="ticker-dot">&middot;</span>';
  }).join('');
  track.innerHTML = html + html;
}

// ------------------------------------------------
// Filter + Sort
// ------------------------------------------------
function _applyAll() {
  var list = _allStories.slice();
  if (_country)            list = list.filter(function(s){ return s.country_code===_country; });
  if (_category !== 'all') list = list.filter(function(s){ return s.category===_category; });
  if (_status   !== 'all') list = list.filter(function(s){ return s.status===_status; });
  switch (_sort) {
    case 'confidence': list.sort(function(a,b){ return (b.confidence_score||0)-(a.confidence_score||0); }); break;
    case 'sources':    list.sort(function(a,b){ return (b.source_count||0)-(a.source_count||0); }); break;
    case 'breaking':   list.sort(function(a,b){ return (b.is_breaking?1:0)-(a.is_breaking?1:0); }); break;
    default:           list.sort(function(a,b){ return new Date(b.created_at)-new Date(a.created_at); }); break;
  }
  _filtered = list;
  if (window.StoryCards && typeof window.StoryCards.renderAll === 'function') {
    window.StoryCards.renderAll(_filtered);
  }
  var cnt = document.getElementById('stories-count');
  if (cnt) cnt.textContent = _filtered.length + ' of ' + _allStories.length + ' stories';
}

function filterByCountry(code) { _country=code||null; _applyAll(); }
function clearCountryFilter()  { _country=null;       _applyAll(); }
function filterByCategory(cat) { _category=cat||'all'; _applyAll(); }
function filterByStatus(st)    { _status=st||'all';    _applyAll(); }
function sortStories(method)   { _sort=method||'latest'; _applyAll(); }

function searchStories(q) {
  if (!q) return [];
  var lq = q.toLowerCase();
  return _allStories
    .filter(function(s){
      return (s.headline||'').toLowerCase().indexOf(lq)>=0
          || (s.country_name||'').toLowerCase().indexOf(lq)>=0
          || (s.summary||'').toLowerCase().indexOf(lq)>=0;
    })
    .slice(0,8)
    .map(function(s){
      return Object.assign({},s,{flag:getCountryFlag(s.country_code),country:s.country_name});
    });
}

// ------------------------------------------------
// Realtime
// ------------------------------------------------
function setupRealtime() {
  if (!window.GlobeWatchDB) return;
  window.GlobeWatchDB.subscribeToStories(function(record, type) {
    if (type==='INSERT') {
      _allStories.unshift(record);
      var badge = document.getElementById('notif-badge');
      if (badge) { var c=parseInt(badge.textContent)||0; badge.textContent=String(c+1); }
    } else if (type==='UPDATE') {
      var idx = _allStories.findIndex(function(s){return s.id===record.id;});
      if (idx>=0) _allStories[idx]=record;
    } else if (type==='DELETE') {
      _allStories = _allStories.filter(function(s){return s.id!==record.id;});
    }
    _applyAll();
    if (window.GlobeAPI) {
      window.GlobeAPI.updatePins(_allStories);
      window.GlobeAPI.updateCountryStatsFromStories(_allStories);
    }
    populateTickers(_allStories);
  });
}

// ------------------------------------------------
// Public API
// ------------------------------------------------
window.NewsFeed = {
  load:               loadStories,
  populateTickers:    populateTickers,
  setupRealtime:      setupRealtime,
  filterByCountry:    filterByCountry,
  clearCountryFilter: clearCountryFilter,
  filterByCategory:   filterByCategory,
  filterByStatus:     filterByStatus,
  sortStories:        sortStories,
  searchStories:      searchStories,
  getCountryFlag:     getCountryFlag,
  escHtml:            escHtml,
  timeAgo:            timeAgo,
  getAll:             function(){ return _allStories; },
  getFiltered:        function(){ return _filtered; }
};
