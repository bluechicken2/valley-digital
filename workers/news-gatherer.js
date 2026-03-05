// ================================================
// XRAYNEWS — News Gatherer Worker v3
// Cloudflare Worker — runs every 15 minutes
// Sources: GDELT + 9 RSS feeds
// Features: cross-reference confidence, dedup by similarity,
//           event-type tracking, 50+ country detection
// ================================================

const SUPABASE_URL     = 'https://dkxydhuojaspmbpjfyoz.supabase.co';
const SUPABASE_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRreHlkaHVvamFzcG1icGpmeW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MDE3NTcsImV4cCI6MjA4NzM3Nzc1N30.6jwE5s6aekCDXALnrCK2hA1Lu3h3lbh7WqR9Io0lx8s';

// ---- RSS Sources ----
const RSS_SOURCES = [
  { name: 'Reuters',      url: 'https://feeds.reuters.com/reuters/topNews',              bias: 'center' },
  { name: 'BBC',          url: 'https://feeds.bbci.co.uk/news/world/rss.xml',             bias: 'center-left' },
  { name: 'AP News',      url: 'https://rsshub.app/apnews/topics/apf-intlnews',          bias: 'center' },
  { name: 'CNN',          url: 'https://rss.cnn.com/rss/edition_world.rss',              bias: 'center-left' },
  { name: 'Sky News',     url: 'https://feeds.skynews.com/feeds/rss/world.xml',          bias: 'center-right' },
  { name: 'Al Jazeera',  url: 'https://www.aljazeera.com/xml/rss/all.xml',              bias: 'center-left' },
  { name: 'DW News',     url: 'https://rss.dw.com/rdf/rss-en-world',                    bias: 'center' },
  { name: 'France24',    url: 'https://www.france24.com/en/rss',                        bias: 'center-left' },
  { name: 'Guardian',    url: 'https://www.theguardian.com/world/rss',                  bias: 'center-left' },
];

