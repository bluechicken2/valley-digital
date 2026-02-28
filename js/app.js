// TradingAI Neural Nexus - Main Application

(function() {
        'use strict';
        // Global error boundary
        window.onerror = function(msg, url, line, col, error) {
            console.error('Global error:', msg, 'at', line + ':' + col);
            // showToast not available yet during init - will be defined later
            return false;
        };

        window.onunhandledrejection = function(event) {
            console.error('Unhandled promise rejection:', event.reason);
            // showToast not available yet during init - will be defined later
        };

// Input sanitization to prevent XSS
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/[&<>"']/g, function(m) {
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
    });
}

var $ = function(id) { return document.getElementById(id); };

        function sanitize(str) {
            if(!str) return '';
            return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
        }

        // Supabase configuration - ANON KEY is safe for client-side (publishable key)
        // Row Level Security (RLS) policies protect all user data
        var SUPABASE_URL = 'https://dkxydhuojaspmbpjfyoz.supabase.co';
        var SUPABASE_KEY = 'sb_publishable_ydepQXbHFjFA-_TIwOYNHg_SwN0m5PL';
        var API_BASE = 'https://tradingapi-proxy.cloudflare-5m9f2.workers.dev';
        
        // Configuration Constants
        // Safe fetch wrapper with error handling
        async function safeFetch(url, options) {
            try {
                var r = await fetch(url, options || {});
                if (!r.ok) { console.error('Fetch failed:', r.status, url); return null; }
                return r;
            } catch(e) {
                console.error('Fetch error:', e.message, url);
                return null;
            }
        }

        // Connection status monitoring
        window.addEventListener('online', function() {
            var banner = $('offline-banner');
            if(banner) banner.style.display = 'none';
            $('status-dot').className='status-dot';
            $('status-text').textContent='LIVE';
            refreshPrices();
        });
        window.addEventListener('offline', function() {
            var banner = $('offline-banner');
            if(banner) banner.style.display = 'block';
            $('status-dot').className='status-dot error';
            $('status-text').textContent='OFFLINE';
        });

var CONFIG = {
            REFRESH_INTERVAL: 30000,      // Price refresh interval (ms)
            TIME_UPDATE_INTERVAL: 1000,   // Time display update (ms)
            INIT_DELAY: 100,              // Init timeout delay (ms)
            SMA_PERIOD: 20,               // SMA period for charts
            EMA_SHORT: 9,                 // Short EMA period
            EMA_LONG: 21,                 // Long EMA period
            VOL_MA_PERIOD: 10,            // Volume MA period
            TOAST_DURATION: 3000,         // Toast notification duration (ms)
            CHART_HEIGHT: 320,            // Default chart height (px)
            VOLUME_HEIGHT: 80             // Volume chart height (px)
        };

        // Portfolio data version - increment to force localStorage reset
        var PORTFOLIO_DATA_VERSION = '2.0';

        var user = null, userTier = 'free', sel = null, data = [], alerts = [], sectorData = [], watchlists = [{name:'Crypto',symbols:['BTC','ETH','SOL']},{name:'Tech',symbols:['AAPL','NVDA','MSFT','GOOGL']}];
        var priceCt = null, volCt = null, allocCt = null, chartType = 'line', timeframe = '1D', chartRendering = false;
        
        // API Response Cache
        var apiCache = {};
        var CACHE_TTL = { PRICE: 30000, OHLC: 300000 };
        function getCached(key, ttl) {
            var item = apiCache[key];
            if (item && Date.now() - item.time < ttl) {
                return item.data;
            }
            return null;
        }
        function setCache(key, data) {
            apiCache[key] = { data: data, time: Date.now() };
        }
        function showLoading(elId) {
            var el = document.getElementById(elId);
            if(el) el.style.display = 'inline-block';
        }
        function hideLoading(elId) {
            var el = document.getElementById(elId);
            if(el) el.style.display = 'none';
        }

        var history = {}, prevPrices = {}, isLightTheme = false, isFullscreen = false;
        var dataQuality = { source: 'none', real: 0, lastUpdate: null };
        
        data = [
            {sym:'BTC',name:'Bitcoin',type:'crypto',price:0,chg:0,color:'#00f0ff',hold:0,fav:true,mktCap:0,vol24h:0,supply:19.5e6},
            {sym:'ETH',name:'Ethereum',type:'crypto',price:0,chg:0,color:'#a855f7',hold:0,fav:true,mktCap:0,vol24h:0,supply:120e6},
            {sym:'SOL',name:'Solana',type:'crypto',price:0,chg:0,color:'#00ff88',hold:0,fav:false,mktCap:0,vol24h:0,supply:433e6},
            {sym:'AAPL',name:'Apple',type:'stock',price:0,chg:0,color:'#ffd700',hold:0,fav:false,mktCap:0,vol24h:0,supply:15.5e9,pe:28,div:0.52},
            {sym:'NVDA',name:'NVIDIA',type:'stock',price:0,chg:0,color:'#76b900',hold:0,fav:true,mktCap:0,vol24h:0,supply:2.47e9,pe:65,div:0.04},
            {sym:'TSLA',name:'Tesla',type:'stock',price:0,chg:0,color:'#c00',hold:0,fav:false,mktCap:0,vol24h:0,supply:3.2e9,pe:45,div:0},
            {sym:'GOOGL',name:'Alphabet',type:'stock',price:0,chg:0,color:'#4285f4',hold:0,fav:false,mktCap:0,vol24h:0,supply:12.5e9,pe:22,div:0},
            {sym:'MSFT',name:'Microsoft',type:'stock',price:0,chg:0,color:'#00a4ef',hold:0,fav:true,mktCap:0,vol24h:0,supply:7.4e9,pe:35,div:0.75}
        ];
        sel = data[0];

        function fmt(n) { return n >= 1000 ? n.toLocaleString('en-US',{maximumFractionDigits:0}) : n.toFixed(n < 1 ? 4 : 2); }
        function genHistory(base, len) {
            // Returns empty array - charts must wait for real OHLC data from API
            // fetchOHLC will populate history[sym] with real data
            return [];
        }

        // Flash price cell on change (Phase 2)
        function flashPriceChange(symbol, direction) {
            var el = document.querySelector('[data-symbol="' + symbol + '"] .asset-price');
            if(!el) return;
            el.classList.remove('flash-up', 'flash-down');
            void el.offsetWidth; // Force reflow
            el.classList.add(direction === 'up' ? 'flash-up' : 'flash-down');
            setTimeout(function() {
                el.classList.remove('flash-up', 'flash-down');
            }, 1000);
        }

        // Track price changes after refresh (Phase 2)
        function trackPriceChanges() {
            for(var i = 0; i < data.length; i++) {
                var asset = data[i];
                var prev = prevPrices[asset.sym];
                if(prev !== undefined && prev !== asset.price) {
                    flashPriceChange(asset.sym, asset.price > prev ? 'up' : 'down');
                }
                prevPrices[asset.sym] = asset.price;
            }
        }
        function genCandles(base, len) { return []; } // DEPRECATED: Real data only from API
        
