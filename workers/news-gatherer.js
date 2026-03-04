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
  AR:{lat:-38.41,lng:-63.61}, PL:{lat:51.91,lng:19.14}, TH:{lat:15.87,lng:100.99},
  IR:{lat:32.42,lng:53.68}, TR:{lat:38.96,lng:35.24}, KP:{lat:40.33,lng:127.51}
};

function detectCategory(text) {
  const t = (text||'').toLowerCase();
  if (/war|attack|military|missile|strike|conflict|troops|bomb|kill|soldier/.test(t)) return 'War & Conflict';
  if (/election|vote|ballot|parliament|democracy|president|congress|senate/.test(t)) return 'Elections';
  if (/hurricane|earthquake|flood|storm|tsunami|wildfire|disaster|tornado/.test(t)) return 'Weather & Disaster';
  if (/economy|gdp|inflation|bank|currency|recession|market|trade|tariff/.test(t)) return 'Economy';
  if (/health|virus|covid|vaccine|disease|outbreak|hospital|cancer|medical/.test(t)) return 'Health';
  if (/tech|\bai\b|space|nasa|robot|cyber|hack|quantum|satellite/.test(t)) return 'Science & Tech';
  if (/climate|carbon|emissions|environment|pollution|wildlife|forest/.test(t)) return 'Environment';
  return 'Politics';
}

function detectCountry(text) {
  const t = (text||'').toLowerCase();
  const map = [
    {p:['united states','u.s.','american '],iso:'US',name:'United States'},
    {p:['britain','british','england','london'],iso:'GB',name:'United Kingdom'},
    {p:['ukraine','ukrainian','kyiv','kiev'],iso:'UA',name:'Ukraine'},
    {p:['russia','russian','moscow','kremlin','putin'],iso:'RU',name:'Russia'},
    {p:['china','chinese','beijing','xi jinping'],iso:'CN',name:'China'},
    {p:['israel','israeli','tel aviv','gaza','netanyahu'],iso:'IL',name:'Israel'},
    {p:['france','french','paris','macron'],iso:'FR',name:'France'},
    {p:['germany','german','berlin'],iso:'DE',name:'Germany'},
    {p:['india','indian','new delhi','modi'],iso:'IN',name:'India'},
    {p:['iran','iranian','tehran'],iso:'IR',name:'Iran'},
    {p:['canada','canadian','ottawa','trudeau'],iso:'CA',name:'Canada'},
    {p:['australia','australian','sydney','canberra'],iso:'AU',name:'Australia'},
    {p:['japan','japanese','tokyo'],iso:'JP',name:'Japan'},
    {p:['pakistan','islamabad'],iso:'PK',name:'Pakistan'},
    {p:['north korea','pyongyang','kim jong'],iso:'KP',name:'North Korea'},
    {p:['south korea','seoul'],iso:'KR',name:'South Korea'},
    {p:['brazil','brazilian','brasilia','lula'],iso:'BR',name:'Brazil'},
    {p:['mexico','mexican'],iso:'MX',name:'Mexico'},
    {p:['nigeria','abuja','lagos'],iso:'NG',name:'Nigeria'},
    {p:['egypt','egyptian','cairo'],iso:'EG',name:'Egypt'},
    {p:['saudi arabia','riyadh'],iso:'SA',name:'Saudi Arabia'},
    {p:['poland','polish','warsaw'],iso:'PL',name:'Poland'},
    {p:['turkey','turkish','ankara','erdogan'],iso:'TR',name:'Turkey'},
    {p:['indonesia','jakarta'],iso:'ID',name:'Indonesia'}
  ];
  for (const c of map) {
    if (c.p.some(pat => t.includes(pat))) return {iso:c.iso, name:c.name};
  }
  return {iso:'XX', name:'Global'};
}

function calcConfidence(a) {
  let score = 40;
  const trusted = ['reuters','bbc','associated press','bloomberg','guardian','france24','dw.com'];
  const state   = ['rt.com','xinhua','tass','sputnik','presstv'];
  const src = (a.source||'').toLowerCase();
  if (trusted.some(s=>src.includes(s))) score += 30;
  if (state.some(s=>src.includes(s)))   score -= 20;
  if ((a.title||'').length > 40) score += 5;
  if (/breaking|unconfirmed|rumor|alleged|claims/i.test(a.title||'')) score -= 10;
  return Math.max(5, Math.min(95, score));
}

async function fetchGDELT() {
  try {
    const url = 'https://api.gdeltproject.org/api/v2/doc/doc?query=sourcelang:english&mode=artlist&maxrecords=25&format=json&timespan=6h&sort=hybridrel';
    const res = await fetch(url, {headers:{'User-Agent':'XrayNews/1.0'}});
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles||[]).map(a => ({
      headline: a.title||'Untitled',
      summary: a.title||'',
      source_url: a.url||'',
      source_name: a.domain||'GDELT',
      published_at: a.seendate
        ? new Date(a.seendate.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,'$1-$2-$3T$4:$5:$6Z')).toISOString()
        : new Date().toISOString(),
      raw_text: a.title||''
    }));
  } catch(e) { console.error('GDELT failed:',e.message); return []; }
}

