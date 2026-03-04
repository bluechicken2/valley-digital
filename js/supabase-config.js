// ================================================
// GLOBEWATCH - Supabase Configuration
// ================================================

var SUPABASE_URL      = 'https://dkxydhuojaspmbpjfyoz.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRreHlkaHVvamFzcG1icGpmeW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MDE3NTcsImV4cCI6MjA4NzM3Nzc1N30.6jwE5s6aekCDXALnrCK2hA1Lu3h3lbh7WqR9Io0lx8s';

// ------------------------------------------------
// GlobeWatchDB  — thin wrapper around REST + Realtime
// ------------------------------------------------
class GlobeWatchDB {
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
    var limit  = filters.limit  || 100;
    var status = filters.status || null;
    var cat    = filters.category || null;
    var params = new URLSearchParams();
    params.set('select', '*');
    params.set('order',  'created_at.desc');
    params.set('limit',  String(limit));
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
        ws.send(JSON.stringify({topic:'realtime:public:stories',event:'phx_join',payload:{},ref:'1'}));
      };
      ws.onmessage = function(e) {
        try {
          var msg = JSON.parse(e.data);
          if (msg.event === 'INSERT' || msg.event === 'UPDATE' || msg.event === 'DELETE') {
            var record = (msg.payload && msg.payload.record) || (msg.payload && msg.payload.old_record) || {};
            self._realtimeCbs.forEach(function(cb) { try { cb(record, msg.event); } catch(err){} });
          }
          if (msg.event === 'phx_reply' && msg.payload && msg.payload.status !== 'ok') {
            console.warn('[GlobeWatchDB] Realtime join issue:', msg.payload.response);
          }
        } catch(err) { console.warn('[GlobeWatchDB] WS parse error:', err); }
      };
      ws.onerror = function(err) { console.warn('[GlobeWatchDB] WebSocket error', err); };
      ws.onclose = function() {
        self._realtimeWs = null;
        setTimeout(function() { if (self._realtimeCbs.length) self.subscribeToStories(function(){}); }, 5000);
      };
    } catch(err) {
      console.warn('[GlobeWatchDB] WebSocket not available:', err.message);
    }
    return function unsubscribe() {
      self._realtimeCbs = self._realtimeCbs.filter(function(c){return c!==callback;});
    };
  }
}

window.GlobeWatchDB = new GlobeWatchDB();
