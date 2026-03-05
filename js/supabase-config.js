// ================================================
// XRAYNEWS - Supabase Configuration
// ================================================

var SUPABASE_URL      = 'https://dkxydhuojaspmbpjfyoz.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRreHlkaHVvamFzcG1icGpmeW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MDE3NTcsImV4cCI6MjA4NzM3Nzc1N30.6jwE5s6aekCDXALnrCK2hA1Lu3h3lbh7WqR9Io0lx8s';

// ------------------------------------------------
// XrayNewsDB  — thin wrapper around REST + Realtime
// ------------------------------------------------
class XrayNewsDB {
  constructor() {
    this.url     = SUPABASE_URL;
    this.key     = SUPABASE_ANON_KEY;
    this.headers = {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation'
    };
    this._realtimeWs  = null;
    this._realtimeCbs = [];
  }
  
  // ---- Accessors ----
  getUrl() { return this.url; }
  getKey() { return this.key; }

  // ---- REST helpers ---------------------------------------------------
  async _fetch(path, opts) {
    var url  = this.url + '/rest/v1' + path;
    var resp = await fetch(url, Object.assign({ headers: this.headers }, opts || {}));
    if (!resp.ok) {
      var err = await resp.text().catch(function(){return resp.statusText;});
      throw new Error('Supabase ' + resp.status + ': ' + err);
    }
    var ct = resp.headers.get('Content-Type') || '';
    return ct.includes('application/json') ? resp.json() : null;
  }

  // ---- Stories --------------------------------------------------------
  async getStories(filters) {
    filters = filters || {};
    var limit  = filters.limit  || 150;
    var offset = filters.offset || 0;
    var status = filters.status || null;
    var cat    = filters.category || null;
    var params = new URLSearchParams();
    params.set('select', '*');
    params.set('order',  'created_at.desc');
    params.set('limit',  String(limit));
    if (offset > 0) params.set('offset', String(offset));
    if (status) params.set('status', 'eq.' + status);
    if (cat)    params.set('category', 'eq.' + cat);
    return this._fetch('/stories?' + params.toString());
  }

  async getStory(id) {
    return this._fetch('/stories?id=eq.' + encodeURIComponent(id) + '&select=*&limit=1')
      .then(function(rows){ return rows && rows[0] ? rows[0] : null; });
  }

  async insertStory(story) {
    return this._fetch('/stories', {
      method: 'POST',
      body:   JSON.stringify(story)
    });
  }

  async updateStory(id, patch) {
    return this._fetch('/stories?id=eq.' + encodeURIComponent(id), {
      method:  'PATCH',
      body:    JSON.stringify(patch),
      headers: Object.assign({}, this.headers, { Prefer: 'return=representation' })
    });
  }

  // ---- Verifications --------------------------------------------------
  async getVerifications(storyId) {
    return this._fetch('/verifications?story_id=eq.' + encodeURIComponent(storyId)
      + '&select=*&order=verified_at.desc');
  }

  // ---- Country Stats --------------------------------------------------
  async getCountryStats() {
    return this._fetch('/country_stats?select=*&order=story_count.desc');
  }

  // ---- Categories -----------------------------------------------------
  async getCategories() {
    return this._fetch('/categories?select=*&order=name.asc');
  }

  // ---- Profile --------------------------------------------------------
  async getProfile(userId) {
    return this._fetch('/profiles?id=eq.' + encodeURIComponent(userId) + '&select=*&limit=1')
      .then(function(rows){ return rows && rows[0] ? rows[0] : null; });
  }

  async upsertProfile(profile) {
    return this._fetch('/profiles', {
      method:  'POST',
      headers: Object.assign({}, this.headers, { Prefer: 'resolution=merge-duplicates,return=representation' }),
      body:    JSON.stringify(profile)
    });
  }