// ---- Country detection: name -> {code, lat, lng} ----
const COUNTRIES = [
  // Major conflict zones first for priority matching
  {k:'ukraine',       c:'UA', lat:49.0,  lng:31.0},
  {k:'russia',        c:'RU', lat:61.0,  lng:105.0},
  {k:'russian',       c:'RU', lat:61.0,  lng:105.0},
  {k:'kremlin',       c:'RU', lat:61.0,  lng:105.0},
  {k:'israel',        c:'IL', lat:31.0,  lng:35.2},
  {k:'israeli',       c:'IL', lat:31.0,  lng:35.2},
  {k:'gaza',          c:'PS', lat:31.4,  lng:34.3},
  {k:'palestine',     c:'PS', lat:31.9,  lng:35.2},
  {k:'hamas',         c:'PS', lat:31.4,  lng:34.3},
  {k:'hezbollah',     c:'LB', lat:33.9,  lng:35.5},
  {k:'lebanon',       c:'LB', lat:33.9,  lng:35.5},
  {k:'iran',          c:'IR', lat:32.4,  lng:53.7},
  {k:'iranian',       c:'IR', lat:32.4,  lng:53.7},
  {k:'tehran',        c:'IR', lat:35.7,  lng:51.4},
  {k:'syria',         c:'SY', lat:35.0,  lng:38.0},
  {k:'yemen',         c:'YE', lat:15.6,  lng:48.5},
  {k:'houthi',        c:'YE', lat:15.6,  lng:48.5},
  {k:'sudan',         c:'SD', lat:12.9,  lng:30.2},
  {k:'myanmar',       c:'MM', lat:21.9,  lng:95.9},
  {k:'haiti',         c:'HT', lat:18.9,  lng:-72.3},
  // NATO/West
  {k:'united states', c:'US', lat:38.0,  lng:-97.0},
  {k:'american',      c:'US', lat:38.0,  lng:-97.0},
  {k:'washington',    c:'US', lat:38.9,  lng:-77.0},
  {k:'white house',   c:'US', lat:38.9,  lng:-77.0},
  {k:'congress',      c:'US', lat:38.9,  lng:-77.0},
  {k:'pentagon',      c:'US', lat:38.9,  lng:-77.0},
  {k:'trump',         c:'US', lat:38.9,  lng:-77.0},
  {k:'biden',         c:'US', lat:38.9,  lng:-77.0},
  {k:'united kingdom',c:'GB', lat:55.4,  lng:-3.4},
  {k:'britain',       c:'GB', lat:55.4,  lng:-3.4},
  {k:'british',       c:'GB', lat:55.4,  lng:-3.4},
  {k:'london',        c:'GB', lat:51.5,  lng:-0.1},
  {k:'france',        c:'FR', lat:46.2,  lng:2.2},
  {k:'french',        c:'FR', lat:46.2,  lng:2.2},
  {k:'paris',         c:'FR', lat:48.9,  lng:2.3},
  {k:'germany',       c:'DE', lat:51.2,  lng:10.4},
  {k:'german',        c:'DE', lat:51.2,  lng:10.4},
  {k:'berlin',        c:'DE', lat:52.5,  lng:13.4},
  {k:'canada',        c:'CA', lat:56.1,  lng:-106.3},
  {k:'canadian',      c:'CA', lat:56.1,  lng:-106.3},
  {k:'ottawa',        c:'CA', lat:45.4,  lng:-75.7},
  {k:'australia',     c:'AU', lat:-25.3, lng:133.8},
  {k:'australian',    c:'AU', lat:-25.3, lng:133.8},
  {k:'poland',        c:'PL', lat:51.9,  lng:19.1},
  {k:'nato',          c:'BE', lat:50.8,  lng:4.4},
  {k:'european union',c:'BE', lat:50.8,  lng:4.4},
  {k:'italy',         c:'IT', lat:41.9,  lng:12.6},
  {k:'spain',         c:'ES', lat:40.5,  lng:-3.7},
  {k:'netherlands',   c:'NL', lat:52.1,  lng:5.3},
  {k:'sweden',        c:'SE', lat:60.1,  lng:18.6},
  {k:'finland',       c:'FI', lat:61.9,  lng:25.7},
  {k:'norway',        c:'NO', lat:60.5,  lng:8.5},
  // Asia Pacific
  {k:'china',         c:'CN', lat:35.9,  lng:104.2},
  {k:'chinese',       c:'CN', lat:35.9,  lng:104.2},
  {k:'beijing',       c:'CN', lat:39.9,  lng:116.4},
  {k:'taiwan',        c:'TW', lat:23.7,  lng:121.0},
  {k:'japan',         c:'JP', lat:36.2,  lng:138.3},
  {k:'japanese',      c:'JP', lat:36.2,  lng:138.3},
  {k:'tokyo',         c:'JP', lat:35.7,  lng:139.7},
  {k:'south korea',   c:'KR', lat:35.9,  lng:127.8},
  {k:'north korea',   c:'KP', lat:40.3,  lng:127.5},
  {k:'kim jong',      c:'KP', lat:40.3,  lng:127.5},
  {k:'india',         c:'IN', lat:20.6,  lng:79.1},
  {k:'indian',        c:'IN', lat:20.6,  lng:79.1},
  {k:'new delhi',     c:'IN', lat:28.6,  lng:77.2},
  {k:'pakistan',      c:'PK', lat:30.4,  lng:69.3},
  {k:'indonesia',     c:'ID', lat:-0.8,  lng:113.9},
  {k:'philippines',   c:'PH', lat:12.9,  lng:121.8},
  {k:'thailand',      c:'TH', lat:15.9,  lng:100.9},
  {k:'vietnam',       c:'VN', lat:14.1,  lng:108.3},
  {k:'bangladesh',    c:'BD', lat:23.7,  lng:90.4},
  // Middle East
  {k:'saudi arabia',  c:'SA', lat:23.9,  lng:45.1},
  {k:'saudi',         c:'SA', lat:23.9,  lng:45.1},
  {k:'riyadh',        c:'SA', lat:24.7,  lng:46.7},
  {k:'turkey',        c:'TR', lat:38.96, lng:35.2},
  {k:'turkish',       c:'TR', lat:38.96, lng:35.2},
  {k:'erdogan',       c:'TR', lat:39.9,  lng:32.9},
  {k:'iraq',          c:'IQ', lat:33.2,  lng:43.7},
  {k:'baghdad',       c:'IQ', lat:33.3,  lng:44.4},
  {k:'egypt',         c:'EG', lat:26.8,  lng:30.8},
  {k:'qatar',         c:'QA', lat:25.4,  lng:51.2},
  {k:'jordan',        c:'JO', lat:30.6,  lng:36.2},
  // Americas
  {k:'mexico',        c:'MX', lat:23.6,  lng:-102.6},
  {k:'mexican',       c:'MX', lat:23.6,  lng:-102.6},
  {k:'brazil',        c:'BR', lat:-14.2, lng:-51.9},
  {k:'brazilian',     c:'BR', lat:-14.2, lng:-51.9},
  {k:'argentina',     c:'AR', lat:-38.4, lng:-63.6},
  {k:'venezuela',     c:'VE', lat:6.4,   lng:-66.6},
  {k:'colombia',      c:'CO', lat:4.6,   lng:-74.3},
  {k:'chile',         c:'CL', lat:-35.7, lng:-71.5},
  // Africa
  {k:'nigeria',       c:'NG', lat:9.1,   lng:8.7},
  {k:'south africa',  c:'ZA', lat:-30.6, lng:22.9},
  {k:'ethiopia',      c:'ET', lat:9.1,   lng:40.5},
  {k:'kenya',         c:'KE', lat:0.02,  lng:37.9},
  {k:'libya',         c:'LY', lat:26.3,  lng:17.2},
  {k:'mali',          c:'ML', lat:17.6,  lng:-2.0},
  {k:'somalia',       c:'SO', lat:5.2,   lng:46.2},
  {k:'congo',         c:'CD', lat:-4.0,  lng:21.8},
  {k:'mozambique',    c:'MZ', lat:-18.7, lng:35.5},
];

