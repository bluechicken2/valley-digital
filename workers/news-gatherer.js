// ================================================
// XrayNews Intelligence Gatherer v5.13.0
// Architecture: Worker = fast headline grab only. Xray = article fetch + verification.
// Schedule: Every 5 minutes
// Sources: BBC, Guardian, NPR, AlJazeera, DW, France24, Sky, WSJ, Euronews, RFI + 11 Reddit subs
// Features: Social source mixing, Reddit Atom parser, clean title/summary, dedup
// v5.4: Reddit RSS integration
// v5.5: Nitter (disabled - all instances blocked)
// v5.8: Social source shuffle + MAX_STORIES 50
// v5.9: Reddit User-Agent fix
// v5.13: Comprehensive junk filtering (40+ patterns) at source + engine
// v5.11: Reddit title/summary metadata cleaning
// v5.12: Audit fixes (openStory modal, CSS glow, PostgREST filter)
// ================================================

// SUPABASE_URL accessed via env parameter
const MAX_STORIES_PER_RUN = 50;  // Reduced from 25
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

// ---- Reddit RSS Sources (Atom format) ----------------------------------
const REDDIT_SOURCES = [
  { url: 'https://www.reddit.com/r/worldnews/hot.rss', name: 'Reddit WorldNews', tier: 2, type: 'social' },
  { url: 'https://www.reddit.com/r/geopolitics/hot.rss', name: 'Reddit Geopolitics', tier: 2, type: 'social' },
  { url: 'https://www.reddit.com/r/UkrainianConflict/hot.rss', name: 'Reddit Ukraine', tier: 2, type: 'social' },
  { url: 'https://www.reddit.com/r/europe/hot.rss', name: 'Reddit Europe', tier: 2, type: 'social' },
  { url: 'https://www.reddit.com/r/news/hot.rss', name: 'Reddit News', tier: 2, type: 'social' },
  // Regional news
  { url: 'https://www.reddit.com/r/UnitedKingdom/hot.rss', name: 'Reddit UK', tier: 2, type: 'social' },
  { url: 'https://www.reddit.com/r/CanadaPolitics/hot.rss', name: 'Reddit Canada', tier: 2, type: 'social' },
  { url: 'https://www.reddit.com/r/China/hot.rss', name: 'Reddit China', tier: 2, type: 'social' },
  { url: 'https://www.reddit.com/r/MiddleEastNews/hot.rss', name: 'Reddit MiddleEast', tier: 2, type: 'social' },
  // Conflict zones
  { url: 'https://www.reddit.com/r/IsraelPalestine/hot.rss', name: 'Reddit IsraelPalestine', tier: 2, type: 'social' },
  { url: 'https://www.reddit.com/r/SyrianRebellion/hot.rss', name: 'Reddit Syria', tier: 2, type: 'social' },
];
// ---- Nitter (Twitter/X) RSS Sources ------------------------------------
const NITTER_INSTANCES = [
  'https://nitter.net',
  'https://nitter.poast.org', 
  'https://nitter.privacydev.net',
  'https://nitter.fdn.fr',
];

const NITTER_SEARCHES = []; // DISABLED - all Nitter instances returning 403/timeout


