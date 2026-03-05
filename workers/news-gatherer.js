
// ================================================
// XrayNews Intelligence Gatherer v5.1
// Architecture: Worker = fast headline grab only. Xray = article fetch + verification.
// Schedule: Every 5 minutes
// Sources: Reuters, BBC, AP, CNN, Sky, AlJazeera, DW, France24, Guardian, GDELT
// Features: Article body fetching, cross-source corroboration, dedup, Xray-ready
// ================================================

const SUPABASE_URL = 'https://dkxydhuojaspmbpjfyoz.supabase.co';
const MAX_STORIES_PER_RUN = 25;
const ARTICLE_FETCH_TIMEOUT = 4000; // 4s max per article fetch
const MAX_FULL_TEXT_CHARS = 2000;   // store first 2000 chars for Xray

// ---- RSS Sources -------------------------------------------------------
const RSS_SOURCES = [
  // Tier 1 — reliable, open, bot-friendly
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml',         name: 'BBC News',     tier: 1 },
  { url: 'https://feeds.theguardian.com/theguardian/world/rss',  name: 'The Guardian', tier: 1 },
  { url: 'https://feeds.npr.org/1004/rss.xml',                   name: 'NPR World',    tier: 1 },
  // Tier 2 — international multi-region
  { url: 'https://www.aljazeera.com/xml/rss/all.xml',            name: 'Al Jazeera',   tier: 2 },
  { url: 'https://rss.dw.com/rdf/rss-en-world',                  name: 'DW News',      tier: 2 },
  { url: 'https://www.france24.com/en/rss?format=xml',           name: 'France24',     tier: 2 },
  { url: 'https://feeds.skynews.com/feeds/rss/world.xml',        name: 'Sky News',     tier: 2 },
  { url: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml',          name: 'WSJ World',    tier: 1 },
  { url: 'https://www.euronews.com/rss',                         name: 'Euronews',     tier: 2 },
  { url: 'https://www.rfi.fr/en/rss',                            name: 'RFI',          tier: 2 },
];

// ---- Content Filter Keywords -------------------------------------------
const JUNK_PATTERNS = [
  /(bachelor|bachelorette|kardashian|taylor swift|beyonc|celebrity|gossip|reality tv|deadliest catch|survivor|big brother|american idol|dancing with|real housewives|keeping up with)/i,
  /(nfl|nba|nhl|mlb|premier league|champions league|world cup|super bowl|march madness|oscars|grammys|emmys|golden globes|box office|blockbuster)/i,
  /(recipe|cooking show|food network|tiktok trend|instagram|influencer|fashion week|horoscope|zodiac|lottery winner|viral video|meme)/i,
  /(album release|concert tour|movie review|tv show|netflix series|streaming|podcast episode)/i,
];

// ---- Country Detection -------------------------------------------------
const COUNTRY_MAP = {
  // Tier 1 — Active conflicts / major players
  ukraine: { code: "UA", name: "Ukraine", lat: 49.0, lng: 31.0 },
  russia: { code: "RU", name: "Russia", lat: 61.5, lng: 90.0 },
  israel: { code: "IL", name: "Israel", lat: 31.0, lng: 35.0 },
  gaza: { code: "PS", name: "Palestine", lat: 31.9, lng: 35.2 },
  palestine: { code: "PS", name: "Palestine", lat: 31.9, lng: 35.2 },
  hamas: { code: "PS", name: "Palestine", lat: 31.9, lng: 35.2 },
  hezbollah: { code: "LB", name: "Lebanon", lat: 33.9, lng: 35.5 },
  lebanon: { code: "LB", name: "Lebanon", lat: 33.9, lng: 35.5 },
  iran: { code: "IR", name: "Iran", lat: 32.4, lng: 53.7 },
  syria: { code: "SY", name: "Syria", lat: 34.8, lng: 38.9 },
  yemen: { code: "YE", name: "Yemen", lat: 15.6, lng: 48.5 },
  sudan: { code: "SD", name: "Sudan", lat: 12.8, lng: 30.2 },
  myanmar: { code: "MM", name: "Myanmar", lat: 21.9, lng: 95.9 },
  // Major economies
  china: { code: "CN", name: "China", lat: 35.9, lng: 104.2 },
  "united states": { code: "US", name: "United States", lat: 37.1, lng: -95.7 },
  american: { code: "US", name: "United States", lat: 37.1, lng: -95.7 },
  washington: { code: "US", name: "United States", lat: 37.1, lng: -95.7 },
  pentagon: { code: "US", name: "United States", lat: 37.1, lng: -95.7 },
  trump: { code: "US", name: "United States", lat: 37.1, lng: -95.7 },
  biden: { code: "US", name: "United States", lat: 37.1, lng: -95.7 },
  congress: { code: "US", name: "United States", lat: 37.1, lng: -95.7 },
  germany: { code: "DE", name: "Germany", lat: 51.2, lng: 10.4 },
  france: { code: "FR", name: "France", lat: 46.2, lng: 2.2 },
  "united kingdom": { code: "GB", name: "United Kingdom", lat: 55.4, lng: -3.4 },
  british: { code: "GB", name: "United Kingdom", lat: 55.4, lng: -3.4 },
  london: { code: "GB", name: "United Kingdom", lat: 55.4, lng: -3.4 },
  japan: { code: "JP", name: "Japan", lat: 36.2, lng: 138.3 },
  india: { code: "IN", name: "India", lat: 20.6, lng: 79.1 },
  brazil: { code: "BR", name: "Brazil", lat: -14.2, lng: -51.9 },
  canada: { code: "CA", name: "Canada", lat: 56.1, lng: -106.3 },
  australia: { code: "AU", name: "Australia", lat: -25.3, lng: 133.8 },
  // Middle East
  iraq: { code: "IQ", name: "Iraq", lat: 33.2, lng: 43.7 },
  saudi: { code: "SA", name: "Saudi Arabia", lat: 23.9, lng: 45.1 },
  turkey: { code: "TR", name: "Turkey", lat: 38.9, lng: 35.2 },
  egypt: { code: "EG", name: "Egypt", lat: 26.8, lng: 30.8 },
  pakistan: { code: "PK", name: "Pakistan", lat: 30.4, lng: 69.3 },
  afghanistan: { code: "AF", name: "Afghanistan", lat: 33.9, lng: 67.7 },
  // Africa
  ethiopia: { code: "ET", name: "Ethiopia", lat: 9.1, lng: 40.5 },
  congo: { code: "CD", name: "DR Congo", lat: -4.0, lng: 21.8 },
  somalia: { code: "SO", name: "Somalia", lat: 5.2, lng: 46.2 },
  nigeria: { code: "NG", name: "Nigeria", lat: 9.1, lng: 8.7 },
  kenya: { code: "KE", name: "Kenya", lat: -0.0, lng: 37.9 },
  libya: { code: "LY", name: "Libya", lat: 26.3, lng: 17.2 },
  mali: { code: "ML", name: "Mali", lat: 17.6, lng: -4.0 },
  // Europe
  poland: { code: "PL", name: "Poland", lat: 51.9, lng: 19.1 },
  nato: { code: "BE", name: "NATO/Belgium", lat: 50.8, lng: 4.5 },
  european: { code: "BE", name: "European Union", lat: 50.8, lng: 4.5 },
  hungary: { code: "HU", name: "Hungary", lat: 47.2, lng: 19.5 },
  serbia: { code: "RS", name: "Serbia", lat: 44.0, lng: 21.0 },
  // Asia
  "north korea": { code: "KP", name: "North Korea", lat: 40.3, lng: 127.5 },
  "south korea": { code: "KR", name: "South Korea", lat: 35.9, lng: 127.8 },
  taiwan: { code: "TW", name: "Taiwan", lat: 23.7, lng: 121.0 },
  philippines: { code: "PH", name: "Philippines", lat: 12.9, lng: 121.8 },
  indonesia: { code: "ID", name: "Indonesia", lat: -0.8, lng: 113.9 },
  thailand: { code: "TH", name: "Thailand", lat: 15.9, lng: 100.9 },
  vietnam: { code: "VN", name: "Vietnam", lat: 14.1, lng: 108.3 },
  bangladesh: { code: "BD", name: "Bangladesh", lat: 23.7, lng: 90.4 },
  // Americas
  mexico: { code: "MX", name: "Mexico", lat: 23.6, lng: -102.6 },
  venezuela: { code: "VE", name: "Venezuela", lat: 6.4, lng: -66.6 },
  colombia: { code: "CO", name: "Colombia", lat: 4.6, lng: -74.3 },
  argentina: { code: "AR", name: "Argentina", lat: -38.4, lng: -63.6 },
  haiti: { code: "HT", name: "Haiti", lat: 18.9, lng: -72.3 },
  cuba: { code: "CU", name: "Cuba", lat: 21.5, lng: -79.3 },
};

// ---- Category Detection ------------------------------------------------
const CATEGORY_MAP = [
  { name: "War & Conflict",     icon: "⚔️",  color: "#ff4444",
    terms: [/(war|attack|strike|military|troops|bomb|missile|killed|wounded|ceasefire|invasion|offensive|drone|airstrike|casualties|shelling|frontline|combat|battle|siege|sniper|artillery|armored|munitions)/i] },
  { name: "Elections",          icon: "🗳️",  color: "#4488ff",
    terms: [/(election|vote|ballot|polling|candidate|president|parliament|congress|senate|referendum|campaign|inauguration|primary|runoff|democracy|electoral)/i] },
  { name: "Weather & Disaster", icon: "🌊",  color: "#ffaa00",
    terms: [/(hurricane|typhoon|earthquake|flood|tornado|wildfire|tsunami|drought|volcano|storm|disaster|cyclone|blizzard|avalanche|landslide|magnitude|tremor)/i] },
  { name: "Economy",            icon: "📈",  color: "#00d4ff",
    terms: [/(gdp|inflation|recession|trade|tariff|sanctions|bank|currency|markets|stocks|bonds|interest rate|imf|world bank|economic|deficit|surplus|debt|unemployment|fed|central bank)/i] },
  { name: "Science & Tech",     icon: "🔬",  color: "#00ff88",
    terms: [/(nasa|spacex|satellite|rocket|iss|orbit|launch|climate|ai|artificial intelligence|nuclear|quantum|genome|vaccine|research|discovery|asteroid|probe|telescope)/i] },
  { name: "Health",             icon: "🏥",  color: "#ff69b4",
    terms: [/(pandemic|outbreak|virus|disease|epidemic|who|health|hospital|medical|vaccine|treatment|pathogen|quarantine|mortality|infection|variant|mpox|covid|ebola)/i] },
  { name: "Politics",           icon: "🏛️",  color: "#7b2fff",
    terms: [/(president|prime minister|government|parliament|minister|diplomacy|treaty|summit|sanctions|protest|coup|overthrow|assassination|rally|opposition|regime)/i] },
  { name: "Environment",        icon: "🌿",  color: "#44ff88",
    terms: [/(climate change|deforestation|pollution|carbon|emissions|biodiversity|species|coral|glacier|arctic|amazon|fossil fuel|renewable|solar|wind energy|cop[0-9])/i] },
];

// ---- Source Reputation -------------------------------------------------
const SOURCE_REPUTATION = {
  'BBC News': 92, 'NPR World': 88, 'The Guardian': 85, 'WSJ World': 90,
  'Al Jazeera': 78, 'DW News': 82, 'France24': 80,
  'Sky News': 74, 'Euronews': 76, 'RFI': 74,
};

// ---- Utilities ---------------------------------------------------------
function parseXML(text) {
  const items = [];
  // Strip CDATA wrappers before parsing — avoids RegExp constructor escape pitfalls in CF Workers V8
  const t = text.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '');
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(t)) !== null) {
    const block = m[1];
    const get = function(tag) {
      const r = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'i');
      const rm = r.exec(block);
      if (!rm) return '';
      return rm[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#[0-9]+;/g, '')
        .replace(/\s+/g, ' ').trim();
    };
    const title = get('title'), desc = get('description'), link = get('link'), pubDate = get('pubDate');
    if (title && title.length > 10) items.push({ title, desc, link, pubDate });
  }
  return items;
}

