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
  
  try {
    // Route: /prices - Get crypto prices
    if (path === '/prices' || path === '/api/prices') {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,cardano,ripple,dogecoin&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true',
        { headers: { 'Accept': 'application/json' } }
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
        { headers: { 'Accept': 'application/json' } }
      )
      const data = await response.json()
      return new Response(JSON.stringify(data), { headers: corsHeaders })
    }
    
    // Route: /stocks - Stock prices (using mock for now, Alpha Vantage needs API key)
    if (path === '/stocks' || path === '/api/stocks') {
      // Mock stock data - replace with Alpha Vantage when you have API key
      const stocks = {
        AAPL: { price: 248.32, change: 1.5 },
        NVDA: { price: 892.45, change: 4.2 },
        TSLA: { price: 356.78, change: -1.2 },
        GOOGL: { price: 175.23, change: 0.8 },
        MSFT: { price: 415.67, change: 1.1 }
      }
      return new Response(JSON.stringify(stocks), { headers: corsHeaders })
    }
    
    // Route: /all - Get all data in one call
    if (path === '/all' || path === '/api/all') {
      const [cryptoRes] = await Promise.all([
        fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,cardano,ripple,dogecoin&vs_currencies=usd&include_24hr_change=true', {
          headers: { 'Accept': 'application/json' }
        })
      ])
      
      const crypto = await cryptoRes.json()
      
      const stocks = {
        AAPL: { price: 248.32 + (Math.random() - 0.5) * 10, change: (Math.random() - 0.5) * 4 },
        NVDA: { price: 892.45 + (Math.random() - 0.5) * 20, change: (Math.random() - 0.5) * 6 },
        TSLA: { price: 356.78 + (Math.random() - 0.5) * 15, change: (Math.random() - 0.5) * 5 },
        GOOGL: { price: 175.23 + (Math.random() - 0.5) * 8, change: (Math.random() - 0.5) * 3 },
        MSFT: { price: 415.67 + (Math.random() - 0.5) * 12, change: (Math.random() - 0.5) * 4 }
      }
      
      return new Response(JSON.stringify({ crypto, stocks, timestamp: Date.now() }), { headers: corsHeaders })
    }
    
    // Default route - API info
    return new Response(JSON.stringify({
      name: 'TradingAPI Proxy',
      version: '1.0',
      endpoints: ['/prices', '/history/:coin', '/stocks', '/all']
    }), { headers: corsHeaders })
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders
    })
  }
}