async function fetchRSS(feedUrl, sourceName) {
  try {
    const res = await fetch(feedUrl, {headers:{'User-Agent':'XrayNews/1.0'}});
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [];
    const itemRx = /<item[\s\S]*?<\/item>/gi;
    let m;
    while ((m=itemRx.exec(xml))!==null && items.length<10) {
      const b = m[0];
      const tm = /<title>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/title>/i.exec(b);
      const lm = /<link>([^<]*)<\/link>/i.exec(b);
      const pm = /<pubDate>([^<]*)<\/pubDate>/i.exec(b);
      const title = tm?(tm[1]||tm[2]||'').trim():'';
      if (!title) continue;
      items.push({
        headline: title, summary: title,
        source_url: lm?lm[1].trim():'',
        source_name: sourceName,
        published_at: pm?new Date(pm[1]).toISOString():new Date().toISOString(),
        raw_text: title
      });
    }
    return items;
  } catch(e) { console.error(sourceName+' RSS failed:',e.message); return []; }
}

function deduplicate(articles) {
  const seen = new Set();
  return articles.filter(a => {
    const key = (a.headline||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').split(' ').slice(0,6).join(' ');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

async function storeToSupabase(stories, key) {
  let stored=0, errors=0;
  for (const s of stories) {
    try {
      const res = await fetch(SUPABASE_URL+'/rest/v1/stories', {
        method: 'POST',
        headers: {
          'Content-Type':'application/json',
          'apikey': key,
          'Authorization': 'Bearer '+key,
          'Prefer': 'return=minimal,resolution=ignore-duplicates'
        },
        body: JSON.stringify(s)
      });
      if (res.ok||res.status===409) stored++; else errors++;
    } catch(e) { errors++; }
  }
  return {stored, errors};
}

async function runGather(env, cors) {
  const KEY = env.SUPABASE_SERVICE_KEY||'';
  if (!KEY) return new Response(
    JSON.stringify({error:'SUPABASE_SERVICE_KEY not configured'}),
    {status:500, headers:{...cors,'Content-Type':'application/json'}}
  );

  const [g,r,b,a] = await Promise.allSettled([
    fetchGDELT(),
    fetchRSS('https://feeds.reuters.com/reuters/worldNews','Reuters'),
    fetchRSS('https://feeds.bbci.co.uk/news/world/rss.xml','BBC News'),
    fetchRSS('https://rsshub.app/apnews/world-news','AP News')
  ]);

  let raw = [
    ...(g.status==='fulfilled'?g.value:[]),
    ...(r.status==='fulfilled'?r.value:[]),
    ...(b.status==='fulfilled'?b.value:[]),
    ...(a.status==='fulfilled'?a.value:[])
  ];
  raw = deduplicate(raw);

  const stories = raw.map(x => {
    const country   = detectCountry(x.raw_text);
    const centroid  = COUNTRY_CENTROIDS[country.iso]||{lat:0,lng:0};
    const confidence = calcConfidence({...x, source:x.source_name});
    return {
      headline:   x.headline.slice(0,255),
      summary:    (x.summary||x.headline).slice(0,500),
      source_url:  x.source_url,
      source_name: x.source_name,
      category:    detectCategory(x.raw_text),
      country_code: country.iso,
      country_name: country.name,
      lat: centroid.lat, lng: centroid.lng,
      confidence_score: confidence,
      verification_status: confidence>=70?'verified':'unverified',
      is_breaking: confidence>=80 && /breaking|urgent|alert/i.test(x.headline),
      source_count: 1,
      published_at: x.published_at,
      created_at:   new Date().toISOString()
    };
  });

  const result = await storeToSupabase(stories, KEY);
  return new Response(
    JSON.stringify({success:true,fetched:raw.length,processed:stories.length,...result,timestamp:new Date().toISOString()}),
    {headers:{...cors,'Content-Type':'application/json'}}
  );
}

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin':  'https://ottawav.com',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    if (request.method==='OPTIONS') return new Response(null,{headers:cors});
    if (url.pathname==='/gather')   return runGather(env, cors);
    if (url.pathname==='/health')   return new Response(
      JSON.stringify({status:'ok',service:'XrayNews News Gatherer',time:new Date().toISOString()}),
      {headers:{...cors,'Content-Type':'application/json'}}
    );
    return new Response('XrayNews News Gatherer — /gather | /health', {headers:cors});
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runGather(env, {}));
  }
};