function isJunk(text) {
  return JUNK_PATTERNS.some(p => p.test(text));
}

function detectCountry(text) {
  const lower = text.toLowerCase();
  for (const [keyword, data] of Object.entries(COUNTRY_MAP)) {
    if (lower.includes(keyword)) return data;
  }
  return null;
}

function detectCategory(text) {
  const lower = text.toLowerCase();
  for (const cat of CATEGORY_MAP) {
    if (cat.terms.some(re => re.test(lower))) return cat;
  }
  return { name: 'Politics', icon: '🏛️', color: '#7b2fff' };
}

function jaccardSimilarity(a, b) {
  const sa = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const sb = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  let inter = 0;
  sa.forEach(w => { if (sb.has(w)) inter++; });
  return inter / (sa.size + sb.size - inter || 1);
}

function normalizeHeadline(h) {
  return h.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// ---- Article Body Fetcher ----------------------------------------------
async function fetchArticleText(url) {
  if (!url || !url.startsWith('http')) return null;
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), ARTICLE_FETCH_TIMEOUT);
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; XrayNewsBot/1.0; +https://ottawav.com)' }
    });
    clearTimeout(tid);
    if (!resp.ok) return null;
    const html = await resp.text();
    // Extract body text — strip tags, scripts, styles
    const clean = html
      .replace(/<script[\s\S]*?<\/script>/gi, '' )
      .replace(/<style[\s\S]*?<\/style>/gi, '' )
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ')
      .trim();
    return clean.substring(0, MAX_FULL_TEXT_CHARS) || null;
  } catch {
    return null;
  }
}

