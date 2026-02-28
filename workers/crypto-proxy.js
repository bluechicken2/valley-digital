// TradingAPI Proxy Worker v4.2
// Real data: CoinGecko (crypto), FMP Stable API (stocks)

// API Keys from Cloudflare secrets
const FMP_API_KEY = typeof FINANCIAL_MODELING_PREP !== 'undefined' ? FINANCIAL_MODELING_PREP : '';
const ALPHA_VANTAGE_KEY = typeof ALPHA_VANTAGE_API !== 'undefined' ? ALPHA_VANTAGE_API : '';

const CRYPTO_IDS = ['bitcoin', 'ethereum', 'solana', 'ripple', 'cardano', 'dogecoin'];
const STOCK_SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'GOOGL', 'MSFT', 'AMZN', 'META'];

// Cache
const cache = {
  stocks: { data: null, timestamp: 0, ttl: 60000 },
  crypto: { data: null, timestamp: 0, ttl: 30000 },
  sectors: { data: null, timestamp: 0, ttl: 300000 }
};

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    if (path === '/prices' || path === '/api/prices') {
      return await getCryptoPrices(corsHeaders);
    } else if (path === '/ohlc' || path === '/api/ohlc') {
      return await getOHLC(url, corsHeaders);
    } else if (path === '/sectors' || path === '/api/sectors') {
      return await getSectors(corsHeaders);
    } else if (path === '/stocks' || path === '/api/stocks') {
      return await getStockPrices(corsHeaders);
    } else if (path === '/quote' || path === '/api/quote') {
      return await getStockQuote(url, corsHeaders);
    } else if (path === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        version: '4.2',
        fmp: FMP_API_KEY ? 'configured' : 'missing',
        alphaVantage: ALPHA_VANTAGE_KEY ? 'configured' : 'missing',
        endpoints: ['/prices', '/stocks', '/quote', '/ohlc', '/sectors', '/news', '/calendar', '/ai', '/health'],
        timestamp: Date.now()
      }), { headers: corsHeaders });
    } else if (path === '/news') {
        try {
            const newsUrl = 'https://cryptopanic.com/api/v1/posts/?auth_token=FREE&public=true&kind=news&filter=rising';
            const response = await fetch(newsUrl);
            const data = await response.json();
            return new Response(JSON.stringify(data.results?.slice(0, 10).map(n => ({
                title: n.title,
                url: n.url,
                source: n.source.title,
                published: n.published_at,
                sentiment: n.votes?.negative > n.votes?.positive ? 'negative' : 'positive'
            })) || []), {
                headers: corsHeaders
            });
        } catch(e) {
            return new Response(JSON.stringify([]), { headers: corsHeaders });
        }
    } else if (path === '/calendar') {
        const events = getWeeklyEconomicEvents();
        return new Response(JSON.stringify(events), { headers: corsHeaders });
    }
    // AI chat endpoint
    if (path === '/ai' && request.method === 'POST') {
        const body = await request.json();
        const response = await fetch('https://api.venice.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + env.VENICE_API_KEY
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a professional financial analyst and trading assistant. Provide concise, actionable insights. Never give specific buy/sell advice. Always include risk disclaimers.'
                    },
                    ...body.messages
                ],
                max_tokens: 500,
                temperature: 0.7
            })
        });
        const data = await response.json();
        return new Response(JSON.stringify({
            response: data.choices?.[0]?.message?.content || 'Unable to generate response'
        }), { headers: corsHeaders });
    }
 else {
      return new Response(JSON.stringify({
        error: 'Not found',
        endpoints: ['/prices', '/stocks', '/quote', '/ohlc', '/sectors', '/news', '/calendar', '/ai', '/health']
      }), { headers: corsHeaders });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
  }
}

// ============ CRYPTO (CoinGecko) ============
async function getCryptoPrices(corsHeaders) {
  if (cache.crypto.data && Date.now() - cache.crypto.timestamp < cache.crypto.ttl) {
    return new Response(JSON.stringify(cache.crypto.data), { headers: corsHeaders });
  }
  
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=' + CRYPTO_IDS.join(',') +
      '&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true',
      { headers: { 'User-Agent': 'TradingAI-Dashboard/4.2' } }
    );
    
    if (!response.ok) throw new Error('CoinGecko error: ' + response.status);
    
    const data = await response.json();
    cache.crypto.data = data;
    cache.crypto.timestamp = Date.now();
    return new Response(JSON.stringify(data), { headers: corsHeaders });
  } catch (error) {
    if (cache.crypto.data) {
      return new Response(JSON.stringify(cache.crypto.data), { headers: corsHeaders });
    }
    return new Response(JSON.stringify({ error: 'Crypto data unavailable' }), { headers: corsHeaders, status: 503 });
  }
}

async function getOHLC(url, corsHeaders) {
  const coin = url.searchParams.get('coin') || 'bitcoin';
  const days = url.searchParams.get('days') || '7';
  
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/coins/' + coin + '/ohlc?vs_currency=usd&days=' + days,
      { headers: { 'User-Agent': 'TradingAI-Dashboard/4.2' } }
    );
    if (!response.ok) throw new Error('OHLC error');
    const data = await response.json();
    return new Response(JSON.stringify(data), { headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'OHLC unavailable' }), { headers: corsHeaders, status: 503 });
  }
}