// ---- Category detection ----
const CATEGORIES = [
  { name: 'War & Conflict',     keys: ['war','attack','missile','airstrike','troops','military','bomb','invasion','occupation','ceasefire','offensive','killed','wounded','combat','soldier','artillery','drone strike','battlefield','siege','frontline'] },
  { name: 'Elections',          keys: ['election','vote','ballot','polling','referendum','campaign','political party','primary','candidate','democracy','voter','recount','inauguration'] },
  { name: 'Weather & Disaster', keys: ['hurricane','earthquake','flood','tornado','typhoon','cyclone','tsunami','drought','wildfire','storm','blizzard','heatwave','disaster','eruption','avalanche','landslide'] },
  { name: 'Economy',            keys: ['economy','gdp','inflation','recession','trade','tariff','sanction','market','stock','oil price','interest rate','unemployment','bank','currency','imf','debt','fed rate','trade war','financial'] },
  { name: 'Politics',           keys: ['president','prime minister','parliament','government','summit','diplomatic','treaty','sanctions','senate','minister','chancellor','congress','legislation','policy','diplomat'] },
  { name: 'Health',             keys: ['pandemic','outbreak','virus','vaccine','epidemic','who','health','disease','hospital','death toll','medical','variant','pathogen','quarantine','public health'] },
  { name: 'Science & Tech',     keys: ['nasa','space','climate','artificial intelligence','nuclear','technology','satellite','launch','research','discovery','rocket','spacecraft','ai model','quantum','genome','cern'] },
  { name: 'Environment',        keys: ['climate change','emissions','carbon','deforestation','coral reef','arctic','glacier','pollution','renewable','solar','wind farm','net zero','species','biodiversity','plastic'] },
];

// ---- Content filter (block junk) ----
const BLOCK_KEYWORDS = [
  'kardashian','taylor swift','beyonce','celebrity','grammy','oscar','emmy','bachelorette',
  'reality tv','bachelor','dancing with','american idol','got talent','x factor',
  'recipe','cookbook','fashion week','runway','horoscope','astrology','lottery winner',
  'sports score','nfl draft','nba trade','mlb','nhl game','fifa',
  'tiktok trend','instagram','influencer','viral video','meme','gossip',
  'deadliest catch','duck dynasty','survivor episode','big brother',
];

// ---- Fetch with timeout ----
async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    return r;
  } catch(e) {
    clearTimeout(tid);
    throw e;
  }
}

// ---- Parse RSS ----
function parseRSS(xml, sourceName) {
  const items = [];
  const re = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const getTag = (t) => {
      const tm = block.match(new RegExp('<' + t + '[^>]*>(?:<\\!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/' + t + '>'));
      return tm ? tm[1].trim() : '';
    };
    const title = getTag('title').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
    const desc  = getTag('description').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
    const link  = getTag('link') || getTag('guid');
    const pub   = getTag('pubDate') || getTag('dc:date') || new Date().toISOString();
    if (title && title.length > 10) items.push({ title, desc, link, pub, source: sourceName });
  }
  return items;
}