// ---- Confidence Scoring ------------------------------------------------
function scoreConfidence(story, allItems) {
  let score = 40;
  const rep = SOURCE_REPUTATION[story.sourceName] || 55;
  score += Math.round((rep - 55) / 4); // source reputation weight

  // Cross-source corroboration
  const corroborated = allItems.filter(item =>
    item.sourceName !== story.sourceName &&
    jaccardSimilarity(item.title, story.headline) > 0.3
  );
  score += Math.min(corroborated.length * 12, 36); // up to 3 extra sources

  // Content signals
  const text = (story.headline + ' ' + story.summary).toLowerCase();
  if (/\b(official|confirmed|announced|statement|government said|ministry|president said|spokesperson)\b/.test(text)) score += 8;
  if (/\b(according to|sources say|reportedly|unconfirmed|alleged|claims|could|might|may have)\b/.test(text)) score -= 10;
  if (/\b(breaking|urgent|exclusive|developing)\b/.test(text)) score += 3;
  if (story.full_text && story.full_text.length > 500) score += 5; // article fetched

  return Math.max(5, Math.min(99, score));
}

// ---- Supabase Helpers --------------------------------------------------
async function supabase(env, method, path, body) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'resolution=ignore-duplicates' : 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => resp.statusText);
    throw new Error(`Supabase ${resp.status}: ${err}`);
  }
  const ct = resp.headers.get('Content-Type') || '';
  return ct.includes('json') ? resp.json() : null;
}

