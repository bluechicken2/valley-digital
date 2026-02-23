// TradingAI Supabase Configuration
// This file contains the connection settings for Supabase backend

const SUPABASE_CONFIG = {
    url: 'https://dkxydhuojaspmbpjfyoz.supabase.co',
    anonKey: 'sb_publishable_ydepQXbHFjFA-_TIwOYNHg_SwN0m5PL',
    
    // REST API endpoints
    endpoints: {
        users: '/rest/v1/users',
        portfolios: '/rest/v1/portfolios',
        alerts: '/rest/v1/alerts',
        watchlists: '/rest/v1/watchlists',
        settings: '/rest/v1/user_settings'
    }
};

// Helper class for Supabase operations
class SupabaseClient {
    constructor(config) {
        this.url = config.url;
        this.anonKey = config.anonKey;
        this.headers = {
            'apikey': this.anonKey,
            'Authorization': 'Bearer ' + this.anonKey,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };
    }
    
    async request(endpoint, options = {}) {
        const url = this.url + endpoint;
        const response = await fetch(url, {
            ...options,
            headers: { ...this.headers, ...options.headers }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'API request failed');
        }
        
        return response.json();
    }
    
    // Get all portfolios for a user
    async getPortfolios(userId) {
        return this.request('/rest/v1/portfolios?user_id=eq.' + userId + '&select=*');
    }
    
    // Add asset to portfolio
    async addToPortfolio(userId, symbol, quantity, favorite = false) {
        return this.request('/rest/v1/portfolios', {
            method: 'POST',
            body: JSON.stringify({ user_id: userId, symbol, quantity, favorite })
        });
    }
    
    // Update portfolio item
    async updatePortfolio(portfolioId, data) {
        return this.request('/rest/v1/portfolios?id=eq.' + portfolioId, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    }
    
    // Get alerts for user
    async getAlerts(userId) {
        return this.request('/rest/v1/alerts?user_id=eq.' + userId + '&select=*');
    }
    
    // Create alert
    async createAlert(userId, symbol, condition, targetPrice) {
        return this.request('/rest/v1/alerts', {
            method: 'POST',
            body: JSON.stringify({ 
                user_id: userId, 
                symbol, 
                condition, 
                target_price: targetPrice 
            })
        });
    }
    
    // Delete alert
    async deleteAlert(alertId) {
        return this.request('/rest/v1/alerts?id=eq.' + alertId, {
            method: 'DELETE'
        });
    }
}

// Export for use in dashboard
if (typeof window !== 'undefined') {
    window.SupabaseClient = SupabaseClient;
    window.SUPABASE_CONFIG = SUPABASE_CONFIG;
}