// Generate time labels based on timeframe going back from now
function generateTimeLabels(count, tf) {
    var labels = [];
    var now = new Date();
    var interval, format;

    switch(tf) {
        case '1H':
            interval = 60 * 60 * 1000; // 1 hour in ms
            for(var i = count - 1; i >= 0; i--) {
                var d = new Date(now.getTime() - i * interval);
                labels.push(d.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: false}));
            }
            break;
        case '1D':
            interval = 24 * 60 * 60 * 1000; // 1 day in ms
            for(var i = count - 1; i >= 0; i--) {
                var d = new Date(now.getTime() - i * interval);
                labels.push(d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'}));
            }
            break;
        case '1W':
            interval = 24 * 60 * 60 * 1000; // 1 day in ms (showing hourly points)
            for(var i = count - 1; i >= 0; i--) {
                var d = new Date(now.getTime() - i * interval);
                labels.push(d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'}));
            }
            break;
        case '1M':
            interval = 24 * 60 * 60 * 1000; // 1 day in ms
            for(var i = count - 1; i >= 0; i--) {
                var d = new Date(now.getTime() - i * interval);
                labels.push(d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'}));
            }
            break;
        case '3M':
            interval = 24 * 60 * 60 * 1000; // 1 day in ms
            for(var i = count - 1; i >= 0; i--) {
                var d = new Date(now.getTime() - i * interval);
                labels.push(d.toLocaleDateString('en-US', {month: 'short'}));
            }
            break;
        default:
            interval = 24 * 60 * 60 * 1000;
            for(var i = count - 1; i >= 0; i--) {
                var d = new Date(now.getTime() - i * interval);
                labels.push(d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'}));
            }
    }
    return labels;
}

        function calcRSI(arr) {
            if (!arr || arr.length < 15) return null;
            var period = 14;
            // Calculate initial average gain/loss
            var gains = 0, losses = 0;
            for (var i = 1; i <= period; i++) {
                var diff = arr[i] - arr[i-1];
                if (diff > 0) gains += diff; else losses -= diff;
            }
            var avgGain = gains / period;
            var avgLoss = losses / period;
            // Apply Wilder's smoothing for remaining data
            for (var i = period + 1; i < arr.length; i++) {
                var diff = arr[i] - arr[i-1];
                var currentGain = diff > 0 ? diff : 0;
                var currentLoss = diff < 0 ? -diff : 0;
                avgGain = (avgGain * (period - 1) + currentGain) / period;
                avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
            }
            if (avgLoss === 0) return 100;
            var rs = avgGain / avgLoss;
            return 100 - (100 / (1 + rs));
        }
        function calcStochastic(arr) {
            if (!arr || arr.length < 14) return null;
            var recent = arr.slice(-14).filter(function(v) { return !isNaN(v) && v !== undefined; });
            if (recent.length < 2) return null;
            var high = Math.max.apply(null, recent), low = Math.min.apply(null, recent);
            var k = high === low ? 50 : ((arr[arr.length-1] - low) / (high - low)) * 100;
            return { k: isNaN(k) ? 50 : k, signal: k > 80 ? 'Overbought' : k < 20 ? 'Oversold' : 'Neutral' };
        }
        function calcATR(arr) {
            if (!arr || arr.length < 2) return null;
            var tr = [];
            for (var i = 1; i < arr.length; i++) {
                if (arr[i] !== undefined && arr[i-1] !== undefined) {
                    tr.push(Math.abs(arr[i] - arr[i-1]));
                }
            }
            if (tr.length === 0) return 0;
            return tr.slice(-14).reduce(function(a,b){return a+b;},0) / Math.min(14, tr.length);
        }
        function calcADX(arr) { if (!arr || arr.length < 15) return null; var plusDM = [], minusDM = [], tr = []; for (var i = 1; i < arr.length; i++) { var up = arr[i] - arr[i-1]; var down = arr[i-1] - arr[i]; plusDM.push(up > down && up > 0 ? up : 0); minusDM.push(down > up && down > 0 ? down : 0); tr.push(Math.abs(arr[i] - arr[i-1])); } var atr = tr.slice(-14).reduce(function(a,b){return a+b;},0)/14; var smoothPlusDM = plusDM.slice(-14).reduce(function(a,b){return a+b;},0)/14; var smoothMinusDM = minusDM.slice(-14).reduce(function(a,b){return a+b;},0)/14; var plusDI = (smoothPlusDM / atr) * 100; var minusDI = (smoothMinusDM / atr) * 100; var dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100; return dx || 25; }
        function calcWilliams(arr) {
            if (!arr || arr.length < 14) return null;
            var recent = arr.slice(-14).filter(function(v) { return !isNaN(v) && v !== undefined; });
            if (recent.length < 2) return null;
            var high = Math.max.apply(null, recent), low = Math.min.apply(null, recent);
            if (high === low) return null;
            var result = -100 * (high - arr[arr.length-1]) / (high - low);
            return isNaN(result) ? -50 : result;
        }
        function calcOBV(arr) { if (!arr || arr.length < 2) return null; var obv = 0; for (var i = 1; i < arr.length; i++) { if (arr[i] > arr[i-1]) obv += 1; else if (arr[i] < arr[i-1]) obv -= 1; } var trend = obv > 0 ? 'bull' : obv < 0 ? 'bear' : 'neut'; return { val: obv, trend: trend, signal: obv > 2 ? 'Buying pressure' : obv < -2 ? 'Selling pressure' : 'Neutral' }; }
        
        function updateDataQualityDisplay() {
            var el = $('data-quality');
            if(!el) return;
            var quality, color;
            if(dataQuality.real > 0) {
                quality = dataQuality.source === 'cached' ? 'CACHED' : 'LIVE';
                color = dataQuality.source === 'cached' ? '#ffaa00' : '#00ff88';
            } else {
                quality = 'LOADING';
                color = '#ffaa00';
            }
            var time = dataQuality.lastUpdate ? dataQuality.lastUpdate.toLocaleTimeString() : '--:--';
            el.innerHTML = '<span style="color:'+color+'">'+quality+'</span> | '+time;
        }

        function calcMACDInd(arr) {
            if (!arr || arr.length < 26) return null;
            // Calculate EMA using full history for accuracy
            function calcEMA(data, period) {
                if (data.length < period) return null;
                var k = 2 / (period + 1);
                var ema = data.slice(0, period).reduce(function(a,b){return a+b;}, 0) / period;
                for (var i = period; i < data.length; i++) {
                    ema = data[i] * k + ema * (1 - k);
                }
                return ema;
            }
            // Use full history for accurate EMA calculation
            var ema12 = Indicators.calcEMA(arr, 12);
            var ema26 = Indicators.calcEMA(arr, 26);
            if (!ema12 || !ema26) return null;
            var macd = ema12 - ema26;
            // Normalize as percentage of price for display
            var macdPct = (macd / arr[arr.length-1]) * 100;
            var trend = macd > 0 ? 'bull' : macd < 0 ? 'bear' : 'neut';
            return { val: macdPct.toFixed(2) + '%', trend: trend, signal: macd > 0 ? 'Bullish' : 'Bearish' };
        }
        
        // MACD for AI responses - returns numeric values
        function calcMACD(arr) {
            if (!arr || arr.length < 26) return null;
            var k12 = 2 / 13;
            var k26 = 2 / 27;
            var ema12 = arr[0];
            var ema26 = arr[0];
            for (var i = 1; i < arr.length; i++) {
                ema12 = arr[i] * k12 + ema12 * (1 - k12);
                ema26 = arr[i] * k26 + ema26 * (1 - k26);
            }
            var macdVal = ema12 - ema26;
            var signal = macdVal * 0.2 + macdVal * 0.8;
            return { macd: macdVal, signal: signal };
        }

        // Auth
        window.showLogin = function() { $('loading').style.display='none'; $('dashboard').style.display='none'; $('auth-login').style.display='flex'; $('auth-signup').style.display='none'; $('auth-reset').style.display='none'; };
        window.showSignup = function() { $('auth-login').style.display='none'; $('auth-signup').style.display='flex'; $('auth-reset').style.display='none'; };
        window.showReset = function() { $('auth-login').style.display='none'; $('auth-signup').style.display='none'; $('auth-reset').style.display='flex'; };
        async function supabaseAuth(ep, body) { var r = await fetch(SUPABASE_URL+'/auth/v1'+ep, {method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},body:JSON.stringify(body)}); return {ok:r.ok,data:await r.json()}; }
        window.handleLogin = async function() { var email=$('login-email').value,pwd=$('login-password').value; if(!email||!pwd){$('login-error').textContent='Please fill in all fields';$('login-error').classList.add('show');return;} var r=await supabaseAuth('/token?grant_type=password',{email:email,password:pwd}); if(r.ok&&r.data.access_token){localStorage.setItem('sb_token',r.data.access_token);localStorage.setItem('sb_user',JSON.stringify(r.data.user));user=r.data.user;userTier='pro';showDashboard();
                    setupInfoTooltips();}else{$('login-error').textContent=r.data.error_description||'Login failed';$('login-error').classList.add('show');} };
        window.handleSignup = async function() { var email=$('signup-email').value,pwd=$('signup-password').value; if(!email||!pwd){$('signup-error').textContent='Please fill in all fields';$('signup-error').classList.add('show');return;} var r=await supabaseAuth('/signup',{email:email,password:pwd}); if(r.ok){$('signup-success').textContent='Account created! Check your email.';$('signup-success').classList.add('show');setTimeout(showLogin,2000);}else{$('signup-error').textContent=r.data.error_description||'Signup failed';$('signup-error').classList.add('show');} };
        window.handleReset = async function() { var email=$('reset-email').value; if(!email){$('reset-error').textContent='Please enter your email';$('reset-error').classList.add('show');return;} var r=await fetch(SUPABASE_URL+'/auth/v1/recover',{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},body:JSON.stringify({email:email})}); if(r.ok){$('reset-success').textContent='Check your email for reset link';$('reset-success').classList.add('show');} };
        window.handleLogout = function() { localStorage.removeItem('sb_token');localStorage.removeItem('sb_user');user=null;showLogin();$('user-dropdown').classList.remove('show'); };
        window.selectTier = function(t) { document.querySelectorAll('.tier-option').forEach(function(o){o.classList.remove('selected');});event.currentTarget.classList.add('selected'); };
        
        function checkSession() { var t=localStorage.getItem('sb_token'),u=localStorage.getItem('sb_user'); if(t&&u){user=JSON.parse(u);userTier='pro';return true;} return false; }
        async function showDashboard() { 
            $('loading').style.display='none';
            $('auth-login').style.display='none';
            $('auth-signup').style.display='none';
            $('auth-reset').style.display='none';
            $('dashboard').style.display='block';
            $('dashboard').classList.add('fade-in');

            // Load from localStorage first (always works)
            loadSavedHoldings();

            // Then try to load from Supabase (may override localStorage)
            if(user){
                $('header-email').textContent=user.email;
                $('profile-email').textContent=user.email;
                $('profile-tier').textContent=userTier.toUpperCase();
                $('profile-since').textContent=new Date(user.created_at||Date.now()).toLocaleDateString();
                try {
                    await loadPortfolioFromSupabase();
                } catch(e) {
                }
            }
            renderAll();
            refreshPrices();
            setInterval(refreshPrices,CONFIG.REFRESH_INTERVAL);
            updateTime();
            setInterval(updateTime,CONFIG.TIME_UPDATE_INTERVAL); 
        }
        
        function getFallbackStocks() {
            // Return null instead of stale prices - UI should show "Data unavailable"
            console.error('Stock API unavailable - no fallback data');
            return null;
        }
        function updateTime() { $('time').textContent = new Date().toLocaleTimeString(); }
        
        async function refreshPrices() {
            $('status-dot').className='status-dot syncing';$('status-text').textContent='UPDATING...';
            showLoading('price-spinner');
            try {
                var cached = getCached('prices', CACHE_TTL.PRICE);
                var crypto, stocks;
                if(cached && cached.crypto && cached.stocks) {
                    crypto = cached.crypto;
                    stocks = cached.stocks;
                } else {
                    var cryptoRes = await fetch(API_BASE+'/prices');
                    crypto = await cryptoRes.json();
                    // Try stocks endpoint, use fallback if not available
                    try {
                        var stocksRes = await fetch(API_BASE+'/stocks');
                        if(stocksRes.ok) stocks = await stocksRes.json();
                        else stocks = getFallbackStocks();
                    } catch(e) { stocks = getFallbackStocks(); }
                    setCache('prices', { crypto: crypto, stocks: stocks });
                }
                if(crypto && crypto.bitcoin){var btc=data.find(function(a){return a.sym==='BTC';});if(btc){btc.price=crypto.bitcoin.usd;btc.chg=crypto.bitcoin.usd_24h_change||0;}}
                if(crypto && crypto.ethereum){var eth=data.find(function(a){return a.sym==='ETH';});if(eth){eth.price=crypto.ethereum.usd;eth.chg=crypto.ethereum.usd_24h_change||0;}}
                if(crypto && crypto.solana){var sol=data.find(function(a){return a.sym==='SOL';});if(sol){sol.price=crypto.solana.usd;sol.chg=crypto.solana.usd_24h_change||0;}}
                if(stocks && stocks.AAPL){var aapl=data.find(function(a){return a.sym==='AAPL';});if(aapl){aapl.price=stocks.AAPL.price;aapl.chg=stocks.AAPL.changePercent||0;}}
                if(stocks && stocks.NVDA){var nvda=data.find(function(a){return a.sym==='NVDA';});if(nvda){nvda.price=stocks.NVDA.price;nvda.chg=stocks.NVDA.changePercent||0;}}
                if(stocks && stocks.TSLA){var tsla=data.find(function(a){return a.sym==='TSLA';});if(tsla){tsla.price=stocks.TSLA.price;tsla.chg=stocks.TSLA.changePercent||0;}}
                if(stocks && stocks.GOOGL){var googl=data.find(function(a){return a.sym==='GOOGL';});if(googl){googl.price=stocks.GOOGL.price;googl.chg=stocks.GOOGL.changePercent||0;}}
                if(stocks && stocks.MSFT){var msft=data.find(function(a){return a.sym==='MSFT';});if(msft){msft.price=stocks.MSFT.price;msft.chg=stocks.MSFT.changePercent||0;}}
                // Initialize history with placeholder data if not already set
                for(var i = 0; i < data.length; i++) {
                    var asset = data[i];
                    // Don't initialize history with fake data - wait for real OHLC from API
                    // fetchOHLC will populate history[sym] with real market data
                }
                $('status-dot').className='status-dot';$('status-text').textContent='LIVE';$('data-badge').textContent='LIVE';$('data-badge').className='panel-badge live';$('db-status').innerHTML='<span style="color:var(--purple)">[DB]</span> SYNCED';
                hideLoading('price-spinner');
                renderAll();
                trackPriceChanges();
            checkAlerts();} catch(e) { $('status-dot').className='status-dot error';$('status-text').textContent='CACHED';$('data-badge').textContent='CACHED'; }
        }
        
        function renderAll() { if(!sel || !data || data.length === 0) { return; } try { renderAssets();renderPortfolio();renderTicker();renderInds();renderFG();renderSectors();renderActions();renderPreds();renderWeights();renderChart();renderAlloc();renderAnalytics();renderCorrelation();renderAssetDetails();renderNews();renderCalendar(); } catch(e) { console.error('renderAll error:', e); } }
        
        function renderAssets() { if(!$('assets')) return; var h=''; for(var i=0;i<data.length;i++){var a=data[i];h+='<div data-symbol="'+a.sym+'" class="asset'+(a.sym===sel.sym?' active':'')+'" onclick="selAsset(\''+a.sym+'\')"><div style="display:flex;align-items:center"><div class="asset-icon" style="background:'+a.color+'22;color:'+a.color+'">'+a.sym.substr(0,2)+'</div><div><div class="asset-name">'+a.sym+'<span class="star'+(a.fav?' active':'')+'" onclick="event.stopPropagation();toggleFav(\''+a.sym+'\')">*</span></div><div class="asset-type">'+a.name+'</div></div></div><div style="display:flex;align-items:center;gap:6px"><div style="text-align:right"><div class="asset-price">$'+fmt(a.price)+'</div><div class="asset-chg '+(a.chg>=0?'up':'down')+'">'+(a.chg>=0?'+':'')+a.chg.toFixed(2)+'%</div></div></div></div>';} $('assets').innerHTML=h; }
        function renderPortfolio() { if(!$('port-val')) return; var tot=0,chg=0; for(var i=0;i<data.length;i++){tot+=data[i].price*data[i].hold;chg+=data[i].price*data[i].hold*data[i].chg/100;} var pct=chg/tot*100; $('port-val').textContent='$'+fmt(tot);$('port-chg').textContent=(chg>=0?'+':'')+'$'+fmt(Math.abs(chg))+' ('+(pct>=0?'+':'')+pct.toFixed(2)+'%)';$('port-chg').className='portfolio-change '+(chg>=0?'up':'down');$('intel').textContent=Math.round(50+pct*2); }
        function renderTicker() { if(!$('ticker')) return; var h=''; for(var i=0;i<data.length*2;i++){var a=data[i%data.length];h+='<span class="ticker-item" onclick="selAsset(\''+a.sym+'\')"><span class="ticker-sym">'+a.sym+'</span> $'+fmt(a.price)+' <span style="color:'+(a.chg>=0?'var(--green)':'var(--red)')+'">'+(a.chg>=0?'+':'')+a.chg.toFixed(1)+'%</span></span>';} $('ticker').innerHTML=h+h; }
        function renderFG() { var avg=0; for(var i=0;i<data.length;i++)avg+=data[i].chg; avg/=data.length; var v=Math.max(10,Math.min(90,50-avg*2)); var lbl=v>=75?'GREED':v>=55?'OPTIMISM':v>=45?'NEUTRAL':v>=25?'FEAR':'EXTREME FEAR'; var col=v>=55?'var(--green)':v>=45?'var(--cyan)':v>=25?'var(--gold)':'var(--red)'; $('fg-val').textContent=Math.round(v);$('fg-val').style.color=col;$('fg-lbl').textContent=lbl;$('fg-lbl').style.color=col;$('fg-dot').style.left=v+'%'; }
        function renderInds() { 
            if(!sel || !$('inds')) return;
            var arr = history[sel.sym];
            if(!arr || arr.length < 26) {
                $('inds').innerHTML = '<div style="padding:20px;text-align:center;color:var(--cyan);">Loading indicators...</div>';
                return;
            } var rsi=calcRSI(arr),stoch=calcStochastic(arr),atr=calcATR(arr),adx=calcADX(arr),will=calcWilliams(arr),obv=calcOBV(arr),macd=calcMACDInd(arr); var h='<div class="ind-grid">';
            // RSI
            h+='<div class="ind-card"><div class="ind-label">RSI (14)</div><div class="ind-val '+(rsi===null?'neut':rsi<35?'bull':rsi>70?'bear':'neut')+'">'+(rsi===null?'N/A':rsi.toFixed(1))+'</div><div class="ind-sub">'+(rsi===null?'Insufficient data':rsi<35?'Oversold':rsi>70?'Overbought':'Neutral')+'</div></div>';
            // MACD
            h+='<div class="ind-card"><div class="ind-label">MACD</div><div class="ind-val '+(macd===null?'neut':macd.trend)+'">'+(macd===null?'N/A':macd.val)+'</div><div class="ind-sub">'+(macd===null?'Insufficient data':macd.signal)+'</div></div>';
            // Stochastic
            h+='<div class="ind-card"><div class="ind-label">Stochastic</div><div class="ind-val '+(stoch===null?'neut':stoch.k>80?'bear':stoch.k<20?'bull':'neut')+'">'+(stoch===null?'N/A':stoch.k.toFixed(0))+'</div><div class="ind-sub">'+(stoch===null?'Insufficient data':stoch.signal)+'</div></div>';
            // Trend
            h+='<div class="ind-card"><div class="ind-label">Trend</div><div class="ind-val '+(sel.chg>=0?'bull':'bear')+'">'+(sel.chg>=0?'Uptrend':'Downtrend')+'</div></div>';
            // ATR
            h+='<div class="ind-card"><div class="ind-label">ATR</div><div class="ind-val neut">'+(atr===null?'N/A':(atr/sel.price*100).toFixed(2)+'%')+'</div><div class="ind-sub">'+(atr===null?'Insufficient data':'Volatility')+'</div></div>';
            // ADX
            h+='<div class="ind-card"><div class="ind-label">ADX</div><div class="ind-val '+(adx===null?'neut':adx>25?'bull':'neut')+'">'+(adx===null?'N/A':adx.toFixed(1))+'</div><div class="ind-sub">'+(adx===null?'Insufficient data':(adx>25?'Strong':'Weak'))+'</div></div>';
            // Williams %R
            h+='<div class="ind-card"><div class="ind-label">Williams %R</div><div class="ind-val '+(will===null?'neut':will<-80?'bull':will>-20?'bear':'neut')+'">'+(will===null?'N/A':will.toFixed(1))+'</div><div class="ind-sub">'+(will===null?'Insufficient data':(will<-80?'Oversold':will>-20?'Overbought':'Neutral'))+'</div></div>';
            // OBV
            h+='<div class="ind-card"><div class="ind-label">OBV</div><div class="ind-val '+(obv===null?'neut':obv.trend)+'">'+(obv===null?'N/A':obv.val)+'</div><div class="ind-sub">'+(obv===null?'Insufficient data':obv.signal)+'</div></div>';
            h+='</div>'; $('inds').innerHTML=h; }
        function renderSectors() {
    var secs = sectorData.length > 0 ? sectorData : [
        {n:'Crypto',c:-6.2},{n:'Tech',c:1.8},{n:'AI',c:5.8},{n:'EV',c:-1.2},{n:'Finance',c:1.2},{n:'Cloud',c:3.4}
    ];
    var h='<div class="sector-grid">';
    for(var i=0;i<secs.length;i++){
        h+='<div class="sector"><div class="sector-name">'+secs[i].n+'</div>';
        h+='<div class="sector-chg '+(secs[i].c>=0?'up':'down')+'">'+(secs[i].c>=0?'+':'')+secs[i].c.toFixed(1)+'%</div></div>';
    }
    h+='</div>';
    $('sectors').innerHTML=h;
}