async function getExistingHeadlines(env) {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const rows = await supabase(env, 'GET',
    `/stories?select=headline,id&created_at=gte.${cutoff}&limit=500`);
  return rows || [];
}

// ---- Main Gather -------------------------------------------------------
async function gatherNews(env) {
  const log = [];
  const allRawItems = [];

  // Fetch all RSS sources in parallel
  const fetches = RSS_SOURCES.map(src =>
    fetch(src.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; XrayNewsBot/1.0)' },
      signal: AbortSignal.timeout(6000)
    })
    .then(r => r.text())
    .then(xml => ({ src, items: parseXML(xml) }))
    .catch(err => ({ src, items: [], error: err.message }))
  );

  const results = await Promise.allSettled(fetches);
  for (const res of results) {
    if (res.status === 'fulfilled' && res.value.items.length) {
      const { src, items } = res.value;
      for (const item of items.slice(0, 25)) {
        allRawItems.push({ ...item, sourceName: src.name, sourceTier: src.tier });
      }
      log.push(`✓ ${src.name}: ${items.length} items`);
    } else {
      const src = res.value?.src || { name: 'unknown' };
      log.push(`✗ ${src.name}: ${res.reason?.message || res.value?.error || 'failed'}`);
    }
  }

  log.push(`Total raw items: ${allRawItems.length}`);

  // Filter junk
  const clean = allRawItems.filter(i => !isJunk(i.title + ' ' + i.desc));
  log.push(`After junk filter: ${clean.length}`);

  // Get existing headlines for dedup
  const existing = await getExistingHeadlines(env);
  const existingHeadlines = existing.map(r => r.headline);

  // Dedup and build story candidates
  const seen = new Set();
  const candidates = [];

  for (const item of clean) {
    if (!item.title || item.title.length < 15) continue;
    const norm = normalizeHeadline(item.title);

    // Skip near-duplicates against existing DB stories
    const dupInDB = existingHeadlines.some(h => jaccardSimilarity(h, item.title) > 0.55);
    if (dupInDB) continue;

    // Skip near-duplicates within this batch
    let dupInBatch = false;
    for (const s of seen) {
      if (jaccardSimilarity(s, norm) > 0.5) { dupInBatch = true; break; }
    }
    if (dupInBatch) continue;
    seen.add(norm);

    const country = detectCountry(item.title + ' ' + item.desc);
    if (!country) continue; // skip non-geographic stories
    if (country.code === 'XX') continue;
    if (country.lat === 0 && country.lng === 0) continue;

    const cat = detectCategory(item.title + ' ' + item.desc);
    const isBreaking = /\b(breaking|urgent|alert)\b/i.test(item.title);

    candidates.push({
      headline: item.title.substring(0, 300),
      summary: (item.desc || '').replace(/<[^>]+>/g, '').substring(0, 500),
      external_url: item.link,
      country_code: country.code,
      country_name: country.name,
      lat: country.lat,
      lng: country.lng,
      category: cat.name,
      category_icon: cat.icon,
      category_color: cat.color,
      status: 'unverified',
      is_breaking: isBreaking,
      source_count: 1,
      article_fetched: false,
      sourceName: item.sourceName, // temp, not stored
      sourceTier: item.sourceTier, // temp, not stored
    });
  }

  log.push(`Candidates after dedup+geo: ${candidates.length}`);

  // Limit to max stories per run
  const toProcess = candidates.slice(0, MAX_STORIES_PER_RUN);

  // Count cross-source corroboration
  for (const story of toProcess) {
    const corr = allRawItems.filter(i =>
      i.sourceName !== story.sourceName &&
      jaccardSimilarity(i.title, story.headline) > 0.3
    );
    story.source_count = 1 + corr.length;
  }

  // Article body fetching is handled by Xray during verification
  // Worker stays under CF 50-subrequest limit: 10 RSS + 1 Supabase insert = 11 total
  const enriched = toProcess;
  const fetched = 0;
  log.push(`Stories ready for Xray verification: ${enriched.length}`);

  // Score confidence
  const toInsert = enriched.map(story => {
    const score = scoreConfidence(story, allRawItems);
    const { sourceName, sourceTier, ...clean } = story; // strip temp fields
    return { ...clean, confidence_score: score };
  });

  // Insert to Supabase
  // Base columns always present in schema
  const BASE_COLS = ['headline','summary','country_code','country_name','lat','lng',
    'category','category_icon','category_color','confidence_score','is_breaking',
    'source_count','status'];
  // Extended columns (added in migration v2) — included if present in schema
  const EXT_COLS  = ['external_url','full_text','xray_verdict','xray_score',
    'story_thread_id','article_fetched'];

  let inserted = 0;
  if (toInsert.length > 0) {
    // Try full insert with extended columns first
    try {
      await supabase(env, 'POST', '/stories', toInsert);
      inserted = toInsert.length;
      log.push(`✓ Inserted: ${inserted} stories (full schema)`);
    } catch (err) {
      if (err.message.includes('column') && err.message.includes('does not exist')) {
        // Migration v2 not run yet — fall back to base columns only
        log.push(`⚠ Extended cols missing, falling back to base schema`);
        const baseInsert = toInsert.map(s => {
          const o = {};
          BASE_COLS.forEach(k => { if (s[k] !== undefined) o[k] = s[k]; });
          return o;
        });
        try {
          await supabase(env, 'POST', '/stories', baseInsert);
          inserted = baseInsert.length;
          log.push(`✓ Inserted: ${inserted} stories (base schema)`);
        } catch (err2) {
          log.push(`✗ Insert error: ${err2.message}`);
        }
      } else {
        log.push(`✗ Insert error: ${err.message}`);
      }
    }
  }

  return { inserted, fetched, log };
}

// ---- Worker Entry ------------------------------------------------------
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(gatherNews(env).catch(err => console.error('Gather failed:', err)));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'xraynews-gatherer', version: 'v5.1' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    if (url.pathname === '/gather') {
      const result = await gatherNews(env);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    return new Response('XrayNews Gatherer v4 — OK', { status: 200 });
  }
};