// ---- Detect country ----
function detectCountry(text) {
  const t = text.toLowerCase();
  for (const c of COUNTRIES) {
    if (t.includes(c.k)) return c;
  }
  return null;
}

// ---- Detect category ----
function detectCategory(text) {
  const t = text.toLowerCase();
  for (const cat of CATEGORIES) {
    for (const kw of cat.keys) {
      if (t.includes(kw)) return cat.name;
    }
  }
  return 'politics';
}

// ---- Check if junk ----
function isJunk(text) {
  const t = text.toLowerCase();
  return BLOCK_KEYWORDS.some(k => t.includes(k));
}

// ---- Headline similarity (Jaccard on word sets) ----
function similarity(a, b) {
  const setA = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const setB = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  let inter = 0;
  for (const w of setA) { if (setB.has(w)) inter++; }
  const union = setA.size + setB.size - inter;
  return union > 0 ? inter / union : 0;
}

// ---- Confidence score ----
function calcConfidence(item, allItems) {
  let score = 30; // base
  const text = (item.title + ' ' + item.desc).toLowerCase();

  // Cross-source corroboration — biggest trust signal
  const matches = allItems.filter(other =>
    other.source !== item.source && similarity(item.title, other.title) > 0.25
  );
  const uniqueSources = new Set(matches.map(m => m.source));
  score += Math.min(35, uniqueSources.size * 12); // +12 per corroborating source, max +35

  // Source trust weights
  const SOURCE_TRUST = { 'Reuters':8, 'AP News':8, 'DW News':6, 'BBC':6, 'Guardian':5, 'France24':5, 'Al Jazeera':4, 'CNN':4, 'Sky News':4 };
  score += SOURCE_TRUST[item.source] || 3;

  // Has a real description
  if (item.desc && item.desc.length > 80) score += 5;

  // Breaking/developing = lower confidence (more uncertain)
  if (/breaking|developing|just in/i.test(item.title)) score -= 8;

  // Quotes official source = higher confidence
  if (/says|confirms|announces|according to|official/i.test(text)) score += 7;

  // Sensational language = lower confidence
  if (/claims|alleged|rumor|unconfirmed|sources say/i.test(text)) score -= 10;

  return Math.min(98, Math.max(10, Math.round(score)));
}

// ---- Status from confidence ----
function getStatus(score) {
  if (score >= 75) return 'verified';
  if (score >= 45) return 'unverified';
  return 'contested';
}

// ---- Fetch one RSS source ----
async function fetchSource(src) {
  try {
    const r = await fetchWithTimeout(src.url, 7000);
    if (!r.ok) return [];
    const xml = await r.text();
    return parseRSS(xml, src.name).slice(0, 15);
  } catch(e) {
    console.log('[Worker] ' + src.name + ' failed: ' + e.message);
    return [];
  }
}

// ---- Fetch GDELT ----
async function fetchGDELT() {
  try {
    const url = 'https://api.gdeltproject.org/api/v2/doc/doc?query=war+election+conflict&mode=artlist&maxrecords=20&format=json&timespan=60&sourcelang=english';
    const r = await fetchWithTimeout(url, 8000);
    if (!r.ok) return [];
    const j = await r.json();
    return (j.articles || []).map(a => ({
      title:  a.title   || '',
      desc:   a.seendate || '',
      link:   a.url     || '',
      pub:    a.seendate || new Date().toISOString(),
      source: 'GDELT'
    })).filter(a => a.title.length > 10);
  } catch(e) {
    console.log('[Worker] GDELT failed:', e.message);
    return [];
  }
}

// ---- Supabase insert ----
async function insertStory(story) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/stories', {
    method: 'POST',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=ignore-duplicates,return=minimal'
    },
    body: JSON.stringify(story)
  });
  return r.status;
}