// ---- Content Filter Keywords (simplified for CPU) ----------------------
const JUNK_PATTERNS = [
  // Entertainment/Celebrity
  /\b(bachelor|kardashian|taylor swift|celebrity|gossip|reality tv|deadliest catch)\b/i,
  /\b(nfl|nba|nhl|mlb|super bowl|oscars|grammys|box office)\b/i,
  /\b(recipe|tiktok|influencer|horoscope|lottery|viral video|meme)\b/i,
  // Personal advice (learned from cleanup)
  /\b(pick.*name|choose.*name|help me.*choose|which.*should i|should i.*or)\b/i,
  /\b(living with.*in.*law|thoughts on.*professor|what do you think)\b/i,
  /\b(am i the.*asshole|\baita\b|relationship.*advice|dating.*advice|need.*advice)\b/i,
  /\b(career.*advice|job.*advice|interview.*tips|resume.*help)\b/i,
  // Discussion threads (learned from cleanup)
  /\b(megathread|daily.*thread|weekly.*thread|discussion.*thread)\b/i,
  /\b(free talk|casual.*conversation|just.*curious|anyone.*else|does anyone)\b/i,
  // PSA/Mod posts
  /^psa:|^note:|^reminder:|^meta:|\bmod.*post\b|\bsubreddit.*rule\b|\boff-topic\b/i,
  // Requests
  /\b(translate.*please|translation.*request|what does.*mean|can someone.*explain)\b/i,
  /\b(question about|looking for.*recommendation|suggest.*me)\b/i,
  // Travel/Living
  /\b(travel.*tips|travel.*itinerary|tourist.*advice|trip.*planning)\b/i,
  /\b(cost of living|apartment.*search|housing.*advice|best.*neighborhood|where.*live|moving to)\b/i,
  // Education/Career
  /\b(study.*abroad|student.*visa|university.*admission|college.*application)\b/i,
  /\b(how.*get.*job|salary.*question|work.*culture)\b/i,
  // Shopping/Reviews
  /\b(worth.*buying|should.*buy|review.*my|rate my|is it.*worth)\b/i,
  // Low-quality indicators
  /\b(unpopular opinion|what.*your.*favorite|do you.*prefer)\b/i,
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
  'Reddit WorldNews': 65, 'Reddit Geopolitics': 60, 'Reddit Ukraine': 55,
  'Reddit Europe': 55, 'Reddit News': 60,
  'Reddit UK': 55, 'Reddit Canada': 55, 'Reddit China': 50, 'Reddit MiddleEast': 50,
  'Reddit IsraelPalestine': 45, 'Reddit Syria': 45,
  'X Breaking News': 50, 'X World News': 45, 'X Conflict': 45,
  'X Disasters': 50, 'X Elections': 50, 'X Protests': 45, 'X Health': 50,
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

// Parse Reddit Atom RSS format
function parseRedditAtom(text, sourceName) {
  const items = [];
  try {
    const t = text.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '');
    // Atom uses <entry> instead of <item>
    const entryRe = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
    let m;
    while ((m = entryRe.exec(t)) !== null) {
      const block = m[1];
      const get = function(tag) {
        const r = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'i');
        const rm = r.exec(block);
        if (!rm) return '';
        return rm[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/\s+/g, ' ').trim();
      };
      // Extract Reddit-specific data
      const title = get('title');
      const link = block.match(/<link[^>]*href="([^"]+)"[^>]*rel="alternate"/i)?.[1] || 
                   block.match(/<link[^>]*href="([^"]+)"/i)?.[1] || '';
      const pubDate = get('updated') || get('published');
      const desc = get('content') || get('summary');
      
      // Clean Reddit metadata from description too
      let cleanDesc = desc
        .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/\s*submitted by\s*\S+.*$/i, '')
        .replace(/\s*\[link\]\s*\[comments\].*$/i, '')
        .replace(/\s+/g, ' ').trim();
      
      // Extract score from title like "[12345] Article Title"
      let score = 0;
      const scoreMatch = title.match(/^\[(\d+)\]\s*/);
      let cleanTitle = scoreMatch ? title.replace(scoreMatch[0], '') : title;
      if (scoreMatch) score = parseInt(scoreMatch[1]) || 0;
      
      // Clean Reddit metadata from title
      // Decode numeric HTML entities like &#32; (space)
      cleanTitle = cleanTitle.replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)));
      // Remove "submitted by /u/username" patterns
      cleanTitle = cleanTitle.replace(/\s*submitted by\s*\S+.*$/i, '');
      // Remove "[link] [comments]" patterns
      cleanTitle = cleanTitle.replace(/\s*\[link\]\s*\[comments\].*$/i, '');
      // Clean up whitespace
      cleanTitle = cleanTitle.replace(/\s+/g, ' ').trim();
      
      // Extract comment count from content
      let comments = 0;
      const commentMatch = desc.match(/(\d+)\s*comments?/i);
      if (commentMatch) comments = parseInt(commentMatch[1]) || 0;
      
      if (cleanTitle && cleanTitle.length > 10) {
        items.push({ 
          title: cleanTitle, 
          desc: cleanDesc.substring(0, 500), 
          link, 
          pubDate,
          reddit_score: score,
          reddit_comments: comments
        });
      }
    }
  } catch (e) {
    console.error('Reddit parse error:', e.message);
  }
  return items;
}


