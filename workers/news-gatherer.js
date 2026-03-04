// XrayNews — Cloudflare Worker News Gatherer
// Sources: GDELT API (free) + Reuters/BBC/AP RSS
// Deploy: cd workers && wrangler deploy
// Secret: wrangler secret put SUPABASE_SERVICE_KEY

const SUPABASE_URL = 'https://dkxydhuojaspmbpjfyoz.supabase.co';

const COUNTRY_CENTROIDS = {
  US:{lat:37.09,lng:-95.71}, GB:{lat:55.37,lng:-3.43}, FR:{lat:46.22,lng:2.21},
  DE:{lat:51.16,lng:10.45}, RU:{lat:61.52,lng:105.31}, CN:{lat:35.86,lng:104.19},
  IN:{lat:20.59,lng:78.96}, BR:{lat:-14.23,lng:-51.92}, AU:{lat:-25.27,lng:133.77},
  CA:{lat:56.13,lng:-106.34}, UA:{lat:48.37,lng:31.16}, IL:{lat:31.04,lng:34.85},
  JP:{lat:36.20,lng:138.25}, KR:{lat:35.90,lng:127.76}, SA:{lat:23.88,lng:45.07},
  ZA:{lat:-30.55,lng:22.93}, NG:{lat:9.08,lng:8.67}, EG:{lat:26.82,lng:30.80},
  PK:{lat:30.37,lng:69.34}, ID:{lat:-0.78,lng:113.92}, MX:{lat:23.63,lng:-102.55},
  AR:{lat:-38.41,lng:-63.61}, PL:{lat:51.91,lng:19.14}, TR:{lat:38.96,lng:35.24},
  IR:{lat:32.42,lng:53.68}, KP:{lat:40.33,lng:127.51}, TH:{lat:15.87,lng:100.99}
};

const CAT_COLORS = {
  'War & Conflict':     '#ff4444',
  'Politics':           '#7b2fff',
  'Weather & Disaster': '#ffaa00',
  'Economy':            '#00d4ff',
  'Science & Tech':     '#00ff88',
  'Health':             '#ff69b4',
  'Elections':          '#4488ff',
  'Environment':        '#44ff88'
};

// Fetch with abort timeout
async function fetchWithTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 7000);
  try {
    const res = await fetch(url, Object.assign({}, options, { signal: ctrl.signal }));
    clearTimeout(t);
    return res;
  } catch(e) {
    clearTimeout(t);
    throw e;
  }
}

function detectCategory(text) {
  const t = (text || '').toLowerCase();
  if (/war|attack|military|missile|strike|conflict|troops|bomb|kill|soldier/.test(t)) return 'War & Conflict';
  if (/election|vote|ballot|parliament|president|congress|senate/.test(t)) return 'Elections';
  if (/hurricane|earthquake|flood|storm|tsunami|wildfire|disaster|tornado/.test(t)) return 'Weather & Disaster';
  if (/economy|gdp|inflation|bank|recession|market|trade|tariff|sanction/.test(t)) return 'Economy';
  if (/health|virus|covid|vaccine|disease|outbreak|hospital|medical/.test(t)) return 'Health';
  if (/tech|ai|space|nasa|robot|cyber|hack|software|satellite/.test(t)) return 'Science & Tech';
  if (/climate|carbon|emissions|environment|pollution|wildlife|forest/.test(t)) return 'Environment';
  return 'Politics';
}