  // ---- Realtime -------------------------------------------------------
  subscribeToStories(callback) {
    this._realtimeCbs.push(callback);
    if (this._realtimeWs) return;
    var self = this;
    var wsUrl = SUPABASE_URL.replace('https://','wss://') + '/realtime/v1/websocket?apikey=' + SUPABASE_ANON_KEY + '&vsn=1.0.0';
    try {
      var ws = new WebSocket(wsUrl);
      this._realtimeWs = ws;
      ws.onopen = function() {
        // Supabase realtime v2 — must declare postgres_changes in join payload
        ws.send(JSON.stringify({
          topic:   'realtime:public:stories',
          event:   'phx_join',
          payload: {
            config: {
              broadcast:       { self: true },
              presence:        { key: '' },
              postgres_changes: [{ event: '*', schema: 'public', table: 'stories' }]
            }
          },
          ref: '1'
        }));
        // Keep-alive heartbeat every 25 seconds
        self._heartbeatInterval = setInterval(function() {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({topic:'phoenix',event:'heartbeat',payload:{},ref:'hb'}));
          }
        }, 25000);
      };
      ws.onmessage = function(e) {
        try {
          var msg = JSON.parse(e.data);
          // Supabase realtime v2: postgres_changes wrapped in payload.data
          if (msg.event === 'postgres_changes' && msg.payload && msg.payload.data) {
            var d = msg.payload.data;
            var record = d.record || d.old_record || {};
            var evType = (d.type || 'INSERT').toUpperCase();
            self._realtimeCbs.forEach(function(cb) { try { cb(record, evType); } catch(err){} });
          }
          // Legacy v1 format fallback
          if (msg.event === 'INSERT' || msg.event === 'UPDATE' || msg.event === 'DELETE') {
            var record = (msg.payload && msg.payload.record) || (msg.payload && msg.payload.old_record) || {};
            self._realtimeCbs.forEach(function(cb) { try { cb(record, msg.event); } catch(err){} });
          }
          if (msg.event === 'phx_reply' && msg.payload) {
            if (msg.payload.status === 'ok') {
              console.log('[XrayNewsDB] Realtime connected ✓');
            } else {
              console.warn('[XrayNewsDB] Realtime join issue:', msg.payload.response);
            }
          }
        } catch(err) { console.warn('[XrayNewsDB] WS parse error:', err); }
      };
      ws.onerror = function(err) { console.warn('[XrayNewsDB] WebSocket error', err); };
      ws.onclose = function() {
        if (self._heartbeatInterval) clearInterval(self._heartbeatInterval);
        self._realtimeWs = null;
        // Reconnect after 5s if callbacks still registered
        setTimeout(function() { if (self._realtimeCbs.length) self.subscribeToStories(function(){}); }, 5000);
      };
    } catch(err) {
      console.warn('[XrayNewsDB] WebSocket not available:', err.message);
    }
    return function unsubscribe() {
      self._realtimeCbs = self._realtimeCbs.filter(function(c){return c!==callback;});
    };
  }
}

window.XrayNewsDB = new XrayNewsDB();

// ================================================
// XrayNewsSaved — Bookmark sync for logged-in users
// Falls back to localStorage for anonymous users
// ================================================

