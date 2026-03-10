// ================================================
// XRAYNEWS - News Feed Manager
// ================================================

var _allStories  = [];
var _filtered    = [];
var _country     = null;
var _category    = 'all';
var _status      = 'all';
var _sort        = 'latest';
var _offset      = 0;
var _pageSize    = 50;
var _totalLoaded = 0;
var _isLoading   = false;

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
// Load stories from Supabase
// ------------------------------------------------
async function loadStories(append) {
  if (_isLoading) return _allStories;
  _isLoading = true;
  _setLoadMoreBtn('loading');

  if (!append) _offset = 0;

  var data = null;
  if (window.XrayNewsDB) {
    try {
      data = await window.XrayNewsDB.getStories({ limit: _pageSize, offset: _offset });
    } catch(e) { data = null; }
  }

  // No sample fallback - require live Supabase data
  if (!append && (!data || data.length === 0)) {
    console.warn('[Feed] No stories available from Supabase');
  }

  var rows = data || [];

  if (append) {
    _allStories = _allStories.concat(rows);
  } else {
    _allStories = rows;
  }

  _offset += rows.length;
  _isLoading = false;

  // Show/hide load-more button
  _setLoadMoreBtn(rows.length < _pageSize ? 'hidden' : 'ready');

  _filtered = _allStories.slice();
  _applyAll();
  updateStatsBar(_allStories);

  // Update globe pins if available
  if (window.GlobeAPI && window.GlobeAPI.updatePins) {
    window.GlobeAPI.updatePins(_allStories);
    window.GlobeAPI.updateCountryStatsFromStories(_allStories);
  }

  // Always update HUD directly (fallback + ensures update)
  var hudTotal = document.getElementById("hud-total");
  var hudVerified = document.getElementById("hud-verified");
  var hudPending = document.getElementById("hud-pending");
  if (hudTotal) hudTotal.textContent = _allStories.length;
  if (hudVerified) {
    var verified = _allStories.filter(function(s){return s.status==="verified";}).length;
    hudVerified.textContent = verified;
  }
  if (hudPending) {
    var pending = _allStories.filter(function(s){return s.status!=="verified";}).length;
    hudPending.textContent = pending;
  }
  if (!append) populateTickers(_allStories);
  if (window.checkSpaceStories) window.checkSpaceStories(_allStories);
  return _allStories;
}

function _setLoadMoreBtn(state) {
  var btn = document.getElementById('load-more-btn');
  if (!btn) return;
  if (state === 'hidden')  { btn.style.display = 'none'; return; }
  btn.style.display = 'block';
  if (state === 'loading') { btn.textContent = '⏳ Loading...'; btn.disabled = true; }
  else                     { btn.textContent = '⬇ Load More Stories'; btn.disabled = false; }
}

function loadMoreStories() {
  loadStories(true);
}

// Attach click handler to load-more button
function _attachLoadMoreHandler() {
  var btn = document.getElementById('load-more-btn');
  if (btn) {
    btn.addEventListener('click', loadMoreStories);
  }
}

// Attach on DOM ready
document.addEventListener('DOMContentLoaded', _attachLoadMoreHandler);

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
    var score = s.xray_score || s.confidence_score || 0;
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
    case 'confidence': list.sort(function(a,b){ return (b.xray_score||b.confidence_score||0)-(a.xray_score||a.confidence_score||0); }); break;
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
          || (s.summary||'').toLowerCase().indexOf(lq)>=0
          || (s.category||'').toLowerCase().indexOf(lq)>=0;
    })
    .slice(0,6)
    .map(function(s){
      return Object.assign({},s,{flag:getCountryFlag(s.country_code),country:s.country_name});
    });
}

function _highlightMatch(text, query) {
  if (!query || !text) return escHtml(text||'');
  var re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
  return escHtml(text).replace(re, '<strong style="color:#00d4ff">$1</strong>');
}

