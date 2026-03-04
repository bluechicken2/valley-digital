// ================================================
// XRAYNEWS - News Feed Manager
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
  if (window.XrayNewsDB) {
    try { data = await window.XrayNewsDB.getStories({ limit: 60 }); } catch(e) { data = null; }
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
  var re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\]/g,'\$&') + ')', 'gi');
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
function setupRealtime() {
  if (!window.XrayNewsDB) return;
  window.XrayNewsDB.subscribeToStories(function(record, type) {
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
  getFiltered:        function(){ return _filtered; }
};