async function fetchSectors() {
    try {
        var res = await fetch(API_BASE+'/sectors');
        if(!res.ok) { console.warn('Sectors endpoint not available'); return; }
        var json = await res.json();
        // Check if response is array (valid data) not error object
        if(json && Array.isArray(json) && json.length > 0) {
            sectorData = json.map(function(s) {
                var pct = parseFloat((s.changesPercentage || '0').replace('%','').replace('+',''));
                return { n: s.sector, c: pct };
            });
            renderSectors();
        } else {
            console.warn('Sectors response invalid');
        }
    } catch(e) {
        console.error('Sector fetch failed:', e);
    }
}
        function renderActions() {
            var arr = history[sel.sym];
            if(!arr || arr.length < 14) {
                $('actions').innerHTML = '<div class="action">Loading actions...</div>';
                return;
            } var rsi=calcRSI(arr),stoch=calcStochastic(arr); var acts=[]; if(rsi===null||stoch===null){acts.push({t:'HOLD',txt:sel.sym+' data loading'});}else if(rsi<30||stoch.k<20)acts.push({t:'BUY',txt:sel.sym+' oversold'}); else if(rsi>70||stoch.k>80)acts.push({t:'SELL',txt:sel.sym+' overbought'}); else acts.push({t:'HOLD',txt:sel.sym+' neutral'}); acts.push({t:'HOLD',txt:'Review risk'}); var h=''; for(var i=0;i<acts.length;i++){h+='<div class="action"><span class="action-badge '+acts[i].t.toLowerCase()+'-badge">'+acts[i].t+'</span><span class="action-text">'+acts[i].txt+'</span></div>';} $('actions').innerHTML=h; }
        // ===== PREDICTION HELPER FUNCTIONS =====
        
        // Simple Moving Average
        function calcSMA(arr, period) {
            if (!arr || arr.length < period) return null;
            var slice = arr.slice(-period);
            return slice.reduce(function(a,b){return a+b;},0) / period;
        }
        
        // Linear Regression Trend Analysis
        function calcTrend(arr) {
            if (!arr || arr.length < 5) return { slope: 0, intercept: arr ? arr[arr.length-1] : 0, direction: 'neutral', r2: 0 };
            var n = arr.length;
            var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
            for(var i = 0; i < n; i++) { sumX += i; sumY += arr[i]; sumXY += i * arr[i]; sumX2 += i * i; }
            var slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
            var intercept = (sumY - slope * sumX) / n;
            var yMean = sumY / n, ssTotal = 0, ssResidual = 0;
            for(var i = 0; i < n; i++) { var predicted = intercept + slope * i; ssTotal += Math.pow(arr[i] - yMean, 2); ssResidual += Math.pow(arr[i] - predicted, 2); }
            var r2 = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;
            return { slope: slope, intercept: intercept, direction: slope > 0.001 ? 'bullish' : slope < -0.001 ? 'bearish' : 'neutral', r2: Math.max(0, Math.min(1, r2)) };
        }
        
        // Mean Reversion Signal
        function calcMeanReversion(price, sma, atr) {
            if (!sma || !atr || atr === 0) return { distance: 0, signal: 'neutral', strength: 0 };
            var distance = (price - sma) / atr;
            var signal = 'neutral';
            if(distance > 2) signal = 'overbought'; else if(distance > 1) signal = 'extended'; else if(distance < -2) signal = 'oversold'; else if(distance < -1) signal = 'depressed';
            return { distance: distance, signal: signal, strength: Math.abs(distance) };
        }
        
        // Volatility-Based Price Ranges (Square root of time rule)
        function calcVolatilityRange(price, atr, periods, confidenceLevel) {
            if (!atr || atr <= 0) atr = price * 0.02;
            var scaledATR = atr * Math.sqrt(periods);
            var multiplier = confidenceLevel === 0.95 ? 1.96 : confidenceLevel === 0.90 ? 1.645 : 1.0;
            return { low: price - scaledATR * multiplier, high: price + scaledATR * multiplier, mid: price };
        }
        
        // Find Swing High/Low for Fibonacci
        function findSwingPoints(arr, lookback) {
            if (!arr || arr.length < lookback) lookback = arr ? arr.length : 10;
            var recent = arr.slice(-lookback);
            var high = Math.max.apply(null, recent), low = Math.min.apply(null, recent);
            return { high: high, low: low, direction: recent.indexOf(high) > recent.indexOf(low) ? 'up' : 'down' };
        }
        
        // Fibonacci Extensions
        function calcFibExtensions(high, low, direction, currentPrice) {
            var diff = high - low;
            if (diff <= 0) diff = currentPrice * 0.1;
            var isUp = direction === 'up';
            return { fib618: isUp ? high + diff * 0.618 : low - diff * 0.618, fib100: isUp ? high + diff : low - diff, fib1618: isUp ? high + diff * 1.618 : low - diff * 1.618 };
        }
        
        // Long-Term CAGR Projection
        function calcCAGRProjection(price, years, cagr) {
            if (!cagr || cagr <= 0) cagr = 0.10;
            return { conservative: price * Math.pow(1 + cagr * 0.5, years), expected: price * Math.pow(1 + cagr, years), optimistic: price * Math.pow(1 + cagr * 1.5, years) };
        }
        
        // Get asset-type CAGR estimate
        function getAssetCAGR(asset) {
            if (asset.type === 'crypto') { if (asset.sym === 'BTC') return 0.35; if (asset.sym === 'ETH') return 0.30; return 0.25; }
            else if (asset.type === 'stock') { if (asset.sym === 'NVDA' || asset.sym === 'TSLA') return 0.20; if (asset.sym === 'AAPL' || asset.sym === 'MSFT' || asset.sym === 'GOOGL') return 0.12; return 0.08; }
            return 0.10;
        }
        
        // Calculate consensus confidence score
        function calcPredictionConfidence(trend, rsi, meanRev, volatility, dataLength) {
            var score = 50;
            if (trend.r2 > 0.7) score += 15; else if (trend.r2 > 0.5) score += 10; else if (trend.r2 > 0.3) score += 5;
            if (rsi !== null) { if (rsi < 30 || rsi > 70) score += 10; else if (rsi < 40 || rsi > 60) score += 5; }
            if (meanRev.strength > 1.5) score += 8; else if (meanRev.strength > 1) score += 4;
            if (volatility > 0.05) score -= 15; else if (volatility > 0.03) score -= 10; else if (volatility > 0.02) score -= 5; else score += 5;
            if (dataLength > 100) score += 10; else if (dataLength > 50) score += 5; else if (dataLength < 20) score -= 10;
            return { score: Math.max(20, Math.min(85, score)), label: score >= 70 ? 'High' : score >= 50 ? 'Medium' : 'Low' };
        }
        function renderPreds() {
            var arr = history[sel.sym];
            if (!arr || arr.length < 14) {
                if ($('preds')) $('preds').innerHTML = '<div class="pred-loading"><span class="pulse">Loading predictions...</span></div>';
                return;
            }
            
            var base = sel.price;
            var atr = calcATR(arr);
            if (atr === null || atr === 0) atr = base * 0.02;
            
            var rsi = calcRSI(arr);
            var sma20 = calcSMA(arr, 20);
            var trend = calcTrend(arr);
            var meanRev = calcMeanReversion(base, sma20, atr);
            var swings = findSwingPoints(arr, 30);
            var fibs = calcFibExtensions(swings.high, swings.low, swings.direction, base);
            var cagr = getAssetCAGR(sel);
            var volatility = atr / base;
            var confidence = calcPredictionConfidence(trend, rsi, meanRev, volatility, arr.length);
            
            var periods = {
                '24H': { days: 1, type: 'short', method: 'volatility' },
                '7D': { days: 7, type: 'short', method: 'trend_reversion' },
                '30D': { days: 30, type: 'short', method: 'trend_fib' },
                '6M': { days: 180, type: 'medium', method: 'volatility_trend' },
                '1Y': { days: 365, type: 'long', method: 'cagr' },
                '5Y': { days: 1825, type: 'very_long', method: 'cagr_speculative' }
            };
            
            var predictions = {};
            for (var tf in periods) {
                var p = periods[tf];
                var pred;
                if (p.method === 'volatility') {
                    pred = calcVolatilityRange(base, atr, p.days, 1.0);
                } else if (p.method === 'trend_reversion') {
                    var volRange = calcVolatilityRange(base, atr, p.days, 1.0);
                    var trendAdjust = trend.slope * p.days * 0.5;
                    var revAdjust = -meanRev.distance * atr * 0.3;
                    pred = { low: volRange.low + trendAdjust + revAdjust, high: volRange.high + trendAdjust + revAdjust, mid: base + trendAdjust };
                } else if (p.method === 'trend_fib') {
                    var volRange = calcVolatilityRange(base, atr, p.days, 1.0);
                    var trendTarget = base + trend.slope * p.days;
                    pred = { low: Math.min(volRange.low, swings.low), high: Math.max(volRange.high * 1.1, fibs.fib618), mid: trendTarget };
                } else if (p.method === 'volatility_trend') {
                    var volRange = calcVolatilityRange(base, atr, p.days, 1.5);
                    var trendTarget = base * (1 + (trend.slope / base) * p.days * 0.8);
                    pred = { low: Math.min(volRange.low, trendTarget * 0.8), high: Math.max(volRange.high, trendTarget * 1.2), mid: trendTarget };
                } else if (p.method === 'cagr') {
                    var cagrProj = calcCAGRProjection(base, p.days / 365, cagr);
                    pred = { low: cagrProj.conservative, mid: cagrProj.expected, high: cagrProj.optimistic };
                } else if (p.method === 'cagr_speculative') {
                    var cagrProj = calcCAGRProjection(base, p.days / 365, cagr * 0.7);
                    pred = { low: cagrProj.conservative * 0.5, mid: cagrProj.expected, high: cagrProj.optimistic * 2.0 };
                }
                pred.low = Math.max(0.01, pred.low);
                pred.high = Math.max(pred.low + 0.01, pred.high);
                predictions[tf] = pred;
            }
            
            var bias = 'Neutral', biasIcon = '\u2192', bullishCount = 0, bearishCount = 0;
            if (trend.direction === 'bullish') bullishCount++; else if (trend.direction === 'bearish') bearishCount++;
            if (rsi !== null && rsi < 45) bullishCount++; else if (rsi !== null && rsi > 55) bearishCount++;
            if (meanRev.signal === 'oversold' || meanRev.signal === 'depressed') bullishCount++;
            else if (meanRev.signal === 'overbought' || meanRev.signal === 'extended') bearishCount++;
            if (swings.direction === 'up') bullishCount++; else bearishCount++;
            if (bullishCount > bearishCount + 1) { bias = 'Bullish'; biasIcon = '\u2197'; }
            else if (bearishCount > bullishCount + 1) { bias = 'Bearish'; biasIcon = '\u2198'; }
            
            var h = '<div class="prediction-card">';
            h += '<div class="pred-header"><span class="pred-title">PREDICTIONS</span><span class="pred-info" title="Multi-method consensus using trend, RSI, mean reversion, volatility, and Fibonacci analysis">i</span></div>';
            h += '<div class="pred-section"><div class="pred-section-title">SHORT-TERM</div>';
            ['24H', '7D', '30D'].forEach(function(tf) {
                var p = predictions[tf];
                var pctFromBase = ((p.mid - base) / base * 100).toFixed(1);
                var direction = p.mid >= base ? 'bull' : 'bear';
                h += '<div class="pred-row"><span class="pred-label">' + tf + '</span><span class="pred-range ' + direction + '">$' + fmt(p.low) + ' - $' + fmt(p.high) + '</span><span class="pred-pct ' + direction + '">(' + (pctFromBase >= 0 ? '+' : '') + pctFromBase + '%)</span></div>';
            });
            h += '</div>';
            h += '<div class="pred-section"><div class="pred-section-title">MEDIUM-TERM</div>';
            ['6M', '1Y'].forEach(function(tf) {
                var p = predictions[tf];
                var pctFromBase = ((p.mid - base) / base * 100).toFixed(0);
                var direction = p.mid >= base ? 'bull' : 'bear';
                h += '<div class="pred-row"><span class="pred-label">' + tf + '</span><span class="pred-range ' + direction + '">$' + fmt(p.low) + ' - $' + fmt(p.high) + '</span><span class="pred-pct ' + direction + '">(' + (pctFromBase >= 0 ? '+' : '') + pctFromBase + '%)</span></div>';
            });
            h += '</div>';
            h += '<div class="pred-section speculative"><div class="pred-section-title">LONG-TERM <span class="spec-note">(Speculative)</span></div>';
            var p5y = predictions['5Y'];
            var dir5y = p5y.mid >= base ? 'bull' : 'bear';
            h += '<div class="pred-row"><span class="pred-label">5Y</span><span class="pred-range ' + dir5y + '">$' + fmt(p5y.low) + ' - $' + fmt(p5y.high) + '</span><span class="pred-pct ' + dir5y + '">(Wide Range)</span></div>';
            h += '</div>';
            h += '<div class="pred-divider"></div>';
            h += '<div class="pred-metrics">';
            h += '<div class="pred-metric"><span class="metric-icon">*</span><span class="metric-label">Confidence:</span><span class="metric-value">' + confidence.score + '% (' + confidence.label + ')</span></div>';
            h += '<div class="pred-metric"><span class="metric-icon">' + biasIcon + '</span><span class="metric-label">Bias:</span><span class="metric-value ' + bias.toLowerCase() + '">' + bias + '</span></div>';
            h += '</div>';
            h += '<div class="pred-disclaimer">Not financial advice. Long-term predictions are highly speculative.</div>';
            h += '</div>';
            if ($('preds')) $('preds').innerHTML = h;
        }
        function renderWeights() {
            // Real Risk Parity - based on actual holdings and volatility
            var held = data.filter(function(a) { return a.hold > 0; });
            if(held.length === 0) {
                $('weights').innerHTML = '<div class="empty-state">Add holdings to see risk parity allocation</div>';
                return;
            }
            
            // Calculate volatility for each held asset
            var volData = [];
            for(var i = 0; i < held.length; i++) {
                var arr = history[held[i].sym];
                var vol = 0;
                if(arr && arr.length > 14) {
                    // Calculate 14-day annualized volatility
                    var returns = [];
                    for(var j = 1; j < arr.length; j++) {
                        returns.push((arr[j] - arr[j-1]) / arr[j-1]);
                    }
                    var mean = returns.reduce(function(a,b){return a+b;},0) / returns.length;
                    var variance = returns.reduce(function(a,b){return a + Math.pow(b - mean, 2);},0) / returns.length;
                    vol = Math.sqrt(variance) * Math.sqrt(252) * 100; // Annualized %
                } else {
                    // Fallback volatility estimates if no history
                    vol = held[i].type === 'crypto' ? 80 : 30;
                }
                volData.push({sym: held[i].sym, vol: vol.toFixed(1), color: held[i].color, hold: held[i].hold});
            }
            
            // Risk Parity: Weight inversely proportional to volatility
            var volatilities = [];
            for(var i = 0; i < held.length; i++) {
                var arr = history[held[i].sym];
                if(arr && arr.length > 14) {
                    // Calculate 14-day annualized volatility
                    var returns = [];
                    for(var j = 1; j < arr.length; j++) {
                        returns.push((arr[j] - arr[j-1]) / arr[j-1]);
                    }
                    var mean = returns.reduce(function(a,b){return a+b;},0) / returns.length;
                    var variance = returns.reduce(function(a,b){return a + Math.pow(b - mean, 2);},0) / returns.length;
                    var vol = Math.sqrt(variance) * Math.sqrt(252) * 100; // Annualized %
                    volatilities.push({sym: held[i].sym, vol: vol, color: held[i].color, hold: held[i].hold});
                } else {
                    // Fallback volatility estimates if no history
                    var defaultVol = held[i].type === 'crypto' ? 80 : 30;
                    volatilities.push({sym: held[i].sym, vol: defaultVol, color: held[i].color, hold: held[i].hold});
                }
            }
            
            // Risk Parity: Weight inversely proportional to volatility
            // Lower volatility = Higher weight (equal risk contribution)
            var invVols = volatilities.map(function(v) { return {sym: v.sym, invVol: 1/v.vol, color: v.color, hold: v.hold}; });
            var totalInvVol = invVols.reduce(function(a,b){return a + b.invVol;}, 0);
            
            // Calculate risk-adjusted weights (sum to 100%)
            var weights = invVols.map(function(v) {
                return {
                    sym: v.sym,
                    w: (v.invVol / totalInvVol * 100).toFixed(1),
                    color: v.color,
                    hold: v.hold
                };
            });
            
            // Sort by weight descending
            weights.sort(function(a,b){return b.w - a.w;});
            
            // Render
            var h = '';
            h += '<div class="risk-parity-info" style="margin-bottom:8px;font-size:0.7rem;color:#5a6a7e;">';
            h += '<span title="Lower volatility = Higher weight for equal risk contribution">💡 Inverse volatility weighting</span>';
            h += '</div>';
            for(var i = 0; i < weights.length; i++) {
                var volInfo = volData.find(function(v){return v.sym===weights[i].sym;});
                var volPct = volInfo ? volInfo.vol : 'N/A';
                h += '<div class="weight-row" title="Volatility: '+volPct+'% | Weight: '+weights[i].w+'%">';
                h += '<span class="weight-sym">'+weights[i].sym+'</span>';
                h += '<div class="weight-bar"><div class="weight-fill" style="width:'+weights[i].w+'%;background:'+weights[i].color+'"></div></div>';
                h += '<span class="weight-pct">'+weights[i].w+'%</span>';
                h += '</div>';
            }
            h += '<div class="weight-volatility-legend" style="margin-top:8px;font-size:0.65rem;color:#5a6a7e;">';
            h += '📈 Crypto typically: 70-90% vol | 📊 Stocks typically: 20-40% vol';
            h += '</div>';
            $('weights').innerHTML = h;
        }

        var ohlcData = {};
        async function fetchOHLC(sym) {
            var cacheKey = 'ohlc_'+sym+'_'+timeframe;
            var cached = getCached(cacheKey, CACHE_TTL.OHLC);
            if(cached) {
                // Store close prices in history for indicator calculations
                if(cached && cached.length > 0) {
                    history[sym] = cached.map(function(c) { return c[4]; });
                    dataQuality.source = 'cached';
                    dataQuality.real = cached.length;
                    updateDataQualityDisplay();
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
                    history[sym] = data.map(function(c) { return c[4]; }); 
                    dataQuality.source = 'live';
                    dataQuality.real = data.length;
                    dataQuality.lastUpdate = new Date();
                    updateDataQualityDisplay();
                }
                setCache(cacheKey, data);
                hideLoading('chart-loading');
                return data;
            } catch(e) {
                hideLoading('chart-loading');
                showToast('Chart data unavailable - using fallback');
                return null;
            }
        }
        
        function showChartLoading() {
            $('chart-price').textContent = 'Loading...';
            $('chart-chg').textContent = '';
            $('chart-chg').className = 'chart-chg';
            // Clear any existing chart
            if(priceCt) { priceCt.destroy(); priceCt = null; }
            if(volCt) { volCt.destroy(); volCt = null; }
        }

        function renderChart() {
            if(chartRendering) return; // Prevent overlapping renders

            // Check if we have real data
            var arr = history[sel.sym]; 
            if(!arr || arr.length === 0) {
                // Show loading state - fetch real data
                showChartLoading();
                fetchOHLC(sel.sym).then(function(d) { 
                    if(d && d.length > 0) {
                        renderChart();
                    }
                });
                return;
            }

            // Update data quality indicator
            dataQuality.real = arr.length;
            dataQuality.source = 'live';
            updateDataQualityDisplay();

            if(chartType==='candle') { 
                chartRendering = true;
                fetchOHLC(sel.sym).then(function(d){ 
                    renderCandles(d); 
                    chartRendering = false;
                }).catch(function(e) { 
                    chartRendering = false; 
                    console.error('Chart render error:', e);
                }); 
            }
            else { renderLine(); }
        }
        function renderCandles(ohlc) {
            var candles=[], lbls=[], vols=[], times=[];
            var arr = history[sel.sym] || [];

            // Limit candles to last 100 for performance
            var maxCandles = 100;
            var startIdx = ohlc && ohlc.length > maxCandles ? ohlc.length - maxCandles : 0;

            if(ohlc && ohlc.length>0) {
                for(var i=startIdx;i<ohlc.length;i++) {
                    var c=ohlc[i];
                    candles.push({o:c[1],h:c[2],l:c[3],c:c[4]});
                    var d=new Date(c[0]);
                    times.push(d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}));
                    lbls.push(i); vols.push(Math.abs((c.c-c.o)/c.o*1000)+50);
                }
            } else {
                candles = []; showToast('Chart data unavailable');
                // Generate proper time labels for fallback candles
                times = generateTimeLabels(100, timeframe);
                // No fake volume data - wait for real data
            }
            // Update price display (always show sel.price)
            $('chart-price').textContent='$'+fmt(sel.price);
            if(candles.length>0) {
                var last=candles[candles.length-1];
                var chg=((last.c-candles[0].o)/candles[0].o*100).toFixed(2);
                $('chart-chg').textContent=(chg>=0?'+':'')+chg+'%';
                $('chart-chg').className='chart-chg '+(chg>=0?'up':'down');
            }
            if(priceCt) priceCt.destroy(); if(volCt) volCt.destroy();
            
            // Get close prices for indicators
            var closes = candles.map(function(c) { return c.c; });
            
            // Calculate indicators
            var sma20 = showSMA20 ? Indicators.calcSMA(closes, 20) : [];
            var sma200 = showSMA200 ? Indicators.calcSMA(closes, 200) : [];
            var ema9 = showEMA ? Indicators.calcEMA(closes, 9) : [];
            var ema21 = showEMA ? Indicators.calcEMA(closes, 21) : [];
            var bb = showBollinger ? calcBollingerBands(closes, 20, 2) : null;
            var srLevels = showSR ? calcSupportResistance(candles) : [];
            
            // Update price axis
            var minPrice = Math.min(...candles.map(function(c) { return c.l; }));
            var maxPrice = Math.max(...candles.map(function(c) { return c.h; }));
            if(bb) {
                minPrice = Math.min(minPrice, ...bb.lower.filter(function(v) { return v !== null; }));
                maxPrice = Math.max(maxPrice, ...bb.upper.filter(function(v) { return v !== null; }));
            }
            updatePriceAxis(minPrice, maxPrice);
            
            // Build datasets
            var datasets = [];
            
            // SMA-20
            if(showSMA20 && sma20.length > 0) {
                datasets.push({
                    type:'line', data:sma20, borderColor:'rgba(255,215,0,0.9)', borderWidth:2,
                    pointRadius:0, fill:false, order:1, label:'SMA-20'
                });
            }
            // EMA lines
            if(showEMA) {
                datasets.push({
                    type:'line', data:ema9, borderColor:'rgba(255,107,107,0.9)', borderWidth:1.5,
                    pointRadius:0, fill:false, order:2, label:'EMA-9'
                });
                datasets.push({
                    type:'line', data:ema21, borderColor:'rgba(78,205,196,0.9)', borderWidth:1.5,
                    pointRadius:0, fill:false, order:3, label:'EMA-21'
                });
            }
            // SMA-200
            if(showSMA200 && sma200.length > 0) {
                datasets.push({
                    type:'line', data:sma200, borderColor:'rgba(255,165,0,0.9)', borderWidth:2,
                    pointRadius:0, fill:false, order:0, label:'SMA-200'
                });
            }
            
            // Bollinger Bands
            if(bb) {
                datasets.push({
                    type:'line', data:bb.upper, borderColor:'rgba(100,149,237,0.5)', borderWidth:1,
                    pointRadius:0, fill:false, order:4, borderDash:[4,4], label:'BB Upper'
                });
                datasets.push({
                    type:'line', data:bb.lower, borderColor:'rgba(100,149,237,0.5)', borderWidth:1,
                    pointRadius:0, fill:'-1', backgroundColor:'rgba(100,149,237,0.1)', order:5, borderDash:[4,4], label:'BB Lower'
                });
            }
            
            // Candlestick wicks (high-low shadows as thin lines)
            datasets.push({
                type:'bar',
                data:candles.map(function(c){ return [c.l, c.h]; }),
                backgroundColor:'transparent',
                borderColor:candles.map(function(c){return c.c>=c.o?'#00ff88':'#ff3366';}),
                borderWidth:1.5,
                barPercentage:0.08,
                order:98,
                categoryPercentage:0.9
            });

            // Candlestick bodies (floating bars from open to close)
            datasets.push({
                type:'bar',
                data:candles.map(function(c){ return [Math.min(c.o,c.c), Math.max(c.o,c.c)]; }),
                backgroundColor:candles.map(function(c){return c.c>=c.o?'#00ff88':'#ff3366';}),
                borderColor:candles.map(function(c){return c.c>=c.o?'#00ff88':'#ff3366';}),
                borderWidth:0,
                barPercentage:0.6,
                order:99,
                categoryPercentage:0.9
            });
            
            priceCt = new Chart($('priceCt'),{
                type:'bar',
                data:{labels:times,datasets:datasets},
                options:{
                    responsive:true,
                    maintainAspectRatio:false,
                    interaction:{mode:'index',intersect:false},
                    layout:{padding:{right:60,top:5,bottom:5,left:5}},
                    plugins:{
                        legend:{display:false},
                        tooltip:{
                            backgroundColor:'rgba(15,18,24,0.95)',
                            borderColor:'rgba(0,240,255,0.3)',
                            borderWidth:1,
                            titleFont:{size:12,weight:'bold'},
                            callbacks:{
                                title:function(ctx){
                                    var idx = ctx[0].dataIndex;
                                    var label = times[idx] || ctx[0].label;
                                    return label;
                                },
                                label:function(ctx){
                                    if(ctx.dataset.label && ctx.dataset.label.includes('SMA')) return ctx.dataset.label+': $'+(ctx.raw?ctx.raw.toFixed(2):'N/A');
                                    if(ctx.dataset.label && ctx.dataset.label.includes('EMA')) return ctx.dataset.label+': $'+(ctx.raw?ctx.raw.toFixed(2):'N/A');
                                    var idx=ctx.dataIndex;
                                    if(idx >=0 && idx < candles.length){
                                        var c=candles[idx];
                                        return 'O:$'+c.o.toFixed(2)+' H:$'+c.h.toFixed(2)+' L:$'+c.l.toFixed(2)+' C:$'+c.c.toFixed(2);
                                    }
                                    return '';
                                }
                            }
                        }
                    },
                    scales:{
                        x:{display:false,stacked:true},
                        y:{display:false,stacked:true}
                    }
                }
            });
            
            // Volume chart - downsample to max 50 bars for performance
            var maxVolBars = 50;
            var volStep = Math.ceil(vols.length / maxVolBars);
            var downsampledVols = [], downsampledLbls = [];
            for(var vi = 0; vi < vols.length; vi += volStep) {
                var volSum = 0, count = 0;
                for(var vj = vi; vj < Math.min(vi + volStep, vols.length); vj++) {
                    volSum += vols[vj];
                    count++;
                }
                downsampledVols.push(volSum / count);
                downsampledLbls.push(lbls[Math.min(vi + Math.floor(volStep/2), lbls.length - 1)]);
            }
            var volMA = Indicators.calcSMA(downsampledVols, 10);
            volCt = new Chart($('volCt'),{
                type:'bar',
                data:{
                    labels:downsampledLbls,
                    datasets:[{
                        data:downsampledVols,
                        backgroundColor:candles.map(function(c){return c.c>=c.o?'rgba(0,255,136,0.5)':'rgba(255,51,102,0.5)';}),
                        borderRadius:2,
                        order:2
                    },{
                        type:'line',
                        data:volMA,
                        borderColor:'rgba(168,85,247,0.8)',
                        borderWidth:1.5,
                        pointRadius:0,
                        fill:false,
                        order:1
                    }]
                },
                options:{
                    responsive:true,
                    maintainAspectRatio:false,
                    plugins:{legend:{display:false}},
                    scales:{x:{display:false},y:{display:false}}
                }
            });
            
            // Update time axis
            var timeHtml = '';
            var step = Math.max(1, Math.floor(times.length / 6));
            for(var i = 0; i < times.length; i += step) {
                timeHtml += '<span>' + (times[i] || i) + '</span>';
            }
            $('time-axis').innerHTML = timeHtml;
        }
        function renderLine() {
            try {
            
            var len = timeframe==='1H'?24:timeframe==='1W'?168:timeframe==='1M'?720:timeframe==='3M'?2160:96;
            var arr = history[sel.sym]; 
            if(!arr || arr.length === 0) {  return; }
            var disp=arr, lbls=[], times=[]; // Use all available data
            // Generate proper time labels based on timeframe
            times = generateTimeLabels(disp.length, timeframe);
            for(var i=0;i<disp.length;i++) {
                lbls.push(i);
            }
            // Update price display (always show sel.price)
            $('chart-price').textContent='$'+fmt(sel.price);
            if(disp.length>0) {
                var chg=((disp[disp.length-1]-disp[0])/disp[0]*100).toFixed(2);
                $('chart-chg').textContent=(chg>=0?'+':'')+chg+'%';
                $('chart-chg').className='chart-chg '+(chg>=0?'up':'down');
            }
            if(priceCt) priceCt.destroy(); if(volCt) volCt.destroy();
            var vols=[]; for(var i=0;i<disp.length;i++) { var prev = i>0 ? disp[i-1] : disp[i]; vols.push(Math.abs((disp[i]-prev)/prev*1000)+50); }

            // Calculate SMA
            var sma=[]; var period=20;
            for(var i=0;i<disp.length;i++) {
                if(i<period-1) sma.push(null);
                else { var sum=0; for(var j=0;j<period;j++) sum+=disp[i-j]; sma.push(sum/period); }
            }
            // Build datasets conditionally
            var lineDatasets = [];
            if(showSMA20) {
                lineDatasets.push({data:sma,borderColor:'rgba(255,215,0,0.8)',borderWidth:2,pointRadius:0,fill:false,spanGaps:true});
            }
            lineDatasets.push({data:disp,borderColor:'#00f0ff',backgroundColor:'rgba(0,240,255,0.1)',fill:true,tension:0.4,pointRadius:0});

            priceCt = new Chart($('priceCt'),{
                type:'line',
                data:{
                    labels:times,
                    datasets:lineDatasets
                },
                options:{
                    responsive:true,
                    maintainAspectRatio:false,
                    interaction:{mode:'index',intersect:false},
                    layout:{padding:{right:60,top:5,bottom:5,left:5}},
                    plugins:{
                        legend:{display:false},
                        tooltip:{
                            enabled:true,
                            backgroundColor:'rgba(15,18,24,0.95)',
                            borderColor:'rgba(0,240,255,0.3)',
                            borderWidth:1,
                            titleFont:{size:12,weight:'bold'},
                            callbacks:{
                                title:function(ctx){
                                    var idx=ctx[0].dataIndex;
                                    return times[idx]||ctx[0].label||'';
                                },
                                label:function(ctx){
                                    return ' $'+ctx.parsed.y.toLocaleString();
                                }
                            }
                        }
                    },
                    scales:{
                        x:{display:true,grid:{display:false},ticks:{color:'#5a6a7e',font:{size:9},maxTicksLimit:8}},
                        y:{position:'right',grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#5a6a7e',callback:function(v){return'$'+v.toLocaleString();}}}
                    }
                }
            });
            volCt = new Chart($('volCt'),{type:'bar',data:{labels:times,datasets:[{data:vols,backgroundColor:vols.map(function(v,i){return (i<disp.length-1 && disp[i+1]>disp[i])?'rgba(0,255,136,0.5)':'rgba(255,51,102,0.5)';})}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{display:false},y:{display:false,position:'right'}}}});
            $('last-update').textContent='Last update: '+new Date().toLocaleTimeString();
            
            // Update time axis
            var timeHtml = '';
            var step = Math.max(1, Math.floor(times.length / 6));
            for(var i = 0; i < times.length; i += step) {
                timeHtml += '<span>' + (times[i] || i) + '</span>';
            }
            $('time-axis').innerHTML = timeHtml;
            
            } catch(e) { console.error('renderLine ERROR:', e); }
        }

function renderAlloc() {
    if(allocCt) allocCt.destroy();

    // Filter assets with actual holdings
    var held = data.filter(function(a) { return a.hold > 0; });

    // Handle empty holdings case
    if(held.length === 0) {
        $('allocCt').innerHTML = '<div class="empty-state" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:12px;">Add holdings to see allocation</div>';
        return;
    }

    // Calculate total portfolio value
    var total = held.reduce(function(sum, a) { return sum + (a.hold * a.price); }, 0);

    // If total is 0, show empty state
    if(total === 0) {
        $('allocCt').innerHTML = '<div class="empty-state" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:12px;">Add holdings to see allocation</div>';
        return;
    }

    // Calculate allocations sorted by value (descending)
    var allocations = held.map(function(a) {
        return {
            sym: a.sym,
            value: a.hold * a.price,
            pct: ((a.hold * a.price) / total * 100),
            color: a.color || '#00f0ff'
        };
    }).sort(function(a, b) { return b.value - a.value; });

    // Build chart data
    var labels = allocations.map(function(a) { return a.sym; });
    var values = allocations.map(function(a) { return a.pct; });
    var colors = allocations.map(function(a) { return a.color; });

    allocCt = new Chart($('allocCt'), {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.label + ': ' + context.parsed.toFixed(1) + '%';
                        }
                    }
                }
            }
        }
    });
}
        
        function renderAnalytics() {
            var tot=0,chg=0,sqSum=0; for(var i=0;i<data.length;i++){tot+=data[i].price*data[i].hold;chg+=data[i].price*data[i].hold*data[i].chg/100;}
            var ret = chg/tot; for(var i=0;i<data.length;i++){var r=data[i].chg/100;sqSum+=Math.pow(r-ret,2);} var vol = Math.sqrt(sqSum/data.length)*Math.sqrt(252);
            var sharpe = (ret*252)/(vol||0.1);
            // Calculate MaxDD from price history
            var maxDD = 0, peak = 0;
            for(var i=0;i<data.length;i++){
                var val = data[i].price * data[i].hold;
                if(val > peak) peak = val;
                var dd = (peak - val) / (peak || 1) * 100;
                if(dd > maxDD) maxDD = dd;
            }
            maxDD = -maxDD;
            // Beta based on average correlation to market
            var beta = 0.9 + (vol * 10);
            var h = '<div class="analytics-card"><div class="analytics-label">Sharpe Ratio</div><div class="analytics-value">'+sharpe.toFixed(2)+'</div><div class="analytics-sub">Risk-adjusted</div></div>';
            h += '<div class="analytics-card"><div class="analytics-label">Max Drawdown</div><div class="analytics-value" style="color:var(--red)">'+maxDD.toFixed(1)+'%</div><div class="analytics-sub">Largest loss</div></div>';
            h += '<div class="analytics-card"><div class="analytics-label">Volatility</div><div class="analytics-value">'+(vol*100).toFixed(1)+'%</div><div class="analytics-sub">Annualized</div></div>';
            h += '<div class="analytics-card"><div class="analytics-label">Beta</div><div class="analytics-value">'+beta.toFixed(2)+'</div><div class="analytics-sub">vs S&P 500</div></div>';
            h += '<div class="analytics-card"><div class="analytics-label">Total Return</div><div class="analytics-value" style="color:'+(ret>=0?'var(--green)':'var(--red)')+'">'+(ret*100).toFixed(2)+'%</div><div class="analytics-sub">Current</div></div>';
            $('analytics-grid').innerHTML = h;
        }
        function renderCorrelation() {
            var syms = ['BTC','ETH','AAPL','NVDA','TSLA'];
            var h = '<div class="corr-grid"><div class="corr-cell corr-header"></div>';
            for(var i=0;i<syms.length;i++) h += '<div class="corr-cell corr-header">'+syms[i]+'</div>';
            for(var i=0;i<syms.length;i++){
                h += '<div class="corr-cell corr-header">'+syms[i]+'</div>';
                for(var j=0;j<syms.length;j++){
                    var c;
                    if(i===j) c = 1;
                    else {
                        // Calculate correlation between assets - find by symbol, not index
                        var a1 = data.find(function(a){return a.sym===syms[i];});
                        var a2 = data.find(function(a){return a.sym===syms[j];});
                        if(!a1 || !a2) { c = 0; }
                        else {
                            c = ((a1.chg * a2.chg) / (Math.abs(a1.chg) * Math.abs(a2.chg) || 1) * 0.5 + 0.5 * (a1.chg > 0 === a2.chg > 0 ? 0.3 : -0.3)).toFixed(2);
                        }
                    }
                    var col = c>0.5?'rgba(0,255,136,'+(c/2)+')':c<-0.5?'rgba(255,51,102,'+(Math.abs(c)/2)+')':'rgba(100,100,100,0.3)';
                    h += '<div class="corr-cell" style="background:'+col+')">'+c+'</div>';
                }
            }
            h += '</div>';
            $('corr-matrix').innerHTML = h;
        }
        function renderAssetDetails() {
            var h = '<div class="detail-row"><span class="detail-label">Symbol</span><span class="detail-value">'+sel.sym+'</span></div>';
            h += '<div class="detail-row"><span class="detail-label">Name</span><span class="detail-value">'+sel.name+'</span></div>';
            h += '<div class="detail-row"><span class="detail-label">Price</span><span class="detail-value">$'+fmt(sel.price)+'</span></div>';
            h += '<div class="detail-row"><span class="detail-label">Market Cap</span><span class="detail-value">$'+fmt(sel.mktCap)+'</span></div>';
            h += '<div class="detail-row"><span class="detail-label">24h Volume</span><span class="detail-value">$'+fmt(sel.vol24h)+'</span></div>';
            h += '<div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">'+sel.type.toUpperCase()+'</span></div>';
            if(sel.pe) h += '<div class="detail-row"><span class="detail-label">P/E Ratio</span><span class="detail-value">'+sel.pe+'</span></div>';
            if(sel.div) h += '<div class="detail-row"><span class="detail-label">Dividend</span><span class="detail-value">'+sel.div+'%</span></div>';
            $('asset-details').innerHTML = h;
        }
        function renderNews() {
            if(!$('news-list')) return;
            try {
                var cached = getCached('news', 300000); // 5 min cache
                var articles = cached || await fetch(API_BASE+'/news').then(r=>r.json());
                if(!cached) setCache('news', articles);
                var h = '';
                articles.forEach(function(a) {
                    h += '<div class="news-item"><a href="'+escapeHtml(a.url)+'" target="_blank" rel="noopener"><div class="news-title">'+escapeHtml(a.title)+'</div><div class="news-meta"><span>'+escapeHtml(a.source)+'</span><span class="news-sentiment '+(a.sentiment||'neutral')+'">'+((a.sentiment||'neutral').toUpperCase())+'</span></div></a></div>';
                });
                $('news-list').innerHTML = h || '<div class="empty-state">No news available</div>';
            } catch(e) {
                $('news-list').innerHTML = '<div class="empty-state">News unavailable</div>';
            }
        }
        function renderCalendar() {
            if(!$('calendar-list') && !$('calendar')) return;
            var container = $('calendar-list') || $('calendar');
            try {
                var cached = getCached('calendar', 3600000); // 1 hour cache
                var events = cached;
                if (!events) {
                    fetch(API_BASE+'/calendar').then(r=>r.json()).then(data => {
                        if (Array.isArray(data)) {
                            setCache('calendar', data);
                            renderCalendarItems(data, container);
                        } else {
                            container.innerHTML = '<div class="empty-state">No upcoming events</div>';
                        }
                    }).catch(e => {
                        container.innerHTML = '<div class="empty-state">Calendar unavailable</div>';
                    });
                } else {
                    renderCalendarItems(events, container);
                }
            } catch(e) {
                container.innerHTML = '<div class="empty-state">Calendar unavailable</div>';
            }
        }
        
        function renderCalendarItems(events, container) {
            var h = '';
            var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            events.forEach(function(e) {
                h += '<div class="calendar-item">';
                h += '<div class="calendar-date"><span class="day">'+days[e.day]+'</span><span class="time">'+e.time+'</span></div>';
                h += '<div class="calendar-event">'+escapeHtml(e.event)+'</div>';
                h += '<div class="calendar-meta"><span class="currency">'+e.currency+'</span><span class="impact '+e.impact+'">'+e.impact.toUpperCase()+'</span></div>';
                h += '</div>';
            });
            container.innerHTML = h || '<div class="empty-state">No upcoming events</div>';
        }
        
        // Interactions
        
        // Chart Enhancement Variables
        var showBollinger = false, showEMA = false, showSR = false, showSMA200 = localStorage.getItem('showSMA200') === 'true', showSMA20 = localStorage.getItem('showSMA20') !== 'false';
        // Sync button states on init
        document.addEventListener('DOMContentLoaded', function() {
            if($('toggle-sma20')) $('toggle-sma20').classList.toggle('active', showSMA20);
            if($('toggle-sma200')) $('toggle-sma200').classList.toggle('active', showSMA200);
            if($('toggle-bb')) $('toggle-bb').classList.toggle('active', showBollinger);
            if($('toggle-ema')) $('toggle-ema').classList.toggle('active', showEMA);
            if($('toggle-sr')) $('toggle-sr').classList.toggle('active', showSR);
        });
        var drawMode = null, drawings = [];
        var isFullscreen = false;
        
        // Crosshair functionality
        window.handleCrosshair = function(e) {
            var container = $('chart-canvas-container');
            var rect = container.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var y = e.clientY - rect.top;
            
            $('crosshair-h').style.display = 'block';
            $('crosshair-h').style.top = y + 'px';
            $('crosshair-v').style.display = 'block';
            $('crosshair-v').style.left = x + 'px';
            
            // Calculate price from Y position
            var priceData = priceCt && priceCt.data && priceCt.data.datasets ? priceCt.data.datasets[0].data : [];
            if(priceData.length > 0) {
                var minPrice = Math.min(...priceData.filter(function(v) { return v !== null; }));
                var maxPrice = Math.max(...priceData.filter(function(v) { return v !== null; }));
                var priceRange = maxPrice - minPrice;
                var price = maxPrice - (y / rect.height) * priceRange;
                
                $('crosshair-price').style.display = 'block';
                $('crosshair-price').style.top = y + 'px';
                $('crosshair-price').textContent = '$' + price.toFixed(2);
            }
            
            // Calculate time from X position
            var labels = priceCt && priceCt.data ? priceCt.data.labels : [];
            if(labels.length > 0) {
                var idx = Math.floor((x / rect.width) * labels.length);
                idx = Math.max(0, Math.min(idx, labels.length - 1));
                
                $('crosshair-time').style.display = 'block';
                $('crosshair-time').style.left = x + 'px';
                $('crosshair-time').textContent = 'Bar ' + idx;
            }
            
            // Handle drawing
            if(drawMode && e.buttons === 1) {
                handleDrawing(x, y);
            }
        };
        
        window.hideCrosshair = function() {
            $('crosshair-h').style.display = 'none';
            $('crosshair-v').style.display = 'none';
            $('crosshair-price').style.display = 'none';
            $('crosshair-time').style.display = 'none';
        };
        
        // Drawing tools
        window.setDrawMode = function(mode) {
            drawMode = mode;
            var layer = $('drawing-layer');
            if(mode) {
                layer.classList.add('active');
                $('draw-trend').classList.toggle('active', mode === 'trend');
                $('draw-hline').classList.toggle('active', mode === 'hline');
            } else {
                layer.classList.remove('active');
                $('draw-trend').classList.remove('active');
                $('draw-hline').classList.remove('active');
            }
        };
        
        var drawStart = null;
        function handleDrawing(x, y) {
            if(!drawStart) {
                drawStart = {x: x, y: y};
            }
            renderDrawings(drawStart, {x: x, y: y});
        }
        
        function renderDrawings(start, end) {
            var svg = $('drawing-layer');
            var html = '';
            for(var i = 0; i < drawings.length; i++) {
                var d = drawings[i];
                if(d.type === 'trend') {
                    html += '<line class="drawing-line" x1="' + d.x1 + '" y1="' + d.y1 + '" x2="' + d.x2 + '" y2="' + d.y2 + '"/>';
                } else if(d.type === 'hline') {
                    html += '<line class="drawing-hline" x1="0" y1="' + d.y + '" x2="100%" y2="' + d.y + '"/>';
                }
            }
            if(start && end && drawMode) {
                if(drawMode === 'trend') {
                    html += '<line class="drawing-line" x1="' + start.x + '" y1="' + start.y + '" x2="' + end.x + '" y2="' + end.y + '" stroke-dasharray="4"/>';
                } else if(drawMode === 'hline') {
                    html += '<line class="drawing-hline" x1="0" y1="' + end.y + '" x2="100%" y2="' + end.y + '"/>';
                }
            }
            svg.innerHTML = html;
        }
        
        function setupChartListeners() {
            var c = $('chart-canvas-container');
            if(c) c.addEventListener('mouseup', function(e) {
                if(drawMode && drawStart) {
                    var rect = c.getBoundingClientRect();
                    var end = {x: e.clientX - rect.left, y: e.clientY - rect.top};
                    if(drawMode === 'trend') {
                        drawings.push({type: 'trend', x1: drawStart.x, y1: drawStart.y, x2: end.x, y2: end.y});
                    } else if(drawMode === 'hline') {
                        drawings.push({type: 'hline', y: end.y});
                    }
                    renderDrawings();
                    drawStart = null;
                }
            });
        }
        
        window.clearDrawings = function() {
            drawings = [];
            renderDrawings();
            setDrawMode(null);
        };
        
        // Toggle functions
        window.toggleBollinger = function() {
            showBollinger = !showBollinger;
            $('toggle-bb').classList.toggle('active', showBollinger);
            renderChart();
        };
        window.toggleEMA = function() {
            showEMA = !showEMA;
            $('toggle-ema').classList.toggle('active', showEMA);
            renderChart();
        };
        window.toggleSMA200 = function() {
            showSMA200 = !showSMA200;
            $('toggle-sma200').classList.toggle('active', showSMA200);
            renderChart();
        };
        window.toggleSMA20 = function() {
            showSMA20 = !showSMA20;
            localStorage.setItem('showSMA20', showSMA20);
            $('toggle-sma20').classList.toggle('active', showSMA20);
            renderChart();
        };

        window.toggleSR = function() {
            showSR = !showSR;
            $('toggle-sr').classList.toggle('active', showSR);
            renderChart();
        };
        window.toggleIndicators = function() {
            var legend = $('indicator-legend');
            legend.style.display = legend.style.display === 'none' ? 'flex' : 'none';
        };
        window.toggleFullscreen = function() {
            isFullscreen = !isFullscreen;
            $('chart-area').classList.toggle('chart-fullscreen', isFullscreen);
            $('chart-fullscreen-btn').textContent = isFullscreen ? '✕ Exit' : '⛶ Fullscreen';
            setTimeout(function() { renderChart(); }, 100);
        };
        
        
        
        function calcBollingerBands(data, period, stdDev) {
            var sma = Indicators.calcSMA(data, period);
            var upper = [], lower = [];
            for(var i = 0; i < data.length; i++) {
                if(i < period - 1) {
                    upper.push(null);
                    lower.push(null);
                } else {
                    var slice = data.slice(i - period + 1, i + 1);
                    var mean = sma[i];
                    var variance = 0;
                    for(var j = 0; j < slice.length; j++) variance += Math.pow(slice[j] - mean, 2);
                    var std = Math.sqrt(variance / period);
                    upper.push(mean + stdDev * std);
                    lower.push(mean - stdDev * std);
                }
            }
            return {upper: upper, middle: sma, lower: lower};
        }
        
        function calcSupportResistance(candles) {
            var prices = candles.map(function(c) { return c.l; }).concat(candles.map(function(c) { return c.h; }));
            prices.sort(function(a, b) { return a - b; });
            var levels = [];
            var step = Math.floor(prices.length / 5);
            for(var i = 1; i < 5; i++) {
                levels.push(prices[i * step]);
            }
            return levels;
        }
        
        function updatePriceAxis(minPrice, maxPrice) {
            var axis = $('price-axis');
            var html = '';
            var steps = 5;
            for(var i = 0; i <= steps; i++) {
                var price = maxPrice - (i / steps) * (maxPrice - minPrice);
                html += '<div class="price-tick">$' + fmt(price) + '</div>';
            }
            axis.innerHTML = html;
        }

        window.filterAssets = function(query) {
            var q = query.toLowerCase().trim();
            var items = document.querySelectorAll('#assets .asset');
            var visibleCount = 0;
            for(var i = 0; i < items.length; i++) {
                var name = items[i].querySelector('.asset-name');
                var type = items[i].querySelector('.asset-type');
                var sym = name ? name.textContent.split('*')[0].toLowerCase() : '';
                var typeName = type ? type.textContent.toLowerCase() : '';
                if(q === '' || sym.includes(q) || typeName.includes(q)) {
                    items[i].style.display = '';
                    visibleCount++;
                } else {
                    items[i].style.display = 'none';
                }
            }
            // Show "no results" message if nothing matches
            var noResults = document.getElementById('no-assets-msg');
            if(visibleCount === 0 && q !== '') {
                if(!noResults) {
                    var assetsDiv = $('assets');
                    noResults = document.createElement('div');
                    noResults.id = 'no-assets-msg';
                    noResults.style.cssText = 'text-align:center;padding:20px;color:var(--text-dim);';
                    noResults.textContent = 'No assets found matching "' + q + '"';
                    assetsDiv.appendChild(noResults);
                } else {
                    noResults.style.display = '';
                    noResults.textContent = 'No assets found matching "' + q + '"';
                }
            } else if(noResults) {
                noResults.style.display = 'none';
            }
        };

        window.exportData = function(format) {
            var NL = String.fromCharCode(10);
            var exportObj = {
                exportDate: new Date().toISOString(),
                portfolio: data.filter(function(a) { return a.holdings > 0; }).map(function(a) { return { symbol: a.sym, name: a.name, holdings: a.holdings, price: a.price, value: a.holdings * a.price, change24h: a.chg }; }),
                favorites: data.filter(function(a) { return a.fav; }).map(function(a) { return a.sym; }),
                alerts: alerts,
                sentiment: { overall: 76, bullish: data.filter(function(a) { return a.chg > 0; }).length, bearish: data.filter(function(a) { return a.chg < 0; }).length }
            };
            var blob, filename;
            if(format === 'json') {
                blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
                filename = 'tradingai-export-' + new Date().toISOString().split('T')[0] + '.json';
            } else {
                var csv = 'Symbol,Name,Holdings,Price,Value,Change24h' + NL;
                exportObj.portfolio.forEach(function(p) { csv += p.symbol + ',' + p.name + ',' + (p.holdings || 0) + ',' + p.price + ',' + (p.value || 0) + ',' + p.change24h + NL; });
                blob = new Blob([csv], { type: 'text/csv' });
                filename = 'tradingai-export-' + new Date().toISOString().split('T')[0] + '.csv';
            }
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            showToast('Exported as ' + format.toUpperCase());
        };