// ------------------------------------------------
// Live search (Task 4) — call from dashboard after load
// ------------------------------------------------
function setupLiveSearch() {
  var input  = document.getElementById('nav-search');
  var drop   = document.getElementById('search-dropdown');
  if (!input || !drop) return;
  var timer;
  var selIdx = -1;

  function getItems() { return drop.querySelectorAll('.srch-item'); }

  function _populate(q) {
    var hits = searchStories(q);
    if (!q) { drop.classList.remove('open'); return; }
    if (!hits.length) {
      drop.innerHTML = '<div class="srch-empty">No stories found for &ldquo;' + escHtml(q) + '&rdquo;<br><span class="srch-hint">Try a country name or category</span></div>';
      drop.classList.add('open'); selIdx = -1; return;
    }
    var STATUS_MAP = {
      verified:  {icon:'&#10003;',cls:'badge-verified'},
      unverified:{icon:'?',cls:'badge-unverified'},
      contested: {icon:'&#9889;',cls:'badge-contested'},
      false:     {icon:'&#10007;',cls:'badge-false'}
    };
    drop.innerHTML = hits.map(function(s,i){
      var sm = STATUS_MAP[s.status]||STATUS_MAP.unverified;
      return '<div class="srch-item" role="option" aria-selected="false" data-idx="'+i+'">'
        + '<span class="srch-flag">' + (s.flag||'&#127760;') + '</span>'
        + '<span class="srch-hl">' + _highlightMatch(s.headline, q) + '</span>'
        + '<span class="srch-badge status-badge ' + sm.cls + '" style="font-size:9px;padding:2px 5px">' + sm.icon + ' ' + (s.status||'').toUpperCase() + '</span>'
        + '</div>';
    }).join('');
    drop.classList.add('open');
    selIdx = -1;
    getItems().forEach(function(item, i){
      item.addEventListener('mousedown', function(e){
        e.preventDefault();
        var story = hits[i];
        input.value = '';
        drop.classList.remove('open');
        if (window.StoryModal) window.StoryModal.open(story, _allStories);
      });
    });
  }

  input.addEventListener('input', function(){
    clearTimeout(timer);
    var q = input.value.trim();
    if (!q) { drop.classList.remove('open'); return; }
    timer = setTimeout(function(){ _populate(q); }, 200);
  });

  input.addEventListener('keydown', function(e){
    var items = getItems();
    if (e.key === 'Escape') { drop.classList.remove('open'); input.value=''; selIdx=-1; return; }
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selIdx = Math.min(selIdx+1, items.length-1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selIdx = Math.max(selIdx-1, -1);
    } else if (e.key === 'Enter') {
      if (selIdx >= 0) { items[selIdx].dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); }
      return;
    }
    items.forEach(function(it,i){ it.setAttribute('aria-selected', i===selIdx?'true':'false'); it.classList.toggle('srch-active',i===selIdx); });
  });

  input.addEventListener('blur', function(){ setTimeout(function(){ drop.classList.remove('open'); },200); });
}

// ------------------------------------------------
// Notifications (Task 7)
// ------------------------------------------------
function setupNotifications() {
  var btn   = document.getElementById('notif-btn');
  var panel = document.getElementById('notif-panel');
  var badge = document.getElementById('notif-badge');
  if (!btn || !panel) return;

  var _unread = 0;
  var _built  = false;

  function _buildPanel() {
    var pool = _allStories.slice(0, 4);
    var NTYPES = [
      { icon:'&#9889;', label:'NEW BREAKING STORY',   cls:'notif-type-brk' },
      { icon:'&#10003;',label:'STORY VERIFIED',        cls:'notif-type-ok'  },
      { icon:'&#9888;', label:'CONFIDENCE UPDATED',    cls:'notif-type-warn'},
      { icon:'&#128226;',label:'NEW SOURCE ADDED',     cls:'notif-type-info'}
    ];
    var rows = pool.map(function(s,i){
      var nt  = NTYPES[i % NTYPES.length];
      var ago = _timeAgoShort(s.created_at);
      return '<div class="notif-item" data-id="'+escHtml(s.id)+'" tabindex="0" role="button">'
        + '<span class="notif-type-icon '+nt.cls+'">'+nt.icon+'</span>'
        + '<div class="notif-detail">'
          + '<div class="notif-type-lbl">'+nt.label+'</div>'
          + '<div class="notif-hl">'+escHtml((s.country_name||'')+' · '+(s.headline||'').slice(0,45)+(s.headline&&s.headline.length>45?'…':''))+'</div>'
          + '<div class="notif-age">'+ago+'</div>'
        + '</div>'
      + '</div>';
    }).join('');
    var body = document.getElementById('notif-body');
    if (body) body.innerHTML = rows;
    _unread = pool.length;
    if (badge) { badge.textContent = _unread; badge.classList.toggle('hidden', _unread===0); }
    // Attach click handlers
    panel.querySelectorAll('.notif-item').forEach(function(item){
      function _open() {
        var id    = item.dataset.id;
        var story = _allStories.find(function(s){return String(s.id)===String(id);});
        if (story && window.StoryModal) window.StoryModal.open(story, _allStories);
        _markRead();
        _closePanel();
      }
      item.addEventListener('click',  _open);
      item.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();_open();}});
    });
    var markAll = document.getElementById('notif-mark-all');
    if (markAll) markAll.addEventListener('click', _markRead);
    _built = true;
  }

  function _markRead() {
    _unread = 0;
    if (badge) { badge.textContent='0'; badge.classList.add('hidden'); }
    panel.querySelectorAll('.notif-item').forEach(function(it){ it.classList.add('notif-read'); });
  }
  function _closePanel() { panel.classList.remove('notif-open'); btn.setAttribute('aria-expanded','false'); }

  btn.addEventListener('click', function(e){
    e.stopPropagation();
    if (!_built && _allStories.length) _buildPanel();
    var open = panel.classList.toggle('notif-open');
    btn.setAttribute('aria-expanded', String(open));
    if (open && _unread > 0) _markRead();
  });
  document.addEventListener('click', function(e){
    if (!panel.contains(e.target) && e.target !== btn) _closePanel();
  });
}

