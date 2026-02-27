// TradingAI API Module

var API = {
    // Cache storage
    cache: {},
    
    // Safe fetch wrapper with error handling
    safeFetch: async function(url, options) {
        try {
            var r = await fetch(url, options || {});
            if (!r.ok) { 
                console.error('Fetch failed:', r.status, url); 
                return null; 
            }
            return r;
        } catch(e) {
            console.error('Fetch error:', e.message, url);
            return null;
        }
    },
    
    // Get cached data
    getCached: function(key, ttl) {
        var item = this.cache[key];
        if (item && Date.now() - item.time < ttl) {
            return item.data;
        }
        return null;
    },
    
    // Set cache data
    setCache: function(key, data) {
        this.cache[key] = { data: data, time: Date.now() };
    },
    
    // Fetch with cache
    fetchWithCache: async function(key, url, ttl) {
        var cached = this.getCached(key, ttl);
        if (cached) return cached;
        
        try {
            var response = await this.safeFetch(url);
            if (!response) return null;
            
            var data = await response.json();
            this.setCache(key, data);
            return data;
        } catch(e) {
            console.error('fetchWithCache error:', e.message);
            return null;
        }
    },
    
    // Fetch prices from API
    fetchPrices: async function() {
        var self = this;
        var cached = this.getCached('prices', CONFIG.CACHE_TTL.PRICE);
        if (cached) return cached;
        
        try {
            var response = await this.safeFetch(CONFIG.API_BASE + '/prices');
            if (!response) return null;
            
            var data = await response.json();
            this.setCache('prices', data);
            return data;
        } catch(e) {
            console.error('fetchPrices error:', e.message);
            return null;
        }
    },
    
    // Fetch OHLC data
    fetchOHLC: async function(symbol) {
        var key = 'ohlc_' + symbol;
        var cached = this.getCached(key, CONFIG.CACHE_TTL.OHLC);
        if (cached) return cached;
        
        try {
            var response = await this.safeFetch(CONFIG.API_BASE + '/ohlc?symbol=' + symbol);
            if (!response) return null;
            
            var data = await response.json();
            this.setCache(key, data);
            return data;
        } catch(e) {
            console.error('fetchOHLC error:', e.message);
            return null;
        }
    },
    
    // Fetch sector data
    fetchSectors: async function() {
        var cached = this.getCached('sectors', CONFIG.CACHE_TTL.OHLC);
        if (cached) return cached;
        
        try {
            var response = await this.safeFetch(CONFIG.API_BASE + '/sectors');
            if (!response) return null;
            
            var data = await response.json();
            this.setCache('sectors', data);
            return data;
        } catch(e) {
            console.error('fetchSectors error:', e.message);
            return null;
        }
    },
    
    // Health check
    healthCheck: async function() {
        try {
            var response = await this.safeFetch(CONFIG.API_BASE + '/health');
            if (!response) return { status: 'error' };
            return await response.json();
        } catch(e) {
            return { status: 'error', message: e.message };
        }
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
}
