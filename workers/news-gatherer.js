// ================================================
// XrayNews Intelligence Gatherer v5.3
// Architecture: Worker = fast headline grab only. Xray = article fetch + verification.
// Schedule: Every 5 minutes
// Sources: Reuters, BBC, AP, CNN, Sky, AlJazeera, DW, France24, Guardian, GDELT
// Features: Article body fetching, cross-source corroboration, dedup, Xray-ready
// v5.3: Optimized for CF free tier - batched fetches, reduced timeouts, CPU limits
// ================================================

const SUPABASE_URL = 'https://dkxydhuojaspmbpjfyoz.supabase.co';
const MAX_STORIES_PER_RUN = 20;  // Reduced from 25
const MAX_ITEMS_PER_SOURCE = 15; // Reduced from 25
const RSS_TIMEOUT = 4000;        // Reduced from 6000ms
const BATCH_SIZE = 5;            // Fetch 5 sources at a time instead of 10

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

// ---- Content Filter Keywords (simplified for CPU) ----------------------
const JUNK_PATTERNS = [
  /\b(bachelor|kardashian|taylor swift|celebrity|gossip|reality tv|deadliest catch)\b/i,
  /\b(nfl|nba|nhl|mlb|super bowl|oscars|grammys|box office)\b/i,
  /\b(recipe|tiktok|influencer|horoscope|lottery|viral video|meme)\b/i,
];

// ---- Country Detection (simplified for CPU) ---------------------------
const COUNTRY_MAP = {
  ukraine: { code: "UA", name: "Ukraine", lat: 49.0, lng: 31.0 },
  russia: { code: "RU", name: "Russia", lat: 61.5, lng: 90.0 },
  israel: { code: "IL", name: "Israel", lat: 31.0, lng: 35.0 },
  gaza: { code: "PS", name: "Palestine", lat: 31.9, lng: 35.2 },
  palestine: { code: "PS", name: "Palestine", lat: 31.9, lng: 35.2 },
  iran: { code: "IR", name: "Iran", lat: 32.4, lng: 53.7 },
  syria: { code: "SY", name: "Syria", lat: 34.8, lng: 38.9 },
  yemen: { code: "YE", name: "Yemen", lat: 15.6, lng: 48.5 },
  china: { code: "CN", name: "China", lat: 35.9, lng: 104.2 },
  "united states": { code: "US", name: "United States", lat: 37.1, lng: -95.7 },
  american: { code: "US", name: "United States", lat: 37.1, lng: -95.7 },
  washington: { code: "US", name: "United States", lat: 37.1, lng: -95.7 },
  trump: { code: "US", name: "United States", lat: 37.1, lng: -95.7 },
  germany: { code: "DE", name: "Germany", lat: 51.2, lng: 10.4 },
  france: { code: "FR", name: "France", lat: 46.2, lng: 2.2 },
  "united kingdom": { code: "GB", name: "United Kingdom", lat: 55.4, lng: -3.4 },
  british: { code: "GB", name: "United Kingdom", lat: 55.4, lng: -3.4 },
  japan: { code: "JP", name: "Japan", lat: 36.2, lng: 138.3 },
  india: { code: "IN", name: "India", lat: 20.6, lng: 79.1 },
  nato: { code: "BE", name: "NATO/Belgium", lat: 50.8, lng: 4.5 },
  european: { code: "BE", name: "European Union", lat: 50.8, lng: 4.5 },
  turkey: { code: "TR", name: "Turkey", lat: 38.9, lng: 35.2 },
  egypt: { code: "EG", name: "Egypt", lat: 26.8, lng: 30.8 },
  pakistan: { code: "PK", name: "Pakistan", lat: 30.4, lng: 69.3 },
  "north korea": { code: "KP", name: "North Korea", lat: 40.3, lng: 127.5 },
  "south korea": { code: "KR", name: "South Korea", lat: 35.9, lng: 127.8 },
  taiwan: { code: "TW", name: "Taiwan", lat: 23.7, lng: 121.0 },
};

// ---- Category Detection (simplified for CPU) --------------------------
const CATEGORY_MAP = [
  { name: "War & Conflict", icon: "⚔️", color: "#ff4444",
    terms: /\b(war|attack|strike|military|troops|bomb|missile|killed|wounded|ceasefire|invasion|offensive|drone|airstrike|casualties|shelling|combat|battle|explosion|forces|conflict|rebels|army|terrorist|militia)\b/i },
  { name: "Elections", icon: "🗳️", color: "#4488ff",
    terms: /\b(election|vote|ballot|polling|candidate|president|parliament|congress|senate|referendum|campaign|democracy|electoral|poll|voter|voting)\b/i },
  { name: "Weather & Disaster", icon: "🌊", color: "#ffaa00",
    terms: /\b(hurricane|typhoon|earthquake|flood|tornado|wildfire|tsunami|drought|volcano|storm|disaster|cyclone|earthquake|emergency|evacuat)\b/i },
  { name: "Economy", icon: "📈", color: "#00d4ff",
    terms: /\b(gdp|inflation|recession|trade|tariff|sanctions|bank|currency|markets|stocks|economic|deficit|fed|central bank|financial)\b/i },
  { name: "Science & Tech", icon: "🔬", color: "#00ff88",
    terms: /\b(nasa|spacex|satellite|rocket|ai |artificial intelligence|nuclear|quantum|vaccine|research|discovery|technology|cyber|software)\b/i },
  { name: "Health", icon: "🏥", color: "#ff69b4",
    terms: /\b(pandemic|outbreak|virus|disease|epidemic|who |health|hospital|medical|vaccine|covid|ebola|doctor|patient)\b/i },
  { name: "Politics", icon: "🏛️", color: "#7b2fff",
    terms: /\b(diplomacy|treaty|summit|protest|coup|scandal|corrupt|policy|legislation|bill|law|court|judge|supreme|justice|lawsuit|trial)\b/i },
  { name: "Environment", icon: "🌿", color: "#44ff88",
    terms: /\b(climate change|deforestation|pollution|carbon|emissions|biodiversity|species|arctic|amazon|renewable|solar|wind)\b/i },
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
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
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
    if (cat.terms.test(lower)) return cat;
  }
  return { name: 'Politics', icon: '🏛️', color: '#7b2fff' };
}

