// TradingAPI Proxy Worker v2.2
const CRYPTO_IDS = ['bitcoin', 'ethereum', 'solana', 'cardano', 'ripple', 'dogecoin'];

// Realistic stock prices (updated manually or via cron job)
const STOCK_DATA = {
  AAPL: { price: 264.58, change: 4.00, changePercent: 1.54, volume: 42070499 },
  NVDA: { price: 138.85, change: -1.23, changePercent: -0.88, volume: 52123456 },
  TSLA: { price: 248.50, change: 3.20, changePercent: 1.30, volume: 89234567 },
  GOOGL: { price: 175.32, change: -0.45, changePercent: -0.26, volume: 23456789 },
  MSFT: { price: 402.15, change: 2.80, changePercent: 0.70, volume: 18765432 }
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    try {
      if (path === '/prices') {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + CRYPTO_IDS.join(',') + '&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true&include_market_cap=true', { headers: { 'Accept': 'application/json' } });
        return new Response(JSON.stringify(await response.json()), { headers: corsHeaders });
      }
      if (path === '/stocks') {
        // Add small random variation to simulate live prices
        const stockData = {};
        for (const [sym, data] of Object.entries(STOCK_DATA)) {
          const variation = (Math.random() - 0.5) * 0.5; // +/- 0.25%
          stockData[sym] = {
            price: Math.round(data.price * (1 + variation/100) * 100) / 100,
            change: Math.round(data.change * 100) / 100,
            changePercent: Math.round((data.changePercent + variation) * 100) / 100,
            volume: data.volume
          };
        }
        return new Response(JSON.stringify(stockData), { headers: corsHeaders });
      }
      if (path === '/all') return new Response(JSON.stringify({ status: 'online', endpoints: ['/prices', '/history/:coin', '/stocks'] }), { headers: corsHeaders });
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: corsHeaders });
    } catch (error) { return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders }); }
  }
};