function detectCountry(text) {
  const t = (text || '').toLowerCase();
  const map = [
    {p:['united states','american',' usa ','u.s.'],iso:'US',name:'United States'},
    {p:['britain','british','england','london',' uk '],iso:'GB',name:'United Kingdom'},
    {p:['ukraine','ukrainian','kyiv','kiev'],iso:'UA',name:'Ukraine'},
    {p:['russia','russian','moscow','kremlin'],iso:'RU',name:'Russia'},
    {p:['china','chinese','beijing'],iso:'CN',name:'China'},
    {p:['israel','israeli','gaza','tel aviv'],iso:'IL',name:'Israel'},
    {p:['france','french','paris','macron'],iso:'FR',name:'France'},
    {p:['germany','german','berlin'],iso:'DE',name:'Germany'},
    {p:['india','indian','delhi','modi'],iso:'IN',name:'India'},
    {p:['iran','iranian','tehran'],iso:'IR',name:'Iran'},
    {p:['canada','canadian','ottawa'],iso:'CA',name:'Canada'},
    {p:['australia','australian','sydney'],iso:'AU',name:'Australia'},
    {p:['japan','japanese','tokyo'],iso:'JP',name:'Japan'},
    {p:['pakistan','islamabad'],iso:'PK',name:'Pakistan'},
    {p:['north korea','pyongyang'],iso:'KP',name:'North Korea'},
    {p:['south korea','seoul'],iso:'KR',name:'South Korea'},
    {p:['brazil','brazilian','brasilia'],iso:'BR',name:'Brazil'},
    {p:['mexico','mexican'],iso:'MX',name:'Mexico'},
    {p:['nigeria','nigerian','lagos'],iso:'NG',name:'Nigeria'},
    {p:['egypt','egyptian','cairo'],iso:'EG',name:'Egypt'},
    {p:['saudi','riyadh'],iso:'SA',name:'Saudi Arabia'},
    {p:['poland','polish','warsaw'],iso:'PL',name:'Poland'},
    {p:['turkey','turkish','ankara'],iso:'TR',name:'Turkey'},
    {p:['indonesia','jakarta'],iso:'ID',name:'Indonesia'}
  ];
  for (const c of map) {
    if (c.p.some(pat => t.includes(pat))) return {iso:c.iso, name:c.name};
  }
  return {iso:'XX', name:'Global'};
}

function calcConfidence(source, title) {
  let score = 40;
  const src = (source || '').toLowerCase();
  const trusted = ['reuters','bbc','associated press','bloomberg','guardian','france24','dw.com','apnews'];
  const biased  = ['rt.com','xinhua','tass','sputnik','presstv'];
  if (trusted.some(s => src.includes(s))) score += 30;
  if (biased.some(s => src.includes(s)))  score -= 20;
  if ((title||'').length > 40) score += 5;
  if (/breaking|unconfirmed|rumor|alleged|claims/i.test(title||'')) score -= 10;
  return Math.max(5, Math.min(95, score));
}

async function fetchGDELT() {
  try {
    const url = 'https://api.gdeltproject.org/api/v2/doc/doc?query=sourcelang:english&mode=artlist&maxrecords=20&format=json&timespan=6h&sort=hybridrel';
    const res = await fetchWithTimeout(url, {headers:{'User-Agent':'XrayNews/1.0'}}, 7000);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles || []).map(a => ({
      headline:    (a.title  || '').trim(),
      summary:     (a.title  || '').trim(),
      source_name: a.domain  || 'GDELT',
      raw_text:    (a.title  || '').toLowerCase()
    })).filter(a => a.headline);
  } catch(e) {
    console.error('GDELT failed:', e.message);
    return [];
  }
}

async function fetchRSS(feedUrl, sourceName) {
  try {
    const res = await fetchWithTimeout(feedUrl, {headers:{'User-Agent':'XrayNews/1.0'}}, 7000);
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [];
    const itemRx = /<item[\s\S]*?<\/item>/gi;
    const titleRx = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i;
    const descRx  = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i;
    let m;
    while ((m = itemRx.exec(xml)) && items.length < 8) {
      const block = m[0];
      const tm = titleRx.exec(block);
      const dm = descRx.exec(block);
      const title = tm ? tm[1].replace(/<[^>]+>/g,'').trim() : '';
      const desc  = dm ? dm[1].replace(/<[^>]+>/g,'').trim().slice(0,300) : '';
      if (!title || title.length < 10) continue;
      items.push({ headline:title, summary:desc||title, source_name:sourceName, raw_text:(title+' '+desc).toLowerCase() });
    }
    return items;
  } catch(e) {
    console.error(sourceName + ' failed:', e.message);
    return [];
  }
}

