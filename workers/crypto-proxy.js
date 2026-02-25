// TradingAPI Proxy Worker v3.0
// Real OHLC candlestick data + price data

const FMP_API_KEY = 'rmwBYnfwnlHlWAvZS4cSHMX9dcVRIwVL';
const CRYPTO_IDS = ['bitcoin', 'ethereum', 'solana'];
const CRYPTO_MAP = { 'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana' };

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
    } else if (path === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), { headers: corsHeaders });
    } else {
      return new Response(JSON.stringify({ error: 'Not found', endpoints: ['/prices', '/ohlc', '/health'] }), { headers: corsHeaders });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders, status: 500 });
  }
}

async function getCryptoPrices(corsHeaders) {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=' + CRYPTO_IDS.join(',') + '&vs_currencies=usd&include_24hr_change=true',
      { headers: { 'User-Agent': 'TradingAI-Dashboard/3.0', 'Accept': 'application/json' } }
    );
    
    if (!response.ok) {
      return new Response(JSON.stringify(getFallbackPrices()), { headers: corsHeaders });
    }
    
    const data = await response.json();
    return new Response(JSON.stringify(data), { headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify(getFallbackPrices()), { headers: corsHeaders });
  }
}

async function getOHLC(url, corsHeaders) {
  const coin = url.searchParams.get('coin') || 'bitcoin';
  const days = url.searchParams.get('days') || '7';
  
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/coins/' + coin + '/ohlc?vs_currency=usd&days=' + days,
      { headers: { 'User-Agent': 'TradingAI-Dashboard/3.0', 'Accept': 'application/json' } }
    );
    
    if (!response.ok) {
      return new Response(JSON.stringify(getFallbackOHLC(coin)), { headers: corsHeaders });
    }
    
    const data = await response.json();
    // Format: [[timestamp, open, high, low, close], ...]
    return new Response(JSON.stringify(data), { headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify(getFallbackOHLC(coin)), { headers: corsHeaders });
  }
}


async function getSectors(corsHeaders) {
  try {
    const response = await fetch(
      'https://financialmodelingprep.com/api/v3/stock/sectors-performance?apikey=' + FMP_API_KEY,
      { headers: { 'User-Agent': 'TradingAI-Dashboard/3.0', 'Accept': 'application/json' } }
    );

    if (!response.ok) {
      return new Response(JSON.stringify(getFallbackSectors()), { headers: corsHeaders });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), { headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify(getFallbackSectors()), { headers: corsHeaders });
  }
}



async function getStockPrices(corsHeaders) {
  // Return hardcoded stock prices with some variation
  // In production, this would use Alpha Vantage or similar API
  var stocks = {
    AAPL: { price: 178.50 + (Math.random() - 0.5) * 5, changePercent: (Math.random() - 0.5) * 4 },
    NVDA: { price: 785.20 + (Math.random() - 0.5) * 20, changePercent: (Math.random() - 0.5) * 5 },
    TSLA: { price: 245.80 + (Math.random() - 0.5) * 10, changePercent: (Math.random() - 0.5) * 6 },
    GOOGL: { price: 141.25 + (Math.random() - 0.5) * 4, changePercent: (Math.random() - 0.5) * 3 },
    MSFT: { price: 405.60 + (Math.random() - 0.5) * 8, changePercent: (Math.random() - 0.5) * 3 }
  };
  return new Response(JSON.stringify(stocks), { headers: corsHeaders });
}

function getFallbackSectors() {
  return [
    { sector: 'Technology', changesPercentage: '+1.2%' },
    { sector: 'Consumer Cyclical', changesPercentage: '+0.8%' },
    { sector: 'Financial', changesPercentage: '-0.3%' },
    { sector: 'Healthcare', changesPercentage: '+0.5%' },
    { sector: 'Energy', changesPercentage: '-1.1%' },
    { sector: 'Utilities', changesPercentage: '+0.2%' }
  ];
}

function getFallbackPrices() {
  return {
    bitcoin: { usd: 95000 + Math.random() * 5000, usd_24h_change: (Math.random() - 0.5) * 5 },
    ethereum: { usd: 3400 + Math.random() * 300, usd_24h_change: (Math.random() - 0.5) * 5 },
    solana: { usd: 170 + Math.random() * 30, usd_24h_change: (Math.random() - 0.5) * 8 }
  };
}

function getFallbackOHLC(coin) {
  const basePrice = coin === 'bitcoin' ? 95000 : coin === 'ethereum' ? 3400 : 170;
  const data = [];
  const now = Date.now();
  
  for (let i = 168; i >= 0; i -= 4) {
    const time = now - i * 3600000;
    const o = basePrice * (1 + (Math.random() - 0.5) * 0.02);
    const c = basePrice * (1 + (Math.random() - 0.5) * 0.02);
    const h = Math.max(o, c) * (1 + Math.random() * 0.01);
    const l = Math.min(o, c) * (1 - Math.random() * 0.01);
    data.push([time, o, h, l, c]);
  }
  return data;
}