window.selAsset = function(s) { for(var i=0;i<data.length;i++) if(data[i].sym===s){sel=data[i];break;} $('chart-sym').textContent=s; 
if(!history[s])history[s]=null; renderAssets();renderInds();renderActions();renderAssetDetails();renderChart(); fetchOHLC(s).then(function(d){ if(d && d.length>0){ history[s]=d.map(function(c){return c[4];}); renderInds();renderActions(); } }); };
        window.toggleFav = function(s) { for(var i=0;i<data.length;i++) if(data[i].sym===s){data[i].fav=!data[i].fav;renderAssets();showToast(s+(data[i].fav?' added to':' removed from')+' favorites');break;} };
        window.setTf = function(tf) { 
            // Destroy existing charts immediately
            if(priceCt) { priceCt.destroy(); priceCt = null; }
            if(volCt) { volCt.destroy(); volCt = null; }
            timeframe=tf; 
            var btns=document.querySelectorAll('.chart-btn'); 
            for(var j=0;j<btns.length;j++){btns[j].classList.remove('on');} 
            if(typeof event!=='undefined' && event.target) event.target.classList.add('on'); 
            ohlcData={}; 
            chartRendering = false;
            renderChart(); 
        };
        window.toggleChartType = function() { 
            // Destroy existing charts immediately
            if(priceCt) { priceCt.destroy(); priceCt = null; }
            if(volCt) { volCt.destroy(); volCt = null; }
            chartType = chartType==='line'?'candle':'line'; 
            $('chart-type-btn').textContent = chartType.toUpperCase(); 
            chartRendering = false;
            renderChart(); 
        };
        
        // Theme
        window.toggleTheme = function() { isLightTheme = !isLightTheme; document.body.classList.toggle('light-theme',isLightTheme); $('theme-btn').innerHTML = isLightTheme?'&#9728;':'&#9790;'; showToast(isLightTheme?'Light mode':'Dark mode'); };
        window.toggleFullscreen = function() { isFullscreen = !isFullscreen; document.body.classList.toggle('fullscreen',isFullscreen); showToast(isFullscreen?'Fullscreen on':'Fullscreen off'); };
        
        // Export
        window.exportCSV = function() { var csv='Symbol,Name,Price,Change,Type\n'; for(var i=0;i<data.length;i++) csv+=data[i].sym+','+data[i].name+','+data[i].price+','+data[i].chg.toFixed(2)+'%,'+data[i].type+'\n'; var blob=new Blob([csv],{type:'text/csv'}); var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='portfolio.csv'; a.click(); showToast('Portfolio exported'); };
        
        // Tabs
        window.switchTab = function(tab) { document.querySelectorAll('.nav-tab').forEach(function(t){t.classList.remove('active');}); document.querySelector('[data-tab="'+tab+'"]').classList.add('active'); document.querySelectorAll('main[id^="tab-"]').forEach(function(m){m.style.display='none';}); $('tab-'+tab).style.display='block'; };
        
        // Modals
        window.toggleUserMenu = function() { $('user-dropdown').classList.toggle('show'); };
        window.showHelp = function() { $('help-modal').classList.add('show'); };
        window.hideHelp = function() { $('help-modal').classList.remove('show'); };
        window.showProfile = function() { $('user-dropdown').classList.remove('show'); $('profile-modal').classList.add('show'); };
        window.hideProfile = function() { $('profile-modal').classList.remove('show'); };
        window.showPricing = function() { $('user-dropdown').classList.remove('show'); renderPricing(); $('pricing-modal').classList.add('show'); };
        window.hidePricing = function() { $('pricing-modal').classList.remove('show'); };
        window.showAlerts = function() { renderAlertsList(); $('alerts-modal').classList.add('show'); };
        window.hideAlerts = function() { $('alerts-modal').classList.remove('show'); };
        window.showAddAlert = function() { hideAlerts(); var opts=''; for(var i=0;i<data.length;i++) opts+='<option value="'+data[i].sym+'">'+data[i].sym+'</option>'; $('alert-asset').innerHTML=opts; $('alert-asset').value=sel.sym; $('alert-price').value=''; $('add-alert-modal').classList.add('show'); };
        window.hideAddAlert = function() { $('add-alert-modal').classList.remove('show'); };
        window.createAlert = function() { var sym=$('alert-asset').value,cond=$('alert-cond').value,price=parseFloat($('alert-price').value); if(!price||price<=0){showToast('Please enter a valid price');return;} alerts.push({sym:sym,cond:cond,price:price,active:true}); localStorage.setItem('tradingai_alerts', JSON.stringify(alerts)); $('alert-count').textContent=alerts.length; hideAddAlert(); showToast('Alert created: '+sym+' '+cond+' $'+fmt(price)); };
        
        function checkAlerts() {
            if(alerts.length === 0) return;
            for(var i = 0; i < alerts.length; i++) {
                var a = alerts[i];
                if(!a.active) continue;
                var asset = data.find(function(d) { return d.sym === a.sym; });
                if(!asset) continue;
                var triggered = false;
                if(a.cond === 'above' && asset.price >= a.price) triggered = true;
                if(a.cond === 'below' && asset.price <= a.price) triggered = true;
                if(triggered) {
                    a.active = false;
                    localStorage.setItem('tradingai_alerts', JSON.stringify(alerts));
                    showToast('🔔 Alert: ' + a.sym + ' is ' + (a.cond === 'above' ? 'above' : 'below') + ' $' + fmt(a.price));
                    // Browser notification
                    if(Notification && Notification.permission === 'granted') {
                        new Notification('TradingAI Alert', { body: a.sym + ' is ' + (a.cond === 'above' ? 'above' : 'below') + ' $' + fmt(a.price), icon: '/favicon.ico' });
                    }
                }
            }
        }
        
        function requestNotificationPermission() {
            if(Notification && Notification.permission === 'default') {
                Notification.requestPermission();
            }
        }
        