function deduplicate(articles) {
  const seen = new Set();
  return articles.filter(a => {
    const key = (a.headline||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').split(' ').slice(0,5).join(' ');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function storeToSupabase(stories, key) {
  let stored = 0, errors = 0;
  for (const s of stories) {
    try {
      const res = await fetchWithTimeout(SUPABASE_URL + '/rest/v1/stories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
          'Authorization': 'Bearer ' + key,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(s)
      }, 5000);
      if (res.ok || res.status === 409) stored++;
      else {
        const body = await res.text();
        console.error('Supabase error', res.status, body.slice(0,100));
        errors++;
      }
    } catch(e) { errors++; }
  }
  return { stored, errors };
}

async function runGather(env, cors) {
  try {
    const KEY = env.SUPABASE_SERVICE_KEY || '';
    if (!KEY) return new Response(
      JSON.stringify({error:'SUPABASE_SERVICE_KEY not set'}),
      {status:500, headers:{...cors,'Content-Type':'application/json'}}
    );

    const [g, r, b, a] = await Promise.allSettled([
      fetchGDELT(),
      fetchRSS('https://feeds.reuters.com/reuters/worldNews', 'Reuters'),
      fetchRSS('https://feeds.bbci.co.uk/news/world/rss.xml', 'BBC News'),
      fetchRSS('https://rsshub.app/apnews/world-news', 'AP News')
    ]);

    let raw = [
      ...(g.status==='fulfilled' ? g.value : []),
      ...(r.status==='fulfilled' ? r.value : []),
      ...(b.status==='fulfilled' ? b.value : []),
      ...(a.status==='fulfilled' ? a.value : [])
    ];
    raw = deduplicate(raw);

    const stories = raw.map(x => {
      const country    = detectCountry(x.raw_text);
      const centroid   = COUNTRY_CENTROIDS[country.iso] || {lat:0, lng:0};
      const confidence = calcConfidence(x.source_name, x.headline);
      const cat        = detectCategory(x.raw_text);
      return {
        headline:         x.headline.slice(0, 255),
        summary:          (x.summary || x.headline).slice(0, 500),
        category:         cat,
        category_color:   CAT_COLORS[cat] || '#00d4ff',
        country_code:     country.iso,
        country_name:     country.name,
        lat:              centroid.lat,
        lng:              centroid.lng,
        confidence_score: confidence,
        verified_count:   confidence >= 70 ? 1 : 0,
        source_count:     1,
        status:           confidence >= 70 ? 'verified' : 'unverified',
        is_breaking:      confidence >= 80 && /breaking|urgent|alert/i.test(x.headline)
      };
    });

    const result = await storeToSupabase(stories, KEY);

    return new Response(
      JSON.stringify({success:true, fetched:raw.length, processed:stories.length, ...result, timestamp:new Date().toISOString()}),
      {headers:{...cors,'Content-Type':'application/json'}}
    );
  } catch(err) {
    console.error('[Gather] Fatal:', err.message);
    return new Response(
      JSON.stringify({success:false, error:err.message, timestamp:new Date().toISOString()}),
      {status:500, headers:{...cors,'Content-Type':'application/json'}}
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': 'https://ottawav.com',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    if (request.method === 'OPTIONS') return new Response(null, {headers:cors});
    if (url.pathname === '/gather') return runGather(env, cors);
    if (url.pathname === '/health') return new Response(
      JSON.stringify({status:'ok', service:'XrayNews News Gatherer', time:new Date().toISOString()}),
      {headers:{...cors,'Content-Type':'application/json'}}
    );
    return new Response('XrayNews News Gatherer — /gather or /health', {headers:cors});
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runGather(env, {}));
  }
};
