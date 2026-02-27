// TradingAI Configuration Module

var CONFIG = {
    // API Endpoints
    SUPABASE_URL: 'https://dkxydhuojaspmbpjfyoz.supabase.co',
    SUPABASE_KEY: 'sb_publishable_ydepQXbHFjFA-_TIwOYNHg_SwN0m5PL',
    API_BASE: 'https://tradingapi-proxy.cloudflare-5m9f2.workers.dev',
    
    // Timing
    REFRESH_INTERVAL: 60000,      // Price refresh interval (ms)
    TIME_UPDATE_INTERVAL: 1000,   // Time display update (ms)
    INIT_DELAY: 100,              // Init timeout delay (ms)
    TOAST_DURATION: 3000,         // Toast notification duration (ms)
    
    // Chart Settings
    SMA_PERIOD: 20,               // SMA period for charts
    EMA_SHORT: 9,                 // Short EMA period
    EMA_LONG: 21,                 // Long EMA period
    VOL_MA_PERIOD: 10,            // Volume MA period
    CHART_HEIGHT: 320,            // Default chart height (px)
    VOLUME_HEIGHT: 80,            // Volume chart height (px)
    
    // Cache TTL
    CACHE_TTL: {
        PRICE: 30000,             // 30 seconds
        OHLC: 300000              // 5 minutes
    },
    
    // Indicator Thresholds
    RSI_OVERBOUGHT: 70,
    RSI_OVERSOLD: 30,
    STOCH_OVERBOUGHT: 80,
    STOCH_OVERSOLD: 20,
    
    // Default Watchlists
    DEFAULT_WATCHLISTS: [
        {name: 'Crypto', symbols: ['BTC', 'ETH', 'SOL']},
        {name: 'Tech', symbols: ['AAPL', 'NVDA', 'MSFT', 'GOOGL']}
    ]
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
