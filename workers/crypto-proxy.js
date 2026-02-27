// TradingAPI Proxy Worker v4.0
// Real data from: CoinGecko (crypto), Yahoo Finance (stocks), Alpha Vantage (backup), FMP (sectors)

// API Keys from Cloudflare secrets (set via: wrangler secret put <NAME>)
const FMP_API_KEY = typeof FINANCIAL_MODELING_PREP !== 'undefined' ? FINANCIAL_MODELING_PREP : '';
const ALPHA_VANTAGE_KEY = typeof ALPHA_VANTAGE_API !== 'undefined' ? ALPHA_VANTAGE_API : '';

const CRYPTO_IDS = ['bitcoin', 'ethereum', 'solana', 'ripple', 'cardano', 'dogecoin'];
const CRYPTO_MAP = { 'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana', 'XRP': 'ripple', 'ADA': 'cardano', 'DOGE': 'dogecoin' };
const STOCK_SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'GOOGL', 'MSFT', 'AMZN', 'META'];

// Cache for rate limiting
const cache = {
  stocks: { data: null, timestamp: 0, ttl: 60000 },
  crypto: { data: null, timestamp: 0, ttl: 30000 },
  sectors: { data: null, timestamp: 0, ttl: 300000 },
  quote: { data: {}, timestamp: {}, ttl: 60000 }
};

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
        version: '4.0',
        endpoints: ['/prices', '/stocks', '/quote', '/ohlc', '/sectors'],
        timestamp: Date.now() 
      }), { headers: corsHeaders });
    } else {
      return new Response(JSON.stringify({ 
        error: 'Not found', 
        endpoints: ['/prices', '/stocks', '/quote', '/ohlc', '/sectors', '/health'] 
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
      { headers: { 'User-Agent': 'TradingAI-Dashboard/4.0' } }
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
      { headers: { 'User-Agent': 'TradingAI-Dashboard/4.0' } }
    );
    if (!response.ok) throw new Error('OHLC error');
    const data = await response.json();
    return new Response(JSON.stringify(data), { headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'OHLC unavailable' }), { headers: corsHeaders, status: 503 });
  }
}

// ============ STOCKS (Yahoo Finance Primary, Alpha Vantage/FMP Backup) ============
async function getStockPrices(corsHeaders) {
  if (cache.stocks.data && Date.now() - cache.stocks.timestamp < cache.stocks.ttl) {
    return new Response(JSON.stringify(cache.stocks.data), { headers: corsHeaders });
  }
  
  // Try Yahoo Finance first (free, no API key)
  try {
    const yahooData = await fetchYahooQuotes(STOCK_SYMBOLS);
    if (yahooData && Object.keys(yahooData).length > 0) {
      cache.stocks.data = yahooData;
      cache.stocks.timestamp = Date.now();
      return new Response(JSON.stringify(yahooData), { headers: corsHeaders });
    }
  } catch (error) {}
  
  // Fallback to FMP
  if (FMP_API_KEY) {
    try {
      const fmpData = await fetchFMPQuotes(STOCK_SYMBOLS);
      if (fmpData && Object.keys(fmpData).length > 0) {
        cache.stocks.data = fmpData;
        cache.stocks.timestamp = Date.now();
        return new Response(JSON.stringify(fmpData), { headers: corsHeaders });
      }
    } catch (error) {}
  }
  
  if (cache.stocks.data) {
    return new Response(JSON.stringify(cache.stocks.data), { headers: corsHeaders });
  }
  
  return new Response(JSON.stringify({ error: 'Stock data unavailable' }), { headers: corsHeaders, status: 503 });
}

// Yahoo Finance (free)
async function fetchYahooQuotes(symbols) {
  const url = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' + symbols.join(',') + 
    '&fields=regularMarketPrice,regularMarketChangePercent,marketCap,regularMarketVolume';
  
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  
  if (!response.ok) throw new Error('Yahoo error');
  
  const data = await response.json();
  const results = {};
  
  if (data.quoteResponse && data.quoteResponse.result) {
    for (const quote of data.quoteResponse.result) {
      if (quote && quote.symbol) {
        results[quote.symbol] = {
          price: quote.regularMarketPrice || 0,
          changePercent: quote.regularMarketChangePercent || 0,
          marketCap: quote.marketCap || 0,
          volume: quote.regularMarketVolume || 0,
          source: 'yahoo'
        };
      }
    }
  }
  return results;
}

// FMP (backup)
async function fetchFMPQuotes(symbols) {
  const url = 'https://financialmodelingprep.com/api/v3/quote/' + symbols.join(',') + '?apikey=' + FMP_API_KEY;
  const response = await fetch(url, { headers: { 'User-Agent': 'TradingAI-Dashboard/4.0' } });
  if (!response.ok) throw new Error('FMP error');
  
  const data = await response.json();
  const results = {};
  
  if (Array.isArray(data)) {
    for (const quote of data) {
      if (quote && quote.symbol) {
        results[quote.symbol] = {
          price: quote.price || 0,
          changePercent: quote.changesPercentage || 0,
          marketCap: quote.marketCap || 0,
          volume: quote.volume || 0,
          source: 'fmp'
        };
      }
    }
  }
  return results;
}

// Single stock quote
async function getStockQuote(url, corsHeaders) {
  const symbol = url.searchParams.get('symbol')?.toUpperCase();
  if (!symbol) {
    return new Response(JSON.stringify({ error: 'Symbol required' }), { headers: corsHeaders, status: 400 });
  }
  
  if (cache.quote.data[symbol] && Date.now() - cache.quote.timestamp[symbol] < cache.quote.ttl) {
    return new Response(JSON.stringify(cache.quote.data[symbol]), { headers: corsHeaders });
  }
  
  try {
    const yahooData = await fetchYahooQuotes([symbol]);
    if (yahooData && yahooData[symbol]) {
      cache.quote.data[symbol] = yahooData[symbol];
      cache.quote.timestamp[symbol] = Date.now();
      return new Response(JSON.stringify(yahooData[symbol]), { headers: corsHeaders });
    }
  } catch (e) {}
  
  return new Response(JSON.stringify({ error: 'Quote unavailable' }), { headers: corsHeaders, status: 404 });
}

// ============ SECTORS (FMP) ============
async function getSectors(corsHeaders) {
  if (cache.sectors.data && Date.now() - cache.sectors.timestamp < cache.sectors.ttl) {
    return new Response(JSON.stringify(cache.sectors.data), { headers: corsHeaders });
  }
  
  if (!FMP_API_KEY) {
    return new Response(JSON.stringify({ error: 'FMP API key not configured' }), { headers: corsHeaders, status: 503 });
  }
  
  try {
    const response = await fetch(
      'https://financialmodelingprep.com/api/v3/stock/sectors-performance?apikey=' + FMP_API_KEY,
      { headers: { 'User-Agent': 'TradingAI-Dashboard/4.0' } }
    );
    if (!response.ok) throw new Error('Sectors error');
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      cache.sectors.data = data;
      cache.sectors.timestamp = Date.now();
      return new Response(JSON.stringify(data), { headers: corsHeaders });
    }
  } catch (error) {}
  
  if (cache.sectors.data) {
    return new Response(JSON.stringify(cache.sectors.data), { headers: corsHeaders });
  }
  
  return new Response(JSON.stringify({ error: 'Sector data unavailable' }), { headers: corsHeaders, status: 503 });
}
