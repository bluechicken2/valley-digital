// Cloudflare Worker: Crypto Price Proxy
// Deploy this to Cloudflare Workers to bypass CORS

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const path = url.pathname
  
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  }
  
  // Handle preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  
  // CoinGecko requires a descriptive User-Agent
  const geckoHeaders = {
    'Accept': 'application/json',
    'User-Agent': 'TradingAI-Dashboard/1.0 (https://dashboard.ottawav.com)'
  }
  
  try {
    // Route: /prices - Get crypto prices
    if (path === '/prices' || path === '/api/prices') {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,cardano,ripple,dogecoin&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true',
        { headers: geckoHeaders }
      )
      const data = await response.json()
      return new Response(JSON.stringify(data), { headers: corsHeaders })
    }
    
    // Route: /history/:coin - Get price history
    if (path.startsWith('/history/')) {
      const coin = path.split('/')[2]
      const days = url.searchParams.get('days') || '7'
      const response = await fetch(
        'https://api.coingecko.com/api/v3/coins/' + coin + '/market_chart?vs_currency=usd&days=' + days,
        { headers: geckoHeaders }
      )
      const data = await response.json()
      return new Response(JSON.stringify(data), { headers: corsHeaders })
    }
    
    // Route: /stocks - Stock prices (mock data)
    if (path === '/stocks' || path === '/api/stocks') {
      const mockStocks = {
        SPY: { price: 478.50, change: 0.85 },
        QQQ: { price: 412.30, change: 1.24 },
        AAPL: { price: 182.50, change: 0.45 }
      }
      return new Response(JSON.stringify(mockStocks), { headers: corsHeaders })
    }
    
    // Default route
    return new Response(JSON.stringify({ 
      status: 'online',
      endpoints: ['/prices', '/history/:coin', '/stocks']
    }), { headers: corsHeaders })
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: corsHeaders 
    })
  }
}