// ---- Main handler ----
export default {
  async scheduled(event, env, ctx) {
    console.log('[XrayNews Worker v3] Starting gather cycle...');

    // Fetch all sources in parallel
    const [gdelt, ...rssResults] = await Promise.allSettled([
      fetchGDELT(),
      ...RSS_SOURCES.map(src => fetchSource(src))
    ]);

    const gdeltItems = gdelt.status === 'fulfilled' ? gdelt.value : [];
    const rssItems   = rssResults.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    const allItems   = [...gdeltItems, ...rssItems];

    console.log('[Worker] Raw items:', allItems.length);

    // Dedup by headline similarity
    const seen = [];
    const deduped = allItems.filter(item => {
      if (isJunk(item.title + ' ' + item.desc)) return false;
      if (!item.title || item.title.length < 15) return false;
      // Check against already-seen headlines
      for (const s of seen) {
        if (similarity(item.title, s) > 0.55) return false;
      }
      seen.push(item.title);
      return true;
    });

    console.log('[Worker] After dedup:', deduped.length);

    let stored = 0, errors = 0, skipped = 0;

    for (const item of deduped) {
      const text    = item.title + ' ' + item.desc;
      const country = detectCountry(text);

      if (!country) { skipped++; continue; } // Skip if no country detected

      const category  = detectCategory(text);
      const confidence = calcConfidence(item, allItems);
      const status    = getStatus(confidence);
      const isBreaking = /breaking|urgent|alert/i.test(item.title);

      // Source count = number of other sources with similar headline
      const sourceMatches = allItems.filter(o =>
        o.source !== item.source && similarity(item.title, o.title) > 0.25
      );
      const sourceCount = 1 + new Set(sourceMatches.map(m => m.source)).size;

      const story = {
        headline:         item.title.slice(0, 255),
        summary:          (item.desc || item.title).slice(0, 500),
        category:         category,
        country_code:     country.c,
        country_name:     country.k.charAt(0).toUpperCase() + country.k.slice(1),
        latitude:         country.lat,
        longitude:        country.lng,
        confidence_score: confidence,
        status:           status,
        is_breaking:      isBreaking,
        source_count:     sourceCount,
        sources:          [item.source, ...sourceMatches.slice(0,4).map(m => m.source)].filter((v,i,a)=>a.indexOf(v)===i),
        external_url:     item.link || null,
        created_at:       new Date().toISOString()
      };

      try {
        const status_code = await insertStory(story);
        if (status_code === 201) stored++;
        else if (status_code === 409) skipped++; // duplicate
        else errors++;
      } catch(e) {
        errors++;
        console.log('[Worker] Insert error:', e.message);
      }
    }

    console.log('[Worker] Done — stored:', stored, 'skipped:', skipped, 'errors:', errors);
  },

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', version: 3, timestamp: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.pathname === '/gather') {
      // Manual trigger endpoint
      let stored = 0, errors = 0, skipped = 0;
      const [gdelt, ...rssResults] = await Promise.allSettled([
        fetchGDELT(),
        ...RSS_SOURCES.map(src => fetchSource(src))
      ]);
      const gdeltItems = gdelt.status === 'fulfilled' ? gdelt.value : [];
      const rssItems   = rssResults.flatMap(r => r.status === 'fulfilled' ? r.value : []);
      const allItems   = [...gdeltItems, ...rssItems];
      const seen = [];
      const deduped = allItems.filter(item => {
        if (isJunk(item.title + ' ' + item.desc)) return false;
        if (!item.title || item.title.length < 15) return false;
        for (const s of seen) { if (similarity(item.title, s) > 0.55) return false; }
        seen.push(item.title);
        return true;
      });
      for (const item of deduped) {
        const text = item.title + ' ' + item.desc;
        const country = detectCountry(text);
        if (!country) { skipped++; continue; }
        const category = detectCategory(text);
        const confidence = calcConfidence(item, allItems);
        const status = getStatus(confidence);
        const isBreaking = /breaking|urgent|alert/i.test(item.title);
        const sourceMatches = allItems.filter(o => o.source !== item.source && similarity(item.title, o.title) > 0.25);
        const sourceCount = 1 + new Set(sourceMatches.map(m => m.source)).size;
        const story = {
          headline: item.title.slice(0, 255), summary: (item.desc || item.title).slice(0, 500),
          category, country_code: country.c, country_name: country.k.charAt(0).toUpperCase() + country.k.slice(1),
          latitude: country.lat, longitude: country.lng,
          confidence_score: confidence, status, is_breaking: isBreaking,
          source_count: sourceCount,
          sources: [item.source, ...sourceMatches.slice(0,4).map(m => m.source)].filter((v,i,a)=>a.indexOf(v)===i),
          external_url: item.link || null, created_at: new Date().toISOString()
        };
        try {
          const sc = await insertStory(story);
          if (sc === 201) stored++; else if (sc === 409) skipped++; else errors++;
        } catch(e) { errors++; }
      }
      return new Response(JSON.stringify({ raw: allItems.length, deduped: deduped.length, stored, skipped, errors }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('XrayNews Gatherer v3', { status: 200 });
  }
};