function _timeAgoShort(iso) {
  if (!iso) return '';
  var d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60)    return d + 's ago';
  if (d < 3600)  return Math.floor(d/60) + 'm ago';
  if (d < 86400) return Math.floor(d/3600) + 'h ago';
  return Math.floor(d/86400) + 'd ago';
}

// ------------------------------------------------
// Realtime
// ------------------------------------------------

// ------------------------------------------------
// Toast Notifications
// ------------------------------------------------
var _toastContainer = null;
var _toastQueue = [];

function _getToastContainer() {
  if (!_toastContainer) {
    _toastContainer = document.createElement('div');
    _toastContainer.id = 'toast-container';
    document.body.appendChild(_toastContainer);
  }
  return _toastContainer;
}

function showBreakingToast(story) {
  var container = _getToastContainer();
  if (container.children.length >= 3) {
    var oldest = container.children[0];
    oldest.classList.remove('toast-in');
    oldest.classList.add('toast-out');
    setTimeout(function() { if (oldest.parentNode) oldest.parentNode.removeChild(oldest); }, 350);
  }
  var flag = '';
  if (story.country_code && story.country_code.length === 2) {
    var o = 0x1F1E6 - 65;
    flag = String.fromCodePoint(story.country_code.toUpperCase().charCodeAt(0) + o)
         + String.fromCodePoint(story.country_code.toUpperCase().charCodeAt(1) + o);
  }
  var headline = (story.headline || '').slice(0, 80) + ((story.headline || '').length > 80 ? '…' : '');
  var toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = '<span class="toast-icon">&#9889;</span>'
    + '<div class="toast-body">'
      + '<div class="toast-label">BREAKING NEWS</div>'
      + '<div class="toast-headline">' + headline.replace(/</g,'&lt;') + '</div>'
      + '<div class="toast-country">' + flag + ' ' + (story.country_name || 'Global') + '</div>'
    + '</div>'
    + '<button class="toast-close" aria-label="Dismiss">&times;</button>';
  toast.querySelector('.toast-close').addEventListener('click', function() {
    toast.classList.remove('toast-in');
    toast.classList.add('toast-out');
    setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 350);
  });
  container.appendChild(toast);
  requestAnimationFrame(function() { toast.classList.add('toast-in'); });
  setTimeout(function() {
    toast.classList.remove('toast-in');
    toast.classList.add('toast-out');
    setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 350);
  }, 8000);
}