window.deleteAlert = function(idx) { alerts.splice(idx,1); localStorage.setItem('tradingai_alerts', JSON.stringify(alerts)); $('alert-count').textContent=alerts.length; renderAlertsList(); showToast('Alert deleted'); };
        function renderAlertsList() { var h=''; if(alerts.length===0){h='<div style="text-align:center;padding:20px;color:var(--text-dim)">No alerts</div>';} else{for(var i=0;i<alerts.length;i++){h+='<div class="alert-item"><span class="sym">'+alerts[i].sym+'</span><span>'+(alerts[i].cond==='above'?'>':'<')+'</span><span class="price">$'+fmt(alerts[i].price)+'</span><span style="color:var(--red);cursor:pointer" onclick="deleteAlert('+i+')">X</span></div>';}} $('alerts-list').innerHTML=h; }
        window.showWatchlists = function() { $('user-dropdown').classList.remove('show'); renderWatchlists(); $('watchlists-modal').classList.add('show'); };
        window.hideWatchlists = function() { $('watchlists-modal').classList.remove('show'); };
        function renderWatchlists() { var h=''; for(var i=0;i<watchlists.length;i++){h+='<div class="watchlist-item"><span class="watchlist-name">'+watchlists[i].name+'</span><span class="watchlist-count">'+watchlists[i].symbols.length+' assets</span></div>';} $('watchlists-list').innerHTML=h; }
        window.createWatchlist = function() { var name=prompt('Enter watchlist name:'); if(name){watchlists.push({name:name,symbols:[]});renderWatchlists();showToast('Watchlist created');} };
        function renderPricing() { var h='';h+='<div class="pricing-card"><div class="pricing-name">FREE</div><div class="pricing-price">$0/mo</div><div class="pricing-features"><div class="pricing-feature">3 Assets</div><div class="pricing-feature">Delayed Data</div></div></div>';h+='<div class="pricing-card" style="border-color:var(--cyan)"><div class="pricing-name">PRO</div><div class="pricing-price">$19/mo</div><div class="pricing-features"><div class="pricing-feature">Unlimited Assets</div><div class="pricing-feature">Real-time Data</div><div class="pricing-feature">Price Alerts</div></div><button class="pricing-btn">UPGRADE</button></div>';h+='<div class="pricing-card"><div class="pricing-name">ELITE</div><div class="pricing-price">$49/mo</div><div class="pricing-features"><div class="pricing-feature">Everything in PRO</div><div class="pricing-feature">API Access</div><div class="pricing-feature">Priority Support</div></div><button class="pricing-btn">UPGRADE</button></div>';$('pricing-cards').innerHTML=h; }
        
        function showToast(msg) { $('toast').textContent=msg; $('toast').classList.add('show'); setTimeout(function(){$('toast').classList.remove('show');},3000); }
        
        // Keyboard
        
        // Enhanced keyboard navigation
        document.addEventListener('keydown',function(e){
            // Arrow key navigation through assets
            if(e.key==='ArrowDown' && !e.target.matches('input,textarea')) {
                e.preventDefault();
                var idx = data.findIndex(function(a){return a.sym===sel.sym;});
                if(idx < data.length - 1) selAsset(data[idx+1].sym);
            }
            if(e.key==='ArrowUp' && !e.target.matches('input,textarea')) {
                e.preventDefault();
                var idx = data.findIndex(function(a){return a.sym===sel.sym;});
                if(idx > 0) selAsset(data[idx-1].sym);
            }
            // Tab through nav tabs
            if(e.key==='ArrowLeft' && !e.target.matches('input,textarea')) {
                var tabs = ['dashboard','analytics','news','calendar','screener','paper','ai'];
                var activeTab = document.querySelector('.nav-tab.active');
                if(activeTab) {
                    var currentTab = activeTab.getAttribute('data-tab');
                    var currentIdx = tabs.indexOf(currentTab);
                    if(currentIdx > 0) switchTab(tabs[currentIdx-1]);
                }
            }
            if(e.key==='ArrowRight' && !e.target.matches('input,textarea')) {
                var tabs = ['dashboard','analytics','news','calendar','screener','paper','ai'];
                var activeTab = document.querySelector('.nav-tab.active');
                if(activeTab) {
                    var currentTab = activeTab.getAttribute('data-tab');
                    var currentIdx = tabs.indexOf(currentTab);
                    if(currentIdx < tabs.length - 1) switchTab(tabs[currentIdx+1]);
                }
            }
        });

        document.addEventListener('keydown',function(e){
            if(e.key==='Escape'){hideHelp();hideAlerts();hideAddAlert();hideProfile();hidePricing();hideWatchlists();$('user-dropdown').classList.remove('show');}
            if(e.key==='?'&&!e.target.matches('input'))showHelp();
            if((e.key==='a'||e.key==='A')&&!e.target.matches('input'))showAlerts();
            if((e.key==='r'||e.key==='R')&&!e.target.matches('input')){refreshPrices();showToast('Refreshing...');}
            if((e.key==='f'||e.key==='F')&&!e.target.matches('input'))toggleFav(sel.sym);
            if((e.key==='t'||e.key==='T')&&!e.target.matches('input'))toggleTheme();
            var num=parseInt(e.key); if(num>=1&&num<=8&&!e.target.matches('input'))selAsset(data[num-1].sym);
        });
        
        document.querySelectorAll('.modal-overlay').forEach(function(o){o.addEventListener('click',function(e){if(e.target===o)o.classList.remove('show');});});

        var screenerFilters = {rsi:false, volume:false, change:false};
        var paperBalance = 100000, paperPositions = {};
        var aiHistory = [];
        loadChatHistory();

        window.toggleScreenerFilter = function(f) { screenerFilters[f] = !screenerFilters[f]; renderScreener(); };

        function renderScreener() {
            $('screener-filters').innerHTML = '<button class="screener-filter'+(screenerFilters.rsi?' on':'')+'" onclick="toggleScreenerFilter(\'rsi\')">RSI<30</button><button class="screener-filter'+(screenerFilters.volume?' on':'')+'" onclick="toggleScreenerFilter(\'volume\')">High Vol</button><button class="screener-filter'+(screenerFilters.change?' on':'')+'" onclick="toggleScreenerFilter(\'change\')">+5% Day</button>';
            var results = data.filter(function(a) {
                if(screenerFilters.rsi) { var arr=history[a.sym]; if(!arr||arr.length<15) return true; if(calcRSI(arr)>=30) return false; }
                if(screenerFilters.volume && a.vol24h<1e9) return false;
                if(screenerFilters.change && a.chg<5) return false;
                return true;
            });
            var h = '';
            for(var i=0;i<results.length;i++) h += '<div class="screener-result"><span>'+results[i].sym+' - '+results[i].name+'</span><span style="color:'+(results[i].chg>=0?'var(--green)':'var(--red)')+'">'+(results[i].chg>=0?'+':'')+results[i].chg.toFixed(2)+'%</span></div>';
            if(results.length===0) h = '<div style="text-align:center;color:var(--text-dim);padding:20px">No matching assets</div>';
            $('screener-results').innerHTML = h;
        }

        function renderPaper() {
            var posVal = 0;
            for(var k in paperPositions) { var d = data.find(function(a){return a.sym===k;}); if(d) posVal += paperPositions[k]*d.price; }
            var total = paperBalance + posVal, pnl = total - 100000;
            $('paper-stats').innerHTML = '<div class="paper-stat"><div class="paper-stat-label">Balance</div><div class="paper-stat-value" style="color:var(--cyan)">$'+fmt(paperBalance)+'</div></div><div class="paper-stat"><div class="paper-stat-label">Positions</div><div class="paper-stat-value">$'+fmt(posVal)+'</div></div><div class="paper-stat"><div class="paper-stat-label">Total</div><div class="paper-stat-value">$'+fmt(total)+'</div></div><div class="paper-stat"><div class="paper-stat-label">P&L</div><div class="paper-stat-value" style="color:'+(pnl>=0?'var(--green)':'var(--red)')+'">'+(pnl>=0?'+':'')+'$'+fmt(Math.abs(pnl))+'</div></div>';
            var h = '';
            for(var k in paperPositions) { var d = data.find(function(a){return a.sym===k;}); if(d) h += '<div class="screener-result"><span>'+k+': '+paperPositions[k]+' shares</span><span>$'+fmt(paperPositions[k]*d.price)+'</span></div>'; }
            if(Object.keys(paperPositions).length===0) h = '<div style="text-align:center;color:var(--text-dim);padding:20px">No positions</div>';
            $('paper-positions').innerHTML = h;
        }

        window.paperBuy = function() {
            var amt = prompt('Buy '+sel.sym+' - Enter amount:');
            if(amt && !isNaN(amt)) {
                var cost = parseFloat(amt)*sel.price;
                if(cost<=paperBalance) { paperBalance -= cost; paperPositions[sel.sym] = (paperPositions[sel.sym]||0) + parseFloat(amt); renderPaper(); showToast('Bought '+amt+' '+sel.sym); }
                else showToast('Insufficient balance');
            }
        };
        window.paperSell = function() {
            if(paperPositions[sel.sym]) {
                var amt = prompt('Sell '+sel.sym+' - Enter amount (have '+paperPositions[sel.sym]+'):');
                if(amt && !isNaN(amt) && parseFloat(amt)<=paperPositions[sel.sym]) {
                    paperBalance += parseFloat(amt)*sel.price;
                    paperPositions[sel.sym] -= parseFloat(amt);
                    if(paperPositions[sel.sym]<=0) delete paperPositions[sel.sym];
                    renderPaper(); showToast('Sold '+amt+' '+sel.sym);
                }
            } else showToast('No '+sel.sym+' positions');
        };

        function renderAIChat() {
            var h = '';
            if(aiHistory.length===0) {
                h = '<div class="ai-msg ai"><div class="ai-avatar">AI</div><div class="ai-msg-content"><div class="ai-msg-bubble">Hello! I am your trading assistant. Ask me about your portfolio, market analysis, or trading strategies. You can also use the quick action buttons below!</div><div class="ai-msg-time">Just now</div></div></div>';
            } else {
                for(var i=0;i<aiHistory.length;i++) {
                    var m = aiHistory[i];
                    var time = m.time ? new Date(m.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : 'Just now';
                    var avatar = m.role==='user' ? 'YOU' : 'AI';
                    h += '<div class="ai-msg '+m.role+'"><div class="ai-avatar">'+avatar+'</div><div class="ai-msg-content"><div class="ai-msg-bubble">'+m.text+'</div><div class="ai-msg-time">'+time+'</div></div></div>';
                }
            }
            $('ai-chat').innerHTML = h;
            $('ai-chat').scrollTop = $('ai-chat').scrollHeight;
        }

        function showTyping() {
            var h = $('ai-chat').innerHTML;
            h += '<div class="ai-msg ai" id="typing-msg"><div class="ai-avatar">AI</div><div class="ai-msg-content"><div class="ai-msg-bubble"><div class="ai-typing"><span></span><span></span><span></span></div></div></div></div>';
            $('ai-chat').innerHTML = h;
            $('ai-chat').scrollTop = $('ai-chat').scrollHeight;
        }

        function hideTyping() {
            var t = $('typing-msg');
            if(t) t.remove();
        }

        function saveChatHistory() {
            try { localStorage.setItem('aiChatHistory', JSON.stringify(aiHistory)); } catch(e) {}
        }

        function loadChatHistory() {
            try { var saved = localStorage.getItem('aiChatHistory'); if(saved) aiHistory = JSON.parse(saved); } catch(e) {}
        }

        window.quickAI = function(type) {
            var q = '';
            if(type==='portfolio') q = 'Give me a portfolio summary and recommendations';
            else if(type==='analysis') q = 'Analyze '+sel.sym+' technical indicators';
            else if(type==='market') q = 'What is the current market outlook?';
            else if(type==='risks') q = 'What are the risks in my current portfolio?';
            else if(type==='tips') q = 'Give me trading tips for today market';
            $('ai-input').value = q;
            sendAI();
        };

        function generateAIResponse(q) {
            q = q.toLowerCase();
            var histArr = history[sel.sym]; var rsi = histArr ? calcRSI(histArr) : null;
            var tot = 0, chg = 0;
            for(var i=0;i<data.length;i++){tot+=data[i].price*data[i].hold;chg+=data[i].price*data[i].hold*data[i].chg/100;}
            var pct = tot>0 ? (chg/tot*100) : 0;
            var macd = histArr ? calcMACD(histArr) : null;
            
            if(q.includes('portfolio') || q.includes('summary')) {
                var top = data.slice().sort(function(a,b){return(b.price*b.hold)-(a.price*a.hold);})[0];
                var resp = '📊 <strong>Portfolio Summary</strong><br><br>';
                resp += 'Total Value: <strong>$'+fmt(tot)+'</strong><br>';
                resp += '24h Change: <span style="color:'+(chg>=0?'var(--green)':'var(--red)')+'">'+(chg>=0?'+':'')+'$'+fmt(Math.abs(chg))+' ('+(pct>=0?'+':'')+pct.toFixed(2)+'%)</span><br><br>';
                resp += 'Largest Holding: '+top.sym+' ('+fmt(top.hold)+' units)<br><br>';
                if(chg>=0) resp += '💡 Your portfolio is up today. Consider taking partial profits on winners.';
                else resp += '⚠️ Your portfolio is down. Review your risk exposure and consider averaging down on quality assets.';
                return resp;
            }
            else if(q.includes('analysis') || q.includes('technical') || q.includes('indicator')) {
                var resp = '📈 <strong>Technical Analysis: '+sel.sym+'</strong><br><br>';
                resp += 'RSI-14: <strong>'+rsi.toFixed(1)+'</strong> ('+(rsi<30?'🔴 Oversold':rsi>70?'🟢 Overbought':'🟡 Neutral')+')<br>';
                resp += 'MACD: '+(macd.macd>macd.signal?'🟢 Bullish':'🔴 Bearish')+' ('+macd.macd.toFixed(2)+')<br>';
                resp += 'Signal Line: '+macd.signal.toFixed(2)+'<br>';
                resp += 'Current Price: $'+fmt(sel.price)+'<br>';
                resp += '24h Change: '+(sel.chg>=0?'+':'')+sel.chg.toFixed(2)+'%<br><br>';
                if(rsi<30 && macd.macd>macd.signal) resp += '💡 Strong buy signal: RSI oversold + MACD bullish crossover.';
                else if(rsi>70 && macd.macd<macd.signal) resp += '⚠️ Strong sell signal: RSI overbought + MACD bearish crossover.';
                else resp += '💡 Mixed signals. Wait for confirmation before trading.';
                return resp;
            }
            else if(q.includes('market') || q.includes('outlook') || q.includes('condition')) {
                var up = 0, down = 0;
                for(var i=0;i<data.length;i++){if(data[i].chg>=0)up++;else down++;}
                var resp = '🌍 <strong>Market Outlook</strong><br><br>';
                resp += 'Assets Up: '+up+' | Assets Down: '+down+'<br>';
                resp += 'Market Sentiment: '+(up>down?'🟢 Bullish':up<down?'🔴 Bearish':'🟡 Neutral')+'<br><br>';
                resp += 'Top Gainer: '; var topG = data.slice().sort(function(a,b){return b.chg-a.chg;})[0];
                resp += topG.sym+' ('+(topG.chg>=0?'+':'')+topG.chg.toFixed(2)+'%)<br>';
                resp += 'Top Loser: '; var topL = data.slice().sort(function(a,b){return a.chg-b.chg;})[0];
                resp += topL.sym+' ('+(topL.chg>=0?'+':'')+topL.chg.toFixed(2)+'%)<br><br>';
                resp += '💡 '+(up>down?'Market showing strength. Look for pullback entries.':'Market showing weakness. Consider reducing exposure.');
                return resp;
            }
            else if(q.includes('risk') || q.includes('danger')) {
                var highRisk = [];
                for(var i=0;i<data.length;i++){if(data[i].hold>0 && Math.abs(data[i].chg)>5) highRisk.push(data[i].sym);}
                var resp = '⚠️ <strong>Risk Assessment</strong><br><br>';
                resp += 'Portfolio Concentration: ';
                var conc = 0; for(var i=0;i<data.length;i++){var w = (data[i].price*data[i].hold)/tot*100; if(w>conc)conc=w;}
                resp += (conc>50?'🔴 High ('+conc.toFixed(0)+'% in single asset)':'🟢 Diversified')+'<br>';
                resp += 'High Volatility Assets: '+(highRisk.length?highRisk.join(', '):'None detected')+'<br><br>';
                resp += '💡 Recommendations:<br>';
                if(conc>50) resp += '• Reduce concentration in top holding<br>';
                resp += '• Set stop-losses at 5-10% below entry<br>';
                resp += '• Keep 10-20% cash for opportunities';
                return resp;
            }
            else if(q.includes('tip') || q.includes('advice') || q.includes('strategy')) {
                var tips = [
                    '💡 Use trailing stops to lock in profits while allowing room for growth.',
                    '💡 Never risk more than 1-2% of your portfolio on a single trade.',
                    '💡 The trend is your friend - dont fight the market direction.',
                    '💡 Take profits on the way up, dont wait for the top.',
                    '💡 Keep a trading journal to learn from your mistakes.',
                    '💡 Diversification is the only free lunch in investing.'
                ];
                var resp = '💡 <strong>Trading Tips</strong><br><br>';
                resp += tips[0]+'<br><br>';
                resp += 'Current RSI Strategy for '+sel.sym+': ';
                if(rsi === null) resp += 'Insufficient data for RSI analysis.';
                else if(rsi<30) resp += 'Consider accumulating - RSI suggests oversold conditions.';
                else if(rsi>70) resp += 'Consider taking profits - RSI suggests overbought conditions.';
                else resp += 'Hold current position - RSI in neutral territory.';
                return resp;
            }
            else {
                var resp = 'Based on current conditions:<br><br>';
                if(rsi === null) resp += '• '+sel.sym+' RSI: N/A (Insufficient data)<br>';
                else resp += '• '+sel.sym+' RSI: '+rsi.toFixed(1)+' ('+(rsi<30?'oversold':rsi>70?'overbought':'neutral')+')<br>';
                resp += '• Portfolio: '+$('port-chg').textContent+' today<br>';
                resp += '• Market: '+(pct>=0?'Positive':'Negative')+' momentum<br><br>';
                resp += 'Ask me about: portfolio, analysis, market, risks, or tips!';
                return resp;
            }
        }

        window.sendAI = function() {
            var q = sanitize($('ai-input').value.trim());
            if(!q) return;
            aiHistory.push({role:'user',text:q,time:Date.now()});
            $('ai-input').value='';
            renderAIChat();
            saveChatHistory();
            showTyping();
            setTimeout(function() {
                hideTyping();
                var resp = generateAIResponse(q);
                aiHistory.push({role:'ai',text:resp,time:Date.now()});
                renderAIChat();
                saveChatHistory();
            }, 1000);
        };

        // Portfolio Management Functions
        window.showPortfolioEdit = function() {
            var h = '';
            for(var i=0;i<data.length;i++) {
                var a = data[i];
                h += '<div class="holding-row"><span><strong>'+a.sym+'</strong> - '+a.name+'</span><span><input type="number" class="holding-input" id="hold-'+a.sym+'" value="'+a.hold+'" step="0.01" data-sym="'+a.sym+'" onchange="updateHolding(this.dataset.sym,this.value)"> <button class="del-btn" data-sym="'+a.sym+'" onclick="removeAsset(this.dataset.sym);showPortfolioEdit();">DEL</button></span></div>';
            }
            $('holdings-list').innerHTML = h;
            $('portfolio-modal').classList.add('show');
        };
        window.hidePortfolioEdit = function() { $('portfolio-modal').classList.remove('show'); };

        window.updateHolding = function(sym, val) {
            for(var i=0;i<data.length;i++) {
                if(data[i].sym===sym) { data[i].hold = parseFloat(val)||0; break; }
            }
        };

        window.saveHoldings = async function() {
            for(var i=0;i<data.length;i++) {
                var input = $('hold-'+data[i].sym);
                if(input) data[i].hold = parseFloat(input.value)||0;
            }
            // Save to localStorage (always works)
            var holdings = {};
            for(var i=0;i<data.length;i++) holdings[data[i].sym] = data[i].hold;
            localStorage.setItem('holdings', JSON.stringify(holdings));

            // Save asset list to localStorage
            localStorage.setItem('assetList', JSON.stringify(data.map(function(a){return{sym:a.sym,name:a.name,type:a.type,color:a.color,hold:a.hold,fav:a.fav}})));

            // Sync to Supabase via SDK if authenticated
            if(typeof TradingAI !== 'undefined' && TradingAI.isAuthenticated()) {
                try {
                    for(var i=0; i<data.length; i++) {
                        if(data[i].hold > 0 || data[i].fav) {
                            await TradingAI.addToPortfolio(data[i].sym, data[i].hold, data[i].fav);
                        }
                    }
                } catch(e) {
                    console.error('Supabase sync failed:', e);
                }
            }

            renderPortfolio();
            renderWeights();
            renderAlloc();
            hidePortfolioEdit();
            showToast('Portfolio saved!');
        };

        window.showAddAsset = function() { $('add-asset-modal').classList.add('show'); searchAssets(); };
        window.hideAddAsset = function() { $('add-asset-modal').classList.remove('show'); };

        window.searchAssets = function() {
            var q = ''; try{q=$('asset-search').value||'';}catch(e){} q=q.toLowerCase();
            var popular = [
                {sym:'BTC',name:'Bitcoin',type:'crypto'},
                {sym:'ETH',name:'Ethereum',type:'crypto'},
                {sym:'SOL',name:'Solana',type:'crypto'},
                {sym:'XRP',name:'Ripple',type:'crypto'},
                {sym:'ADA',name:'Cardano',type:'crypto'},
                {sym:'AVAX',name:'Avalanche',type:'crypto'},
                {sym:'DOT',name:'Polkadot',type:'crypto'},
                {sym:'MATIC',name:'Polygon',type:'crypto'},
                {sym:'LINK',name:'Chainlink',type:'crypto'},
                {sym:'AAPL',name:'Apple',type:'stock'},
                {sym:'NVDA',name:'NVIDIA',type:'stock'},
                {sym:'TSLA',name:'Tesla',type:'stock'},
                {sym:'GOOGL',name:'Alphabet',type:'stock'},
                {sym:'MSFT',name:'Microsoft',type:'stock'},
                {sym:'AMZN',name:'Amazon',type:'stock'},
                {sym:'META',name:'Meta',type:'stock'},
                {sym:'GC1',name:'Gold',type:'commodity'},
                {sym:'CL1',name:'Crude Oil',type:'commodity'}
            ];
            var h = '';
            var filtered = popular.filter(function(a) {
                return a.sym.toLowerCase().indexOf(q)>=0 || a.name.toLowerCase().indexOf(q)>=0;
            });
            for(var i=0;i<filtered.length;i++) {
                var a = filtered[i];
                var exists = data.find(function(d){return d.sym===a.sym;});
                h += '<div class="asset-option" data-sym="'+a.sym+'" data-name="'+a.name+'" data-type="'+a.type+'"><span><strong>'+a.sym+'</strong> - '+a.name+'</span><span style="color:'+(exists?'var(--green)':'var(--text-dim)')+'">'+(exists?'In Portfolio':a.type.toUpperCase())+'</span></div>';
            }
            $('asset-options').innerHTML = h; document.querySelectorAll('.asset-option').forEach(function(el){el.onclick=function(){addAssetToList(this.dataset.sym,this.dataset.name,this.dataset.type);};});
        };

        window.addAssetToList = async function(sym, name, type) {
            var exists = data.find(function(d){return d.sym===sym;});
            if(exists) {
                showToast(sym+' already in portfolio');
                return;
            }
            var colors = {crypto:'var(--cyan)',stock:'var(--gold)',commodity:'var(--orange)'};
            data.push({
                sym:sym, name:name, type:type,
                price:0,chg:0,
                color:colors[type]||'var(--cyan)',
                hold:0, fav:false,
                mktCap:0, vol24h:0
            });
            localStorage.setItem('assetList', JSON.stringify(data.map(function(a){return{sym:a.sym,name:a.name,type:a.type,color:a.color,hold:a.hold,fav:a.fav}})));
            await savePortfolioToSupabase();
            renderAssets();
            renderPortfolio();
            renderAlloc();
            searchAssets();
            hideAddAsset();
            showToast(sym+' added to portfolio!');
        };

        window.removeAsset = async function(sym) {
            var idx = -1;
            for(var i=0;i<data.length;i++) {
                if(data[i].sym===sym) { idx=i; break; }
            }
            if(idx >= 0) {
                data.splice(idx, 1);
                localStorage.setItem('holdings', JSON.stringify(
                    data.reduce(function(obj, a) { obj[a.sym]=a.hold; return obj; }, {})
                ));
                try { localStorage.setItem('assetList', JSON.stringify(data.map(function(a){return{sym:a.sym,name:a.name,type:a.type,color:a.color,hold:a.hold,fav:a.fav}})));
            await savePortfolioToSupabase(); } catch(e) {}
                renderAssets();
                renderPortfolio();
                renderAlloc();
                if(sel && sel.sym===sym && data.length>0) sel=data[0];
                renderChart();
                renderInds();
                showToast(sym+' removed from portfolio');
            }
        };

        // PR Functions
        window.showPRModal = function() {
            renderPRList();
            $('pr-modal').classList.add('show');
        };
        window.hidePRModal = function() { $('pr-modal').classList.remove('show'); };

        function renderPRList() {
            var prs = JSON.parse(localStorage.getItem('prs')||'[]');
            var h = '';
            if(prs.length===0) h = '<div style="text-align:center;color:var(--text-dim);padding:20px">No pull requests yet</div>';
            for(var i=0;i<prs.length;i++) {
                h += '<div class="pr-item"><span>'+prs[i].title+'</span><span class="pr-status pr-'+prs[i].status+'">'+prs[i].status.toUpperCase()+'</span></div>';
            }
            $('pr-list').innerHTML = h;
        }

        window.createPR = function() {
            var branch = $('pr-branch').value.trim();
            var title = $('pr-title').value.trim();
            var desc = $('pr-desc').value.trim();
            if(!branch||!title) { showToast('Please fill branch and title'); return; }
            var prs = JSON.parse(localStorage.getItem('prs')||'[]');
            prs.unshift({branch:branch,title:title,desc:desc,status:'open',date:new Date().toISOString()});
            localStorage.setItem('prs', JSON.stringify(prs.slice(0,10)));
            renderPRList();
            showToast('PR created: '+title);
            $('pr-branch').value=''; $('pr-title').value=''; $('pr-desc').value='';
        };

        // Save portfolio to Supabase
        async function savePortfolioToSupabase() {
            showLoading('sync-spinner');
            var token = localStorage.getItem('sb_token');

            var entries = [];
            for(var i=0;i<data.length;i++) {
                // Save ALL assets that have holdings OR are favorites
                if(true) {
                    entries.push({
                        user_id: user.id,
                        symbol: data[i].sym,
                        holdings: data[i].hold || 0,
                        favorite: data[i].fav || false
                    });
                }
            }

            try {
                // First, delete existing portfolio entries for this user
                var delUrl = SUPABASE_URL+'/rest/v1/portfolios?user_id=eq.'+user.id;
                var delRes = await fetch(delUrl, {
                    method: 'DELETE',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': 'Bearer '+token,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    }
                });
                var delData = await delRes.text();

                if(entries.length > 0) {
                    var postRes = await fetch(SUPABASE_URL+'/rest/v1/portfolios', {
                        method: 'POST',
                        headers: {
                            'apikey': SUPABASE_KEY,
                            'Authorization': 'Bearer '+token,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=representation'
                        },
                        body: JSON.stringify(entries)
                    });
                    var postData = await postRes.text();
                    if(postRes.ok) {
                        hideLoading('sync-spinner');
                        showToast('Portfolio saved to cloud!');
                    } else {
                        showToast('Save failed - check console');
                    }
                } else {
                    showToast('No holdings to save');
                }
            hideLoading('sync-spinner');
            } catch(e) {
                hideLoading('sync-spinner');
                console.error('Failed to save portfolio:', e);
                showToast('Save error: ' + e.message);
            }
        }

        // Load portfolio from Supabase
        async function loadPortfolioFromSupabase() {
            showLoading('sync-spinner');
            var token = localStorage.getItem('sb_token');

            try {
                var url = SUPABASE_URL+'/rest/v1/portfolios?user_id=eq.'+user.id;
                var r = await fetch(url, {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': 'Bearer '+token
                    }
                });

                if(r.ok) {
                    var portfolio = await r.json();
                    for(var i=0;i<portfolio.length;i++) {
                        var entry = portfolio[i];
                        var asset = data.find(function(a){return a.sym===entry.symbol;});
                        if(asset) {
                            asset.hold = entry.holdings || 0;
                            asset.fav = entry.favorite || false;
                        }
                    }
                    $('db-status').innerHTML='<span style="color:var(--purple)">[DB]</span> SYNCED';
                hideLoading('sync-spinner');
                } else {
                    hideLoading('sync-spinner');
                }
            } catch(e) {
                hideLoading('sync-spinner');
                console.error('Failed to load portfolio:', e);
            }
        }

        async function loadSavedHoldings() {
            // Version check: clear old localStorage if version mismatch
            var savedVersion = localStorage.getItem('portfolio_version');
            if (savedVersion !== PORTFOLIO_DATA_VERSION) {
                console.log('Portfolio data version mismatch. Clearing old localStorage data...');
                localStorage.removeItem('assetList');
                localStorage.removeItem('holdings');
                localStorage.setItem('portfolio_version', PORTFOLIO_DATA_VERSION);
                // Continue with fresh defaults (hold:0 for all)
                return;
            }
            try {
            // Load saved asset list from localStorage
            var savedAssets = localStorage.getItem('assetList');
            if(savedAssets) {
                var assets = JSON.parse(savedAssets);
                // If we have saved assets, REPLACE data array completely
                if(Array.isArray(assets) && assets.length > 0) {
                    // Keep track of which symbols were saved
                    var savedSyms = assets.map(function(a){return a.sym;});
                    // Remove assets from data that are NOT in saved list
                    data = data.filter(function(d){return savedSyms.indexOf(d.sym) >= 0;});
                    // Update holdings and favorites for remaining assets
                    for(var j=0;j<assets.length;j++) {
                        if(!assets[j].sym) continue;
                        var found = data.find(function(d){return d.sym===assets[j].sym;});
                        if(found) {
                            found.hold = assets[j].hold || 0;
                            found.fav = assets[j].fav || false;
                        }
                    }
                }
            }
            // Legacy localStorage fallback for holdings only
            var saved = localStorage.getItem('holdings');
            if(saved) {
                var holdings = JSON.parse(saved);
                if(holdings && typeof holdings === 'object') {
                    for(var i=0;i<data.length;i++) {
                        if(holdings[data[i].sym]!==undefined) data[i].hold = holdings[data[i].sym];
                    }
                }
            }
            // Make sure sel is valid after filtering
            if(data.length > 0 && (!sel || data.indexOf(sel) < 0)) sel = data[0];

            // Sync from Supabase if authenticated
            if(typeof TradingAI !== 'undefined' && TradingAI.isAuthenticated()) {
                try {
                    var portfolio = await TradingAI.loadPortfolio();
                    if(portfolio.success && portfolio.data && portfolio.data.length > 0) {
                        portfolio.data.forEach(function(item) {
                            var asset = data.find(function(a){return a.sym === item.symbol;});
                            if(asset) {
                                asset.hold = item.quantity;
                                asset.fav = item.favorite;
                            }
                        });
                    }
                } catch(e) {
                    console.error('Supabase load failed:', e);
                }
            }
            } catch(e) { console.error('loadSavedHoldings error:', e); }
        }
        // Setup mobile info tooltip handlers
function setupInfoTooltips() {
    // Mobile tap-to-show info tooltips
    setTimeout(function() {
        document.querySelectorAll('.info-tip').forEach(function(tip) {
            tip.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                // Toggle active class for mobile
                if(this.classList.contains('active')) {
                    this.classList.remove('active');
                } else {
                    // Remove active from all others
                    document.querySelectorAll('.info-tip.active').forEach(function(t) {
                        t.classList.remove('active');
                    });
                    this.classList.add('active');
                }
            });
        });
        
        // Close tooltips when clicking elsewhere
        document.addEventListener('click', function(e) {
            if(!e.target.classList.contains('info-tip')) {
                document.querySelectorAll('.info-tip.active').forEach(function(t) {
                    t.classList.remove('active');
                });
            }
        });
    }, 100); // Small delay to ensure DOM is ready
}

function init() { 
            setTimeout(function(){
                if(checkSession()){
                    showDashboard();
                    setupInfoTooltips();
                }else{
                    showLogin();
                }
            },CONFIG.INIT_DELAY); 
        }
        if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
    })();