// ============ STOCKS (FMP Stable API) ============
async function getStockPrices(corsHeaders) {
  if (cache.stocks.data && Date.now() - cache.stocks.timestamp < cache.stocks.ttl) {
    return new Response(JSON.stringify(cache.stocks.data), { headers: corsHeaders });
  }
  
  const results = {};
  
  // Use FMP Stable API (free tier supports single symbol queries)
  if (FMP_API_KEY) {
    try {
      // Fetch each stock individually (free tier limitation)
      for (const symbol of STOCK_SYMBOLS) {
        try {
          const url = 'https://financialmodelingprep.com/stable/quote?symbol=' + symbol + '&apikey=' + FMP_API_KEY;
          const response = await fetch(url, { headers: { 'User-Agent': 'TradingAI-Dashboard/4.2' } });
          
          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data[0]) {
              const quote = data[0];
              results[symbol] = {
                price: quote.price || 0,
                changePercent: quote.changePercentage || 0,
                marketCap: quote.marketCap || 0,
                volume: quote.volume || 0,
                name: quote.name || symbol,
                source: 'fmp'
              };
            }
          }
          await new Promise(r => setTimeout(r, 100)); // Rate limiting
        } catch (e) {
          console.error('FMP error for ' + symbol + ':', e);
        }
      }
      
      if (Object.keys(results).length > 0) {
        cache.stocks.data = results;
        cache.stocks.timestamp = Date.now();
        return new Response(JSON.stringify(results), { headers: corsHeaders });
      }
    } catch (error) {
      console.error('FMP error:', error);
    }
  }
  
  // Return cached if available
  if (cache.stocks.data) {
    return new Response(JSON.stringify(cache.stocks.data), { headers: corsHeaders });
  }
  
  return new Response(JSON.stringify({
    error: 'Stock data unavailable',
    fmp: FMP_API_KEY ? 'configured' : 'missing'
  }), { headers: corsHeaders, status: 503 });
}

// Single stock quote
async function getStockQuote(url, corsHeaders) {
  const symbol = url.searchParams.get('symbol')?.toUpperCase();
  if (!symbol) {
    return new Response(JSON.stringify({ error: 'Symbol required' }), { headers: corsHeaders, status: 400 });
  }
  
  // Try FMP Stable API
  if (FMP_API_KEY) {
    try {
      const fmpUrl = 'https://financialmodelingprep.com/stable/quote?symbol=' + symbol + '&apikey=' + FMP_API_KEY;
      const response = await fetch(fmpUrl, { headers: { 'User-Agent': 'TradingAI-Dashboard/4.2' } });
      
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data[0]) {
          const quote = data[0];
          const result = {
            symbol: quote.symbol,
            name: quote.name,
            price: quote.price || 0,
            changePercent: quote.changePercentage || 0,
            change: quote.change || 0,
            volume: quote.volume || 0,
            marketCap: quote.marketCap || 0,
            dayHigh: quote.dayHigh || 0,
            dayLow: quote.dayLow || 0,
            yearHigh: quote.yearHigh || 0,
            yearLow: quote.yearLow || 0,
            source: 'fmp'
          };
          return new Response(JSON.stringify(result), { headers: corsHeaders });
        }
      }
    } catch (e) {
      console.error('FMP quote error:', e);
    }
  }
  
  return new Response(JSON.stringify({ error: 'Quote unavailable for ' + symbol }), { headers: corsHeaders, status: 404 });
}

// ============ SECTORS (Fallback Data) ============
async function getSectors(corsHeaders) {
  // FMP sectors endpoint returns empty on free tier, use fallback data
  const fallbackSectors = [
    { sector: "Technology", changesPercentage: "+1.2%" },
    { sector: "Consumer Cyclical", changesPercentage: "+0.8%" },
    { sector: "Financial", changesPercentage: "-0.3%" },
    { sector: "Healthcare", changesPercentage: "+0.5%" },
    { sector: "Energy", changesPercentage: "-1.1%" },
    { sector: "Utilities", changesPercentage: "+0.2%" },
    { sector: "Real Estate", changesPercentage: "-0.4%" },
    { sector: "Materials", changesPercentage: "+0.6%" },
    { sector: "Industrials", changesPercentage: "+0.3%" },
    { sector: "Communication", changesPercentage: "+0.9%" }
  ];
  
  return new Response(JSON.stringify(fallbackSectors), { headers: corsHeaders });
}

// ============ ECONOMIC CALENDAR ============
function getWeeklyEconomicEvents() {
    const now = new Date();
    const day = now.getDay();
    const events = [
        { day: 1, time: '08:30', event: 'ISM Manufacturing PMI', impact: 'high', currency: 'USD' },
        { day: 2, time: '10:00', event: 'JOLTS Job Openings', impact: 'medium', currency: 'USD' },
        { day: 3, time: '14:00', event: 'FOMC Minutes', impact: 'high', currency: 'USD' },
        { day: 4, time: '08:30', event: 'Jobless Claims', impact: 'medium', currency: 'USD' },
        { day: 5, time: '08:30', event: 'Nonfarm Payrolls', impact: 'high', currency: 'USD' },
    ];
    return events.filter(e => e.day >= day);
}