// Parse Nitter RSS (Twitter/X via Nitter)
function parseNitterRss(text, sourceName) {
  const items = [];
  try {
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
          .replace(/&apos;/g, "'").replace(/&quot;/g, '"')
          .replace(/\s+/g, ' ').trim();
      };

      const title = get('title');
      const desc = get('description');
      const link = get('link');
      const pubDate = get('pubDate');

      // Extract author from nitter link
      const authorMatch = link.match(/nitter\.net\/([^\/]+)/);
      const author = authorMatch ? '@' + authorMatch[1] : '';

      // Clean up title (remove author prefix if present)
      const cleanTitle = title.replace(/^[^:]+:\s*/, '');

      if (cleanTitle && cleanTitle.length > 10) {
        items.push({
          title: cleanTitle,
          desc: cleanDesc.substring(0, 500),
          link: link.replace(/nitter\.[^\/]+/, 'twitter.com'), // Convert back to twitter
          pubDate,
          twitter_author: author,
          source_type: 'social'
        });
      }
    }
  } catch (e) {
    // Silent fail for parsing
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
  // Boost for high Reddit engagement
  if (story.reddit_score && story.reddit_score > 1000) score += 5;
  if (story.reddit_score && story.reddit_score > 5000) score += 5;
  return Math.max(5, Math.min(99, score));
}

