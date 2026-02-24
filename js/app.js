// TradingAI Neural Nexus - Main Application

(function() {
        'use strict';
        var $ = function(id) { return document.getElementById(id); };

        function sanitize(str) {
            if(!str) return '';
            return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
        }

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
            console.log('Browser online');
            var banner = $('offline-banner');
            if(banner) banner.style.display = 'none';
            $('status-dot').className='status-dot';
            $('status-text').textContent='LIVE';
            refreshPrices();
        });
        window.addEventListener('offline', function() {
            console.log('Browser offline');
            var banner = $('offline-banner');
            if(banner) banner.style.display = 'block';
            $('status-dot').className='status-dot error';
            $('status-text').textContent='OFFLINE';
        });

var CONFIG = {
            REFRESH_INTERVAL: 60000,      // Price refresh interval (ms)
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

        var user = null, userTier = 'free', sel = null, data = [], alerts = [], watchlists = [{name:'Crypto',symbols:['BTC','ETH','SOL']},{name:'Tech',symbols:['AAPL','NVDA','MSFT','GOOGL']}];
        var priceCt = null, volCt = null, allocCt = null, chartType = 'line', timeframe = '1D';
        var history = {}, isLightTheme = false, isFullscreen = false;
        
        data = [
            {sym:'BTC',name:'Bitcoin',type:'crypto',price:65000,chg:2.5,color:'var(--cyan)',hold:0.5,fav:true,mktCap:1.2e12,vol24h:28e9,supply:19.5e6},
            {sym:'ETH',name:'Ethereum',type:'crypto',price:3500,chg:1.8,color:'var(--purple)',hold:5,fav:true,mktCap:420e9,vol24h:15e9,supply:120e6},
            {sym:'SOL',name:'Solana',type:'crypto',price:150,chg:4.2,color:'var(--green)',hold:20,fav:false,mktCap:65e9,vol24h:3e9,supply:433e6},
            {sym:'AAPL',name:'Apple',type:'stock',price:248.32,chg:1.5,color:'var(--gold)',hold:25,fav:false,mktCap:3e12,vol24h:50e6,supply:15.5e9,pe:28,div:0.52},
            {sym:'NVDA',name:'NVIDIA',type:'stock',price:892.45,chg:4.2,color:'#76b900',hold:10,fav:true,mktCap:2.2e12,vol24h:45e6,supply:2.47e9,pe:65,div:0.04},
            {sym:'TSLA',name:'Tesla',type:'stock',price:356.78,chg:-1.2,color:'#c00',hold:10,fav:false,mktCap:1.1e12,vol24h:90e6,supply:3.2e9,pe:45,div:0},
            {sym:'GOOGL',name:'Alphabet',type:'stock',price:175.23,chg:0.8,color:'#4285f4',hold:30,fav:false,mktCap:2.1e12,vol24h:25e6,supply:12.5e9,pe:22,div:0},
            {sym:'MSFT',name:'Microsoft',type:'stock',price:415.67,chg:1.1,color:'#00a4ef',hold:20,fav:true,mktCap:3.1e12,vol24h:20e6,supply:7.4e9,pe:35,div:0.75}
        ];
        sel = data[0];
        
        function fmt(n) { return n >= 1000 ? n.toLocaleString('en-US',{maximumFractionDigits:0}) : n.toFixed(n < 1 ? 4 : 2); }
        function genHistory(base, len) { var arr = []; for (var i = 0; i < len; i++) arr.push(base * (1 + (Math.random() - 0.5) * 0.04)); return arr; }
        function genCandles(base, len) { var arr = []; var p = base; for (var i = 0; i < len; i++) { var o = p; var c = p * (1 + (Math.random() - 0.5) * 0.02); var h = Math.max(o, c) * (1 + Math.random() * 0.01); var l = Math.min(o, c) * (1 - Math.random() * 0.01); arr.push({o:o,h:h,l:l,c:c}); p = c; } return arr; }
        function calcRSI(arr) { var gains = 0, losses = 0, period = 14; for (var i = arr.length - period; i < arr.length; i++) { var diff = arr[i] - arr[i-1]; if (diff > 0) gains += diff; else losses -= diff; } var rs = losses === 0 ? 100 : gains / losses; return 100 - (100 / (1 + rs)); }
        function calcStochastic(arr) { var recent = arr.slice(-14); var high = Math.max.apply(null, recent), low = Math.min.apply(null, recent); var k = high === low ? 50 : ((arr[arr.length-1] - low) / (high - low)) * 100; return { k: k, signal: k > 80 ? 'Overbought' : k < 20 ? 'Oversold' : 'Neutral' }; }
        function calcATR(arr) { var tr = []; for (var i = 1; i < arr.length; i++) tr.push(Math.abs(arr[i] - arr[i-1])); return tr.slice(-14).reduce(function(a,b){return a+b;},0) / 14; }
        function calcADX(arr) { return 20 + Math.random() * 40; }
        function calcWilliams(arr) { var recent = arr.slice(-14); var high = Math.max.apply(null, recent), low = Math.min.apply(null, recent); return high === low ? -50 : -100 * (high - arr[arr.length-1]) / (high - low); }
        
        // Auth
        window.showLogin = function() { $('loading').style.display='none'; $('dashboard').style.display='none'; $('auth-login').style.display='flex'; $('auth-signup').style.display='none'; $('auth-reset').style.display='none'; };
        window.showSignup = function() { $('auth-login').style.display='none'; $('auth-signup').style.display='flex'; $('auth-reset').style.display='none'; };
        window.showReset = function() { $('auth-login').style.display='none'; $('auth-signup').style.display='none'; $('auth-reset').style.display='flex'; };
        async function supabaseAuth(ep, body) { var r = await fetch(SUPABASE_URL+'/auth/v1'+ep, {method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},body:JSON.stringify(body)}); return {ok:r.ok,data:await r.json()}; }
        window.handleLogin = async function() { var email=$('login-email').value,pwd=$('login-password').value; if(!email||!pwd){$('login-error').textContent='Please fill in all fields';$('login-error').classList.add('show');return;} var r=await supabaseAuth('/token?grant_type=password',{email:email,password:pwd}); if(r.ok&&r.data.access_token){localStorage.setItem('sb_token',r.data.access_token);localStorage.setItem('sb_user',JSON.stringify(r.data.user));user=r.data.user;userTier='pro';showDashboard();}else{$('login-error').textContent=r.data.error_description||'Login failed';$('login-error').classList.add('show');} };
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
            console.log('Loaded from localStorage');

            // Then try to load from Supabase (may override localStorage)
            if(user){
                $('header-email').textContent=user.email;
                $('profile-email').textContent=user.email;
                $('profile-tier').textContent=userTier.toUpperCase();
                $('profile-since').textContent=new Date(user.created_at||Date.now()).toLocaleDateString();
                try {
                    await loadPortfolioFromSupabase();
                } catch(e) {
                    console.log('Supabase load failed, using localStorage data');
                }
            }
            renderAll();
            refreshPrices();
            setInterval(refreshPrices,CONFIG.REFRESH_INTERVAL);
            updateTime();
            setInterval(updateTime,CONFIG.TIME_UPDATE_INTERVAL); 
        }
        function updateTime() { $('time').textContent = new Date().toLocaleTimeString(); }
        
        async function refreshPrices() {
            $('status-dot').className='status-dot syncing';$('status-text').textContent='UPDATING...';
            try {
                var crypto=await (await fetch(API_BASE+'/prices')).json();
                var stocks=await (await fetch(API_BASE+'/stocks')).json();
                if(crypto.bitcoin){var btc=data.find(function(a){return a.sym==='BTC';});btc.price=crypto.bitcoin.usd;btc.chg=crypto.bitcoin.usd_24h_change||0;}
                if(crypto.ethereum){var eth=data.find(function(a){return a.sym==='ETH';});eth.price=crypto.ethereum.usd;eth.chg=crypto.ethereum.usd_24h_change||0;}
                if(crypto.solana){var sol=data.find(function(a){return a.sym==='SOL';});sol.price=crypto.solana.usd;sol.chg=crypto.solana.usd_24h_change||0;}
                if(stocks.AAPL){var aapl=data.find(function(a){return a.sym==='AAPL';});aapl.price=stocks.AAPL.price;aapl.chg=stocks.AAPL.changePercent||0;}
                if(stocks.NVDA){var nvda=data.find(function(a){return a.sym==='NVDA';});nvda.price=stocks.NVDA.price;nvda.chg=stocks.NVDA.changePercent||0;}
                if(stocks.TSLA){var tsla=data.find(function(a){return a.sym==='TSLA';});tsla.price=stocks.TSLA.price;tsla.chg=stocks.TSLA.changePercent||0;}
                if(stocks.GOOGL){var googl=data.find(function(a){return a.sym==='GOOGL';});googl.price=stocks.GOOGL.price;googl.chg=stocks.GOOGL.changePercent||0;}
                if(stocks.MSFT){var msft=data.find(function(a){return a.sym==='MSFT';});msft.price=stocks.MSFT.price;msft.chg=stocks.MSFT.changePercent||0;}
                $('status-dot').className='status-dot';$('status-text').textContent='LIVE';$('data-badge').textContent='LIVE';$('data-badge').className='panel-badge live';$('db-status').innerHTML='<span style="color:var(--purple)">[DB]</span> SYNCED';
                renderAll();
            checkAlerts();} catch(e) { $('status-dot').className='status-dot error';$('status-text').textContent='CACHED';$('data-badge').textContent='CACHED'; }
        }
        
        function renderAll() { renderAssets();renderPortfolio();renderTicker();renderInds();renderFG();renderSectors();renderActions();renderPreds();renderWeights();renderChart();renderAlloc();renderAnalytics();renderCorrelation();renderAssetDetails();renderNews();renderCalendar(); }
        
        function renderAssets() { var h=''; for(var i=0;i<data.length;i++){var a=data[i];h+='<div class="asset'+(a.sym===sel.sym?' active':'')+'" onclick="selAsset(\''+a.sym+'\')"><div style="display:flex;align-items:center"><div class="asset-icon" style="background:'+a.color+'22;color:'+a.color+'">'+a.sym.substr(0,2)+'</div><div><div class="asset-name">'+a.sym+'<span class="star'+(a.fav?' active':'')+'" onclick="event.stopPropagation();toggleFav(\''+a.sym+'\')">*</span></div><div class="asset-type">'+a.name+'</div></div></div><div style="display:flex;align-items:center;gap:6px"><div style="text-align:right"><div class="asset-price">$'+fmt(a.price)+'</div><div class="asset-chg '+(a.chg>=0?'up':'down')+'">'+(a.chg>=0?'+':'')+a.chg.toFixed(2)+'%</div></div></div></div>';} $('assets').innerHTML=h; }
        function renderPortfolio() { var tot=0,chg=0; for(var i=0;i<data.length;i++){tot+=data[i].price*data[i].hold;chg+=data[i].price*data[i].hold*data[i].chg/100;} var pct=chg/tot*100; $('port-val').textContent='$'+fmt(tot);$('port-chg').textContent=(chg>=0?'+':'')+'$'+fmt(Math.abs(chg))+' ('+(pct>=0?'+':'')+pct.toFixed(2)+'%)';$('port-chg').className='portfolio-change '+(chg>=0?'up':'down');$('intel').textContent=Math.round(50+pct*2); }
        function renderTicker() { var h=''; for(var i=0;i<data.length*2;i++){var a=data[i%data.length];h+='<span class="ticker-item" onclick="selAsset(\''+a.sym+'\')"><span class="ticker-sym">'+a.sym+'</span> $'+fmt(a.price)+' <span style="color:'+(a.chg>=0?'var(--green)':'var(--red)')+'">'+(a.chg>=0?'+':'')+a.chg.toFixed(1)+'%</span></span>';} $('ticker').innerHTML=h+h; }
        function renderFG() { var avg=0; for(var i=0;i<data.length;i++)avg+=data[i].chg; avg/=data.length; var v=Math.max(10,Math.min(90,50-avg*2)); var lbl=v>=75?'GREED':v>=55?'OPTIMISM':v>=45?'NEUTRAL':v>=25?'FEAR':'EXTREME FEAR'; var col=v>=55?'var(--green)':v>=45?'var(--cyan)':v>=25?'var(--gold)':'var(--red)'; $('fg-val').textContent=Math.round(v);$('fg-val').style.color=col;$('fg-lbl').textContent=lbl;$('fg-lbl').style.color=col;$('fg-dot').style.left=v+'%'; }
        function renderInds() { var arr=history[sel.sym]||genHistory(sel.price,100); history[sel.sym]=arr; var rsi=calcRSI(arr),stoch=calcStochastic(arr),atr=calcATR(arr),adx=calcADX(arr),will=calcWilliams(arr); var h='<div class="ind-grid">'; h+='<div class="ind-card"><div class="ind-label">RSI (14)</div><div class="ind-val '+(rsi<35?'bull':rsi>70?'bear':'neut')+'">'+rsi.toFixed(1)+'</div><div class="ind-sub">'+(rsi<35?'Oversold':rsi>70?'Overbought':'Neutral')+'</div></div>'; h+='<div class="ind-card"><div class="ind-label">MACD</div><div class="ind-val '+(sel.chg>=0?'bull':'bear')+'">'+(sel.chg>=0?'Bullish':'Bearish')+'</div></div>'; h+='<div class="ind-card"><div class="ind-label">Stochastic</div><div class="ind-val '+(stoch.k>80?'bear':stoch.k<20?'bull':'neut')+'">'+stoch.k.toFixed(0)+'</div><div class="ind-sub">'+stoch.signal+'</div></div>'; h+='<div class="ind-card"><div class="ind-label">Trend</div><div class="ind-val '+(sel.chg>=0?'bull':'bear')+'">'+(sel.chg>=0?'Uptrend':'Downtrend')+'</div></div>'; h+='<div class="ind-card"><div class="ind-label">ATR</div><div class="ind-val neut">'+(atr/sel.price*100).toFixed(2)+'%</div><div class="ind-sub">Volatility</div></div>'; h+='<div class="ind-card"><div class="ind-label">ADX</div><div class="ind-val '+(adx>25?'bull':'neut')+'">'+adx.toFixed(1)+'</div><div class="ind-sub">'+(adx>25?'Strong':'Weak')+'</div></div>'; h+='<div class="ind-card"><div class="ind-label">Williams %R</div><div class="ind-val '+(will<-80?'bull':will>-20?'bear':'neut')+'">'+will.toFixed(1)+'</div><div class="ind-sub">'+(will<-80?'Oversold':will>-20?'Overbought':'Neutral')+'</div></div>'; h+='<div class="ind-card"><div class="ind-label">OBV</div><div class="ind-val neut">'+(Math.random()>0.5?'+':'-')+(Math.random()*10).toFixed(1)+'M</div><div class="ind-sub">Volume</div></div>'; h+='</div>'; $('inds').innerHTML=h; }
        function renderSectors() { var secs=[{n:'Crypto',c:-6.2},{n:'Tech',c:1.8},{n:'AI',c:5.8},{n:'EV',c:-1.2},{n:'Finance',c:1.2},{n:'Cloud',c:3.4}]; var h='<div class="sector-grid">'; for(var i=0;i<secs.length;i++){h+='<div class="sector"><div class="sector-name">'+secs[i].n+'</div><div class="sector-chg '+(secs[i].c>=0?'up':'down')+'">'+(secs[i].c>=0?'+':'')+secs[i].c.toFixed(1)+'%</div></div>';} h+='</div>'; $('sectors').innerHTML=h; }
        function renderActions() { var arr=history[sel.sym]||genHistory(sel.price,100); var rsi=calcRSI(arr),stoch=calcStochastic(arr); var acts=[]; if(rsi<30||stoch.k<20)acts.push({t:'BUY',txt:sel.sym+' oversold'}); else if(rsi>70||stoch.k>80)acts.push({t:'SELL',txt:sel.sym+' overbought'}); else acts.push({t:'HOLD',txt:sel.sym+' neutral'}); acts.push({t:'HOLD',txt:'Review risk'}); var h=''; for(var i=0;i<acts.length;i++){h+='<div class="action"><span class="action-badge '+acts[i].t.toLowerCase()+'-badge">'+acts[i].t+'</span><span class="action-text">'+acts[i].txt+'</span></div>';} $('actions').innerHTML=h; }
        function renderPreds() { var base=sel.price; var preds=[{l:'24H',v:base*(1+Math.random()*0.04-0.02)},{l:'7D',v:base*(1+Math.random()*0.1-0.05)},{l:'30D',v:base*(1+Math.random()*0.2-0.1)}]; var h=''; for(var i=0;i<preds.length;i++){h+='<div class="pred-row"><span>'+preds[i].l+'</span><span class="pred-val '+(preds[i].v>=base?'bull':'bear')+'" style="color:'+(preds[i].v>=base?'var(--green)':'var(--red)')+'">$'+fmt(preds[i].v)+'</span></div>';} $('preds').innerHTML=h; }
        function renderWeights() { var w=[{s:'BTC',w:28,c:'var(--cyan)'},{s:'ETH',w:18,c:'var(--purple)'},{s:'NVDA',w:16,c:'var(--green)'},{s:'AAPL',w:14,c:'var(--gold)'},{s:'MSFT',w:12,c:'var(--cyan)'},{s:'GOOGL',w:8,c:'var(--red)'},{s:'TSLA',w:4,c:'var(--purple)'}]; var h=''; for(var i=0;i<w.length;i++){h+='<div class="weight-row"><span class="weight-sym">'+w[i].s+'</span><div class="weight-bar"><div class="weight-fill" style="width:'+w[i].w+'%;background:'+w[i].c+'"></div></div><span class="weight-pct">'+w[i].w+'%</span></div>';} $('weights').innerHTML=h; }
        
        
        var ohlcData = {};
        async function fetchOHLC(sym) {
            var cm = {'BTC':'bitcoin','ETH':'ethereum','SOL':'solana','XRP':'ripple','ADA':'cardano','DOGE':'dogecoin'};
            var coin = cm[sym] || 'bitcoin';
            var days = timeframe==='1H'?'1':timeframe==='1W'?'7':timeframe==='1M'?'30':'7';
            try {
                var r = await fetch('https://tradingapi-proxy.cloudflare-5m9f2.workers.dev/ohlc?coin='+coin+'&days='+days);
                return await r.json();
            } catch(e) { return null; }
        }
        function renderChart() {
            if(chartType==='candle') { fetchOHLC(sel.sym).then(function(d){ renderCandles(d); }); }
            else { renderLine(); }
        }
        function renderCandles(ohlc) {
            var candles=[], lbls=[], vols=[], times=[];
            if(ohlc && ohlc.length>0) {
                for(var i=0;i<ohlc.length;i++) {
                    var c=ohlc[i];
                    candles.push({o:c[1],h:c[2],l:c[3],c:c[4]});
                    var d=new Date(c[0]);
                    times.push(d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}));
                    lbls.push(i); vols.push(Math.random()*100+50);
                }
            } else {
                candles = genCandles(sel.price,100);
                for(var i=0;i<100;i++){ lbls.push(i); vols.push(Math.random()*100+50); times.push(i); }
            }
            // Update price display
            if(candles.length>0) {
                var last=candles[candles.length-1];
                $('chart-price').textContent='$'+last.c.toLocaleString();
                var chg=((last.c-candles[0].o)/candles[0].o*100).toFixed(2);
                $('chart-chg').textContent=(chg>=0?'+':'')+chg+'%';
                $('chart-chg').className='chart-chg '+(chg>=0?'up':'down');
            }
            if(priceCt) priceCt.destroy(); if(volCt) volCt.destroy();
            
            // Get close prices for indicators
            var closes = candles.map(function(c) { return c.c; });
            
            // Calculate indicators
            var sma20 = calcSMA(closes, 20);
            var ema9 = showEMA ? calcEMA(closes, 9) : [];
            var ema21 = showEMA ? calcEMA(closes, 21) : [];
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
            
            // SMA-20 (always show)
            datasets.push({
                type:'line', data:sma20, borderColor:'rgba(255,215,0,0.9)', borderWidth:2, 
                pointRadius:0, fill:false, order:1, label:'SMA-20'
            });
            
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
            
            // Candlesticks
            datasets.push({
                type:'bar',
                data:candles.map(function(c){return Math.max(c.o,c.c)-Math.min(c.o,c.c);}),
                backgroundColor:candles.map(function(c){return c.c>=c.o?'rgba(0,255,136,0.85)':'rgba(255,51,102,0.85)';}),
                borderColor:candles.map(function(c){return c.c>=c.o?'#00ff88':'#ff3366';}),
                borderWidth:1,
                barPercentage:0.8,
                order:99
            });
            
            priceCt = new Chart($('priceCt'),{
                type:'bar',
                data:{labels:lbls,datasets:datasets},
                options:{
                    responsive:true,
                    maintainAspectRatio:false,
                    interaction:{mode:'index',intersect:false},
                    plugins:{
                        legend:{display:false},
                        tooltip:{
                            backgroundColor:'rgba(15,18,24,0.95)',
                            borderColor:'rgba(0,240,255,0.3)',
                            borderWidth:1,
                            callbacks:{
                                label:function(ctx){
                                    if(ctx.dataset.label && ctx.dataset.label.includes('SMA')) return ctx.dataset.label+': $'+(ctx.raw?ctx.raw.toFixed(2):'N/A');
                                    if(ctx.dataset.label && ctx.dataset.label.includes('EMA')) return ctx.dataset.label+': $'+(ctx.raw?ctx.raw.toFixed(2):'N/A');
                                    var c=candles[ctx.dataIndex];
                                    return 'O:$'+c.o.toFixed(2)+' H:$'+c.h.toFixed(2)+' L:$'+c.l.toFixed(2)+' C:$'+c.c.toFixed(2);
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
            
            // Volume chart with MA
            var volMA = calcSMA(vols, 10);
            volCt = new Chart($('volCt'),{
                type:'bar',
                data:{
                    labels:lbls,
                    datasets:[{
                        data:vols,
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
            var len = timeframe==='1H'?24:timeframe==='1W'?168:timeframe==='1M'?720:96;
            var arr = history[sel.sym]||genHistory(sel.price,len);
            history[sel.sym]=arr; var disp=arr.slice(-len), lbls=[], times=[];
            for(var i=0;i<disp.length;i++) {
                lbls.push(i);
                times.push(i);
            }
            // Update price display
            if(disp.length>0) {
                $('chart-price').textContent='$'+disp[disp.length-1].toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
                var chg=((disp[disp.length-1]-disp[0])/disp[0]*100).toFixed(2);
                $('chart-chg').textContent=(chg>=0?'+':'')+chg+'%';
                $('chart-chg').className='chart-chg '+(chg>=0?'up':'down');
            }
            if(priceCt) priceCt.destroy(); if(volCt) volCt.destroy();
            var vols=[]; for(var i=0;i<disp.length;i++) vols.push(Math.random()*100+50);
            // Calculate SMA
            var sma=[]; var period=20;
            for(var i=0;i<disp.length;i++) {
                if(i<period-1) sma.push(null);
                else { var sum=0; for(var j=0;j<period;j++) sum+=disp[i-j]; sma.push(sum/period); }
            }
            priceCt = new Chart($('priceCt'),{
                type:'line',
                data:{
                    labels:lbls,
                    datasets:[
                    {data:sma,borderColor:'rgba(255,215,0,0.8)',borderWidth:2,pointRadius:0,fill:false,spanGaps:true},
                    {data:disp,borderColor:'#00f0ff',backgroundColor:'rgba(0,240,255,0.1)',fill:true,tension:0.4,pointRadius:0}
                    ]
                },
                options:{
                    responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
                    scales:{
                        x:{display:true,grid:{display:false},ticks:{color:'#5a6a7e',font:{size:9},maxTicksLimit:8}},
                        y:{position:'right',grid:{color:'rgba(255,255,255,0.04)'},ticks:{color:'#5a6a7e',callback:function(v){return'$'+v.toLocaleString();}}}
                    }
                }
            });
            volCt = new Chart($('volCt'),{type:'bar',data:{labels:lbls,datasets:[{data:vols,backgroundColor:vols.map(function(v,i){return disp[i+1]>disp[i]?'rgba(0,255,136,0.5)':'rgba(255,51,102,0.5)';})}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{display:false},y:{display:false}}}});
            $('last-update').textContent='Last update: '+new Date().toLocaleTimeString();
        }

function renderAlloc() { if(allocCt) allocCt.destroy(); allocCt = new Chart($('allocCt'),{type:'doughnut',data:{labels:['BTC','ETH','NVDA','AAPL','MSFT','GOOGL','TSLA'],datasets:[{data:[28,18,16,14,12,8,4],backgroundColor:['#00f0ff','#a855f7','#00ff88','#ffd700','#00f0ff','#ff3366','#a855f7'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:'70%',plugins:{legend:{display:false}}}}); }
        
        function renderAnalytics() {
            var tot=0,chg=0,sqSum=0; for(var i=0;i<data.length;i++){tot+=data[i].price*data[i].hold;chg+=data[i].price*data[i].hold*data[i].chg/100;}
            var ret = chg/tot; for(var i=0;i<data.length;i++){var r=data[i].chg/100;sqSum+=Math.pow(r-ret,2);} var vol = Math.sqrt(sqSum/data.length)*Math.sqrt(252);
            var sharpe = (ret*252)/(vol||0.1); var maxDD = -Math.random()*15; var beta = 0.8+Math.random()*0.6;
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
                    var c = i===j?1:(Math.random()*2-1).toFixed(2);
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
            var news = [
                {title:'Fed signals potential rate cuts in 2024',tag:'Economy',time:'2h ago'},
                {title:'Bitcoin ETF sees record inflows',tag:'Crypto',time:'3h ago'},
                {title:'NVIDIA announces new AI chip lineup',tag:'Tech',time:'4h ago'},
                {title:'Apple Vision Pro sales exceed expectations',tag:'Tech',time:'5h ago'},
                {title:'Ethereum upgrade scheduled for Q2',tag:'Crypto',time:'6h ago'}
            ];
            var h = '';
            for(var i=0;i<news.length;i++){
                h += '<div class="news-item"><div class="news-title">'+news[i].title+'</div>';
                h += '<div class="news-meta"><span class="news-tag">'+news[i].tag+'</span><span>'+news[i].time+'</span></div></div>';
            }
            $('news-feed').innerHTML = h;
        }
        function renderCalendar() {
            var events = [
                {date:'Feb 28',event:'Fed Chair Powell Testimony',impact:'high'},
                {date:'Mar 1',event:'Manufacturing PMI',impact:'medium'},
                {date:'Mar 5',event:'Non-Farm Payrolls',impact:'high'},
                {date:'Mar 10',event:'CPI Data Release',impact:'high'},
                {date:'Mar 12',event:'FOMC Meeting',impact:'high'},
                {date:'Mar 15',event:'Retail Sales',impact:'medium'}
            ];
            var h = '';
            for(var i=0;i<events.length;i++){
                h += '<div class="calendar-item"><span class="calendar-date">'+events[i].date+'</span>';
                h += '<span class="calendar-event">'+events[i].event+'</span>';
                h += '<span class="calendar-impact impact-'+events[i].impact+'">'+events[i].impact.toUpperCase()+'</span></div>';
            }
            $('calendar').innerHTML = h;
        }
        
        // Interactions
        
        // Chart Enhancement Variables
        var showBollinger = false, showEMA = false, showSR = false;
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
        
        // Calculate indicators
        function calcSMA(data, period) {
            var result = [];
            for(var i = 0; i < data.length; i++) {
                if(i < period - 1) { result.push(null); }
                else {
                    var sum = 0;
                    for(var j = 0; j < period; j++) sum += data[i - j];
                    result.push(sum / period);
                }
            }
            return result;
        }
        
        function calcEMA(data, period) {
            var result = [];
            var k = 2 / (period + 1);
            var ema = data[0];
            for(var i = 0; i < data.length; i++) {
                if(i === 0) { ema = data[i]; }
                else { ema = data[i] * k + ema * (1 - k); }
                result.push(ema);
            }
            return result;
        }
        
        function calcBollingerBands(data, period, stdDev) {
            var sma = calcSMA(data, period);
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
        
window.selAsset = function(s) { for(var i=0;i<data.length;i++) if(data[i].sym===s){sel=data[i];break;} $('chart-sym').textContent=s; if(!history[s])history[s]=genHistory(sel.price,100); renderAssets();renderInds();renderActions();renderAssetDetails();renderChart(); };
        window.toggleFav = function(s) { for(var i=0;i<data.length;i++) if(data[i].sym===s){data[i].fav=!data[i].fav;renderAssets();showToast(s+(data[i].fav?' added to':' removed from')+' favorites');break;} };
        window.setTf = function(tf) { timeframe=tf; var btns=document.querySelectorAll('.chart-btn'); for(var j=0;j<btns.length;j++){btns[j].classList.remove('on');} if(typeof event!=='undefined' && event.target) event.target.classList.add('on'); ohlcData={}; renderChart(); };
        window.toggleChartType = function() { chartType = chartType==='line'?'candle':'line'; $('chart-type-btn').textContent = chartType.toUpperCase(); renderChart(); };
        
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
                if(screenerFilters.rsi) { var arr=history[a.sym]||genHistory(a.price,100); history[a.sym]=arr; if(calcRSI(arr)>=30) return false; }
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
            var rsi = calcRSI(history[sel.sym]||genHistory(sel.price,100));
            var tot = 0, chg = 0;
            for(var i=0;i<data.length;i++){tot+=data[i].price*data[i].hold;chg+=data[i].price*data[i].hold*data[i].chg/100;}
            var pct = tot>0 ? (chg/tot*100) : 0;
            var macd = calcMACD(history[sel.sym]||genHistory(sel.price,100));
            
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
                resp += tips[Math.floor(Math.random()*tips.length)]+'<br><br>';
                resp += 'Current RSI Strategy for '+sel.sym+': ';
                if(rsi<30) resp += 'Consider accumulating - RSI suggests oversold conditions.';
                else if(rsi>70) resp += 'Consider taking profits - RSI suggests overbought conditions.';
                else resp += 'Hold current position - RSI in neutral territory.';
                return resp;
            }
            else {
                var resp = 'Based on current conditions:<br><br>';
                resp += '• '+sel.sym+' RSI: '+rsi.toFixed(1)+' ('+(rsi<30?'oversold':rsi>70?'overbought':'neutral')+')<br>';
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
            }, 1000+Math.random()*500);
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
            console.log('Saved to localStorage:', holdings);

            // Try to save to Supabase (may fail)
            try {
                localStorage.setItem('assetList', JSON.stringify(data.map(function(a){return{sym:a.sym,name:a.name,type:a.type,color:a.color,hold:a.hold,fav:a.fav}})));
            await savePortfolioToSupabase();
            } catch(e) {
                console.error('Supabase save failed:', e);
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
                price:type==='crypto'?Math.random()*1000:type==='stock'?Math.random()*500:Math.random()*100,
                chg:(Math.random()*10-5),
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
            var token = localStorage.getItem('sb_token');
            console.log('savePortfolioToSupabase called, token:', token ? 'exists' : 'missing', 'user:', user ? user.id : 'missing');
            if(!token || !user) { console.log('Skipping save - no auth'); return; }

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
            console.log('Entries to save:', entries);

            try {
                // First, delete existing portfolio entries for this user
                var delUrl = SUPABASE_URL+'/rest/v1/portfolios?user_id=eq.'+user.id;
                console.log('DELETE URL:', delUrl);
                var delRes = await fetch(delUrl, {
                    method: 'DELETE',
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': 'Bearer '+token,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    }
                });
                console.log('DELETE status:', delRes.status);
                var delData = await delRes.text();
                console.log('DELETE response:', delData);

                console.log('Entries to insert:', entries);

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
                    console.log('POST status:', postRes.status);
                    var postData = await postRes.text();
                    console.log('POST response:', postData);
                    if(postRes.ok) {
                        showToast('Portfolio saved to cloud!');
                    } else {
                        showToast('Save failed - check console');
                    }
                } else {
                    showToast('No holdings to save');
                }
            } catch(e) {
                console.error('Failed to save portfolio:', e);
                showToast('Save error: ' + e.message);
            }
        }

        // Load portfolio from Supabase
        async function loadPortfolioFromSupabase() {
            var token = localStorage.getItem('sb_token');
            console.log('loadPortfolioFromSupabase called, user:', user ? user.id : 'missing');
            if(!token || !user) { console.log('Skipping load - no auth'); return; }

            try {
                var url = SUPABASE_URL+'/rest/v1/portfolios?user_id=eq.'+user.id;
                console.log('GET URL:', url);
                var r = await fetch(url, {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': 'Bearer '+token
                    }
                });

                console.log('GET status:', r.status);
                if(r.ok) {
                    var portfolio = await r.json();
                    console.log('Loaded portfolio:', portfolio);
                    for(var i=0;i<portfolio.length;i++) {
                        var entry = portfolio[i];
                        var asset = data.find(function(a){return a.sym===entry.symbol;});
                        if(asset) {
                            asset.hold = entry.holdings || 0;
                            asset.fav = entry.favorite || false;
                            console.log('Updated', entry.symbol, ': hold=', asset.hold, 'fav=', asset.fav);
                        }
                    }
                    console.log('Portfolio loaded from Supabase:', portfolio.length, 'assets');
                    $('db-status').innerHTML='<span style="color:var(--purple)">[DB]</span> SYNCED';
                } else {
                    console.log('GET failed:', await r.text());
                }
            } catch(e) {
                console.error('Failed to load portfolio:', e);
            }
        }

        function loadSavedHoldings() {
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
            } catch(e) { console.error('loadSavedHoldings error:', e); }
        }
        function init() { 
            console.log('INIT CALLED');
            setTimeout(function(){
                console.log('TIMEOUT FIRED');
                if(checkSession()){
                    console.log('SESSION FOUND - SHOWING DASHBOARD');
                    showDashboard();
                }else{
                    console.log('NO SESSION - SHOWING LOGIN');
                    showLogin();
                }
            },CONFIG.INIT_DELAY); 
        }
        if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
    })();