function normalizeHeadline(h) {
  return h.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// ---- Confidence Scoring (simplified for CPU) --------------------------
function scoreConfidence(story, allItems) {
  let score = 40;
  const rep = SOURCE_REPUTATION[story.sourceName] || 55;
  score += Math.round((rep - 55) / 4);
  const text = (story.headline + ' ' + story.summary).toLowerCase();
  if (/\b(official|confirmed|announced|statement)\b/.test(text)) score += 8;
  if (/\b(according to|reportedly|alleged|claims|might)\b/.test(text)) score -= 10;
  if (/\b(breaking|urgent|exclusive)\b/.test(text)) score += 3;
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

// ---- Main Gather (optimized for CPU) ----------------------------------
async function gatherNews(env) {
  const log = [];
  const allRawItems = [];

  // Batch RSS fetches to reduce CPU spike
  for (let i = 0; i < RSS_SOURCES.length; i += BATCH_SIZE) {
    const batch = RSS_SOURCES.slice(i, i + BATCH_SIZE);
    const fetches = batch.map(src =>
      fetch(src.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; XrayNewsBot/1.0)' },
        signal: AbortSignal.timeout(RSS_TIMEOUT)
      })
      .then(r => r.text())
      .then(xml => ({ src, items: parseXML(xml) }))
      .catch(err => ({ src, items: [], error: err.message }))
    );

    const results = await Promise.allSettled(fetches);
    for (const res of results) {
      if (res.status === 'fulfilled' && res.value.items.length) {
        const { src, items } = res.value;
        for (const item of items.slice(0, MAX_ITEMS_PER_SOURCE)) {
          allRawItems.push({ ...item, sourceName: src.name, sourceTier: src.tier });
        }
        log.push(`✓ ${src.name}: ${items.length} items`);
      } else {
        const src = res.value?.src || { name: 'unknown' };
        log.push(`✗ ${src.name}: ${res.reason?.message || res.value?.error || 'failed'}`);
      }
    }
  }

  log.push(`Total raw items: ${allRawItems.length}`);

  // Filter junk
  const clean = allRawItems.filter(i => !isJunk(i.title + ' ' + i.desc));
  log.push(`After junk filter: ${clean.length}`);

  // Get existing headlines for dedup
  let existing = [];
  try {
    existing = await supabase(env, 'GET', '/stories?select=headline&order=created_at.desc&limit=200');
  } catch (e) { log.push(`DB fetch skipped: ${e.message}`); }
  const existingHeadlines = (existing || []).map(r => r.headline);

  // Dedup and build candidates
  const seen = new Set();
  const candidates = [];

  for (const item of clean) {
    if (!item.title || item.title.length < 15) continue;
    const norm = normalizeHeadline(item.title);

    // Skip near-duplicates
    let dup = false;
    for (const h of existingHeadlines) {
      if (h.toLowerCase().includes(norm.substring(0, 30))) { dup = true; break; }
    }
    if (dup) continue;

    if (seen.has(norm.substring(0, 50))) continue;
    seen.add(norm.substring(0, 50));

    const country = detectCountry(item.title + ' ' + item.desc);
    if (!country) continue;

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
      sourceName: item.sourceName,
      sourceTier: item.sourceTier,
    });
  }

  log.push(`Candidates: ${candidates.length}`);

  // Limit
  const toProcess = candidates.slice(0, MAX_STORIES_PER_RUN);

  // Score
  const toInsert = toProcess.map(story => {
    const score = scoreConfidence(story, allRawItems);
    const { sourceName, sourceTier, ...clean } = { ...story, source_name: story.sourceName };
    return { ...clean, confidence_score: score };
  });

  // Pre-filter existing URLs
  let dedupedInsert = toInsert;
  try {
    const existResp = await fetch(
      `${SUPABASE_URL}/rest/v1/stories?select=external_url&order=created_at.desc&limit=200`,
      { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    );
    if (existResp.ok) {
      const existing = await existResp.json();
      const existingUrls = new Set(existing.filter(s => s.external_url).map(s => s.external_url));
      dedupedInsert = toInsert.filter(s => !s.external_url || !existingUrls.has(s.external_url));
      log.push(`Pre-filter: ${toInsert.length} → ${dedupedInsert.length}`);
    }
  } catch(e) {}

  // Sequential insert
  let inserted = 0, insertErrors = 0;
  for (const story of dedupedInsert) {
    try {
      await supabase(env, 'POST', '/stories', [story]);
      inserted++;
    } catch (err) {
      insertErrors++;
    }
  }

  if (inserted > 0) log.push(`✓ Inserted: ${inserted}`);
  if (insertErrors > 0) log.push(`⚠ Errors: ${insertErrors}`);

  return { inserted, candidates: candidates.length, log };
}

// ---- Worker Entry ------------------------------------------------------
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(gatherNews(env).catch(err => console.error('Gather failed:', err)));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'xraynews-gatherer', version: 'v5.3' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    if (url.pathname === '/gather') {
      const result = await gatherNews(env);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    return new Response('XrayNews Gatherer v5.3 — OK', { status: 200 });
  }
};