// ---- Supabase Helpers --------------------------------------------------
async function supabase(env, method, path, body) {
  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
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
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
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
          allRawItems.push({ ...item, sourceName: src.name, sourceTier: src.tier, sourceType: 'legacy' });
        }
        log.push(`✓ ${src.name}: ${items.length} items`);
      } else {
        const src = res.value?.src || { name: 'unknown' };
        log.push(`✗ ${src.name}: ${res.reason?.message || res.value?.error || 'failed'}`);
      }
    }
  }

  // Fetch Reddit sources (separate batch to avoid rate limiting)
  log.push('Fetching Reddit sources...');
  for (let i = 0; i < REDDIT_SOURCES.length; i += 2) { // Smaller batches for Reddit
    const batch = REDDIT_SOURCES.slice(i, i + 2);
    const fetches = batch.map(src =>
      fetch(src.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        signal: AbortSignal.timeout(RSS_TIMEOUT)
      })
      .then(r => r.text())
      .then(xml => ({ src, items: parseRedditAtom(xml, src.name) }))
      .catch(err => ({ src, items: [], error: err.message }))
    );
    
    const results = await Promise.allSettled(fetches);
    for (const res of results) {
      if (res.status === 'fulfilled' && res.value.items.length) {
        const { src, items } = res.value;
        for (const item of items.slice(0, MAX_ITEMS_PER_SOURCE)) {
          allRawItems.push({ 
            ...item, 
            sourceName: src.name, 
            sourceTier: src.tier,
            sourceType: 'social',
            reddit_score: item.reddit_score || 0,
            reddit_comments: item.reddit_comments || 0
          });
        }
        log.push(`✓ ${src.name}: ${items.length} items`);
      } else {
        const src = res.value?.src || { name: 'unknown' };
        log.push(`✗ ${src.name}: ${res.reason?.message || res.value?.error || 'failed'}`);
      }
    }
    // Small delay between Reddit batches to avoid rate limiting
    if (i + 2 < REDDIT_SOURCES.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Fetch Nitter (Twitter/X) sources with instance rotation
  log.push('Fetching Nitter (X/Twitter) sources...');
  let nitterSuccess = false;

  for (const search of NITTER_SEARCHES) {
    if (nitterSuccess) break; // Stop if we got results

    for (const instance of NITTER_INSTANCES) {
      try {
        const nitterUrl = `${instance}/search/rss?q=${encodeURIComponent(search.query)}`;
        const resp = await fetch(nitterUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
          signal: AbortSignal.timeout(RSS_TIMEOUT)
        });

        if (!resp.ok) continue; // Try next instance

        const xml = await resp.text();
        const items = parseNitterRss(xml, search.name);

        if (items.length > 0) {
          for (const item of items.slice(0, MAX_ITEMS_PER_SOURCE)) {
            allRawItems.push({
              ...item,
              sourceName: search.name,
              sourceTier: 2,
              sourceType: 'social',
              twitter_author: item.twitter_author || ''
            });
          }
          log.push(`✓ ${search.name} via ${instance}: ${items.length} items`);
          nitterSuccess = true;
          break; // Success, move to next search
        }
      } catch (err) {
        // Try next instance
        continue;
      }
    }

    // Small delay between searches
    if (!nitterSuccess) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  if (!nitterSuccess) log.push('✗ Nitter: All instances failed');

  log.push(`Total raw items: ${allRawItems.length}`);

  // Filter junk
  const clean = allRawItems.filter(i => !isJunk(i.title + ' ' + i.desc));
  log.push(`After junk filter: ${clean.length}`);

  // Get existing headlines for dedup
  let existing = [];
  try {
    existing = await supabase(env, 'GET', '/stories?select=headline&order=created_at.desc&limit=500');
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

    let country = detectCountry(item.title + ' ' + item.desc);
    if (!country) {
      // Social sources default to 'World' if no country detected
      if (item.sourceType === 'social') {
        country = { code: 'XX', name: 'World', lat: 0, lng: 0 };
      } else {
        continue;
      }
    }

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
      sourceName: item.sourceName,
      sourceTier: item.sourceTier,
      source_type: item.sourceType || 'legacy',
      reddit_score: item.reddit_score || 0,
      reddit_comments: item.reddit_comments || 0,
      twitter_author: item.twitter_author || null,
    });
  }

  log.push(`Candidates: ${candidates.length}`);

  // Shuffle candidates to mix sources (legacy, reddit, nitter)
  // This ensures social sources have a chance to be processed
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

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
      `${env.SUPABASE_URL}/rest/v1/stories?select=external_url&order=created_at.desc&limit=500`,
      { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    );
    if (existResp.ok) {
      const existing = await existResp.json();
      const existingUrls = new Set(existing.filter(s => s.external_url).map(s => s.external_url));
      dedupedInsert = toInsert.filter(s => !s.external_url || !existingUrls.has(s.external_url));
      log.push(`Pre-filter: ${toInsert.length} → ${dedupedInsert.length}`);
    }
  } catch(e) {}

  // Sequential insert - handle duplicates gracefully
  let inserted = 0, skipped = 0, failed = 0;
  for (const story of dedupedInsert) {
    try {
      await supabase(env, 'POST', '/stories', [story]);
      inserted++;
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('409') || msg.includes('23505') || msg.includes('duplicate')) {
        skipped++; // Already exists - not an error
      } else {
        failed++;
        if (failed <= 3) log.push(`⚠ Insert failed: ${msg.substring(0,80)}`);
      }
    }
  }

  if (inserted > 0) log.push(`✓ Inserted: ${inserted}`);
  if (skipped > 0) log.push(`⊘ Skipped dupes: ${skipped}`);
  if (failed > 0) log.push(`⚠ Failed: ${failed}`);

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
      return new Response(JSON.stringify({ status: 'ok', service: 'xraynews-gatherer', version: 'v5.13.0' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    if (url.pathname === '/gather') {
      const result = await gatherNews(env);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    return new Response('XrayNews Gatherer v5.13.0 — OK', { status: 200 });
  }
};