function setupRealtime() {
  if (!window.XrayNewsDB) return;
  window.XrayNewsDB.subscribeToStories(function(record, type) {
    if (type==='INSERT') {
      _allStories.unshift(record);
      if (record.is_breaking) showBreakingToast(record);
      var badge = document.getElementById('notif-badge');
      if (badge) { var c=parseInt(badge.textContent)||0; badge.textContent=String(c+1); }
    } else if (type==='UPDATE') {
      var idx = _allStories.findIndex(function(s){return s.id===record.id;});
      if (idx>=0) _allStories[idx]=record;
    } else if (type==='DELETE') {
      _allStories = _allStories.filter(function(s){return s.id!==record.id;});
    }
    _applyAll();
    updateStatsBar(_allStories);
    if (window.GlobeAPI && window.GlobeAPI.updatePins) {
      window.GlobeAPI.updatePins(_allStories);
      window.GlobeAPI.updateCountryStatsFromStories(_allStories);
    }
    // Fallback: Always update HUD directly
    var hudTotal = document.getElementById("hud-total");
    var hudVerified = document.getElementById("hud-verified");
    var hudPending = document.getElementById("hud-pending");
    if (hudTotal) hudTotal.textContent = _allStories.length;
    if (hudVerified) hudVerified.textContent = _allStories.filter(function(s){return s.status==="verified";}).length;
    if (hudPending) hudPending.textContent = _allStories.filter(function(s){return s.status!=="verified";}).length;
    populateTickers(_allStories);
  });
}


// ------------------------------------------------
// Auto-refresh fallback every 5 minutes
// ------------------------------------------------
function startAutoRefresh() {
  // Auto-refresh silently checks for new stories without wiping current loaded list
  // Real-time subscription already handles adding new stories one-by-one
  // This fallback just ensures if realtime fails, we still get new stories
  setInterval(async function() {
    if (!window.XrayNewsDB || _isLoading) return;
    try {
      // Only fetch the latest 10 to check for new ones, do not reset offset or wipe
      var fresh = await window.XrayNewsDB.getStories({ limit: 10, offset: 0 });
      if (!fresh || !fresh.length) return;
      var existingIds = new Set(_allStories.map(function(s) { return s.id; }));
      var newStories = fresh.filter(function(s) { return !existingIds.has(s.id); });
      if (newStories.length > 0) {
        newStories.forEach(function(s) { _allStories.unshift(s); });
        _applyAll();
        if (window.GlobeAPI) {
          if (window.GlobeAPI.updatePins) window.GlobeAPI.updatePins(_allStories);
          if (window.GlobeAPI.updateCountryStatsFromStories) window.GlobeAPI.updateCountryStatsFromStories(_allStories);
        }
      }
    } catch(e) { /* silent fail */ }
  }, 5 * 60 * 1000);
}

// ------------------------------------------------
// Stats Bar
// ------------------------------------------------
function updateStatsBar(stories) {
  var total    = stories.length;
  var verified = stories.filter(function(s) { return s.status === 'verified'; }).length;
  var countries = {};
  stories.forEach(function(s) { if (s.country_code) countries[s.country_code] = 1; });
  var countryCount = Object.keys(countries).length;
  var newest = stories.reduce(function(latest, s) {
    return (!latest || new Date(s.created_at) > new Date(latest)) ? s.created_at : latest;
  }, null);
  var updatedAgo = newest
    ? (function() {
        var d = Math.floor((Date.now() - new Date(newest).getTime()) / 1000);
        if (d < 60)   return d + 's ago';
        if (d < 3600) return Math.floor(d/60) + 'm ago';
        return Math.floor(d/3600) + 'h ago';
      })()
    : '--';

  function setEl(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }
  setEl('stat-total',    total);
  setEl('stat-verified', verified);
  setEl('stat-countries', countryCount);
  setEl('stat-updated',  updatedAgo);
}

// ------------------------------------------------
// Public API
// ------------------------------------------------
window.NewsFeed = {
  setPageSize: function(n) {
    _pageSize = parseInt(n, 10) || 50;
    _offset = 0;
    _allStories = [];
    loadStories();
  },
  load:               loadStories,
  populateTickers:    populateTickers,
  setupRealtime:      setupRealtime,
  startAutoRefresh:   startAutoRefresh,
  updateStatsBar:     updateStatsBar,
  showBreakingToast:  showBreakingToast,
  setupLiveSearch:    setupLiveSearch,
  setupNotifications: setupNotifications,
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
  getFiltered:        function(){ return _filtered; },
  loadMore:           loadMoreStories
};