var XrayNewsSaved = (function() {
  var LOCAL_KEY = 'xraynews_saved';
  
  // Get Supabase client (from auth.js)
  function _getClient() {
    if (typeof window._getClient === 'function') return window._getClient();
    if (window._supaClient) return window._supaClient;
    return null;
  }
  
  // Check if user is logged in
  async function _getCurrentUser() {
    var client = _getClient();
    if (!client) return null;
    try {
      var res = await client.auth.getUser();
      return res.data && res.data.user ? res.data.user : null;
    } catch(e) {
      return null;
    }
  }
  
  // LocalStorage helpers (fallback)
  function _getLocalSaved() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    } catch(e) {
      return [];
    }
  }
  
  function _setLocalSaved(arr) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(arr.slice(0, 100)));
    } catch(e) {}
  }
  
  // ---- Public API ----
  
  // Check if a story is saved
  async function isStorySaved(storyId) {
    var user = await _getCurrentUser();
    if (!user) {
      // Anonymous: check localStorage
      return _getLocalSaved().some(function(s) { return String(s.id) === String(storyId); });
    }
    
    // Logged in: check Supabase
    var client = _getClient();
    if (!client) return false;
    
    try {
      var resp = await client
        .from('saved_stories')
        .select('id')
        .eq('user_id', user.id)
        .eq('story_id', storyId)
        .limit(1);
      return resp.data && resp.data.length > 0;
    } catch(e) {
      console.warn('[XrayNewsSaved] isStorySaved error:', e);
      return false;
    }
  }
  
  // Save a story
  async function saveStory(storyId, storyMeta) {
    var user = await _getCurrentUser();
    
    if (!user) {
      // Anonymous: save to localStorage
      var saved = _getLocalSaved();
      var idx = saved.findIndex(function(s) { return String(s.id) === String(storyId); });
      if (idx < 0) {
        var meta = storyMeta || { id: storyId };
        meta.saved_at = new Date().toISOString();
        saved.unshift(meta);
        _setLocalSaved(saved);
      }
      return { success: true, source: 'localStorage' };
    }
    
    // Logged in: save to Supabase
    var client = _getClient();
    if (!client) return { success: false, error: 'No client' };
    
    try {
      var resp = await client
        .from('saved_stories')
        .insert({ user_id: user.id, story_id: storyId });
      
      if (resp.error) {
        // Ignore duplicate key error (already saved)
        if (resp.error.code === '23505') {
          return { success: true, source: 'supabase', alreadyExists: true };
        }
        throw resp.error;
      }
      
      // Also update localStorage for offline access
      var saved = _getLocalSaved();
      var idx = saved.findIndex(function(s) { return String(s.id) === String(storyId); });
      if (idx < 0) {
        var meta = storyMeta || { id: storyId };
        meta.saved_at = new Date().toISOString();
        saved.unshift(meta);
        _setLocalSaved(saved);
      }
      
      return { success: true, source: 'supabase' };
    } catch(e) {
      console.warn('[XrayNewsSaved] saveStory error:', e);
      return { success: false, error: e.message || 'Unknown error' };
    }
  }
  
  // Unsave a story
  async function unsaveStory(storyId) {
    var user = await _getCurrentUser();
    
    // Always remove from localStorage
    var saved = _getLocalSaved();
    var idx = saved.findIndex(function(s) { return String(s.id) === String(storyId); });
    if (idx >= 0) {
      saved.splice(idx, 1);
      _setLocalSaved(saved);
    }
    
    if (!user) {
      return { success: true, source: 'localStorage' };
    }
    
    // Logged in: remove from Supabase
    var client = _getClient();
    if (!client) return { success: true, source: 'localStorage' };
    
    try {
      var resp = await client
        .from('saved_stories')
        .delete()
        .eq('user_id', user.id)
        .eq('story_id', storyId);
      
      if (resp.error) throw resp.error;
      
      return { success: true, source: 'supabase' };
    } catch(e) {
      console.warn('[XrayNewsSaved] unsaveStory error:', e);
      return { success: true, source: 'localStorage', supabaseError: e.message };
    }
  }
  
  // Get all saved stories
  async function getSavedStories() {
    var user = await _getCurrentUser();
    
    if (!user) {
      // Anonymous: return from localStorage
      return { stories: _getLocalSaved(), source: 'localStorage' };
    }
    
    // Logged in: fetch from Supabase with story details
    var client = _getClient();
    if (!client) return { stories: _getLocalSaved(), source: 'localStorage' };
    
    try {
      var resp = await client
        .from('saved_stories')
        .select(`
          id,
          created_at,
          story_id,
          stories (
            id,
            headline,
            summary,
            country_code,
            country_name,
            category,
            xray_score,
            status,
            created_at
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (resp.error) throw resp.error;
      
      // Flatten the structure
      var stories = (resp.data || []).map(function(row) {
        var s = row.stories || {};
        return {
          id: s.id || row.story_id,
          headline: s.headline,
          summary: s.summary,
          country_code: s.country_code,
          country_name: s.country_name,
          category: s.category,
          xray_score: s.xray_score,
          status: s.status,
          saved_at: row.created_at
        };
      }).filter(function(s) { return s.id; });
      
      // Sync to localStorage for offline access
      _setLocalSaved(stories);
      
      return { stories: stories, source: 'supabase' };
    } catch(e) {
      console.warn('[XrayNewsSaved] getSavedStories error:', e);
      return { stories: _getLocalSaved(), source: 'localStorage', error: e.message };
    }
  }
  
  // Toggle save state - returns new state (true = saved, false = unsaved)
  async function toggleSaveStory(storyId, storyMeta) {
    var isSaved = await isStorySaved(storyId);
    if (isSaved) {
      await unsaveStory(storyId);
      return false;
    } else {
      await saveStory(storyId, storyMeta);
      return true;
    }
  }
  
  // Sync localStorage to Supabase (call after login)
  async function syncToCloud() {
    var user = await _getCurrentUser();
    if (!user) return { synced: 0, error: 'Not logged in' };
    
    var local = _getLocalSaved();
    if (local.length === 0) return { synced: 0 };
    
    var client = _getClient();
    if (!client) return { synced: 0, error: 'No client' };
    
    var synced = 0;
    for (var i = 0; i < local.length; i++) {
      var s = local[i];
      if (!s.id) continue;
      try {
        var resp = await client
          .from('saved_stories')
          .insert({ user_id: user.id, story_id: s.id })
          .select();
        if (!resp.error) synced++;
      } catch(e) {
        // Ignore duplicates
      }
    }
    
    return { synced: synced };
  }
  
  return {
    isStorySaved: isStorySaved,
    saveStory: saveStory,
    unsaveStory: unsaveStory,
    getSavedStories: getSavedStories,
    toggleSaveStory: toggleSaveStory,
    syncToCloud: syncToCloud,
    // Sync access for backwards compat
    _getLocalSaved: _getLocalSaved,
    _isSavedLocal: function(id) {
      return _getLocalSaved().some(function(s) { return String(s.id) === String(id); });
    }
  };
})();

window.XrayNewsSaved = XrayNewsSaved;
