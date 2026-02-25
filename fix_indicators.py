import re

with open('js/app.js', 'r') as f:
    content = f.read()

# Fix 1: Modify fetchOHLC to store history
old_fetch = '''async function fetchOHLC(sym) {
            var cacheKey = 'ohlc_'+sym+'_'+timeframe;
            var cached = getCached(cacheKey, CACHE_TTL.OHLC);
            if(cached) return cached;
            
            showLoading('chart-loading');
            var cm = {'BTC':'bitcoin','ETH':'ethereum','SOL':'solana','XRP':'ripple','ADA':'cardano','DOGE':'dogecoin'};
            var coin = cm[sym] || 'bitcoin';
            var days = timeframe==='1H'?'1':timeframe==='1W'?'7':timeframe==='1M'?'30':timeframe==='3M'?'90':'7';
            try {
                var r = await fetch('https://tradingapi-proxy.cloudflare-5m9f2.workers.dev/ohlc?coin='+coin+'&days='+days);
                if(!r.ok) throw new Error('OHLC fetch failed');
                var data = await r.json();
                setCache(cacheKey, data);
                hideLoading('chart-loading');
                return data;
            } catch(e) {
                hideLoading('chart-loading');
                showToast('Chart data unavailable - using fallback');
                return null;
            }
        }'''

new_fetch = '''async function fetchOHLC(sym) {
            var cacheKey = 'ohlc_'+sym+'_'+timeframe;
            var cached = getCached(cacheKey, CACHE_TTL.OHLC);
            if(cached) {
                // Store close prices in history for indicator calculations
                if(cached && cached.length > 0) {
                    history[sym] = cached.map(function(c) { return c.c; });
                }
                return cached;
            }
            
            showLoading('chart-loading');
            var cm = {'BTC':'bitcoin','ETH':'ethereum','SOL':'solana','XRP':'ripple','ADA':'cardano','DOGE':'dogecoin'};
            var coin = cm[sym] || 'bitcoin';
            var days = timeframe==='1H'?'1':timeframe==='1W'?'7':timeframe==='1M'?'30':timeframe==='3M'?'90':'7';
            try {
                var r = await fetch('https://tradingapi-proxy.cloudflare-5m9f2.workers.dev/ohlc?coin='+coin+'&days='+days);
                if(!r.ok) throw new Error('OHLC fetch failed');
                var data = await r.json();
                // Store close prices in history for indicator calculations
                if(data && data.length > 0) {
                    history[sym] = data.map(function(c) { return c.c; });
                }
                setCache(cacheKey, data);
                hideLoading('chart-loading');
                return data;
            } catch(e) {
                hideLoading('chart-loading');
                showToast('Chart data unavailable - using fallback');
                return null;
            }
        }'''

content = content.replace(old_fetch, new_fetch)

# Fix 2: Modify selAsset to call fetchOHLC for real data
old_selAsset = "window.selAsset = function(s) { for(var i=0;i<data.length;i++) if(data[i].sym===s){sel=data[i];break;} $('chart-sym').textContent=s; if(!history[s])history[s]=genHistory(sel.price,100); renderAssets();renderInds();renderActions();renderAssetDetails();renderChart(); };"

new_selAsset = "window.selAsset = function(s) { for(var i=0;i<data.length;i++) if(data[i].sym===s){sel=data[i];break;} $('chart-sym').textContent=s; if(!history[s])history[s]=genHistory(sel.price,100); renderAssets();renderInds();renderActions();renderAssetDetails();renderChart(); fetchOHLC(s).then(function(d){ if(d && d.length>0){ history[s]=d.map(function(c){return c.c;}); renderInds();renderActions(); } }); };"

content = content.replace(old_selAsset, new_selAsset)

with open('js/app.js', 'w') as f:
    f.write(content)

print("Fixed!")
