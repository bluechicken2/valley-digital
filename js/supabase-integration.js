// TradingAI Supabase Integration Module
// Handles authentication, portfolio, alerts, and watchlists

(function() {
    'use strict';

    // Supabase configuration
    const SUPABASE_URL = 'https://dkxydhuojaspmbpjfyoz.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_ydepQXbHFjFA-_TIwOYNHg_SwN0m5PL';

    // State management
    let supabase = null;
    let currentUser = null;
    let session = null;

    // Initialize Supabase client
    async function initSupabase() {
        if (typeof window.supabase === 'undefined') {
            console.error('Supabase SDK not loaded');
            return false;
        }

        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        window.supabaseClient = supabase;

        // Check for existing session
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession) {
            session = existingSession;
            currentUser = existingSession.user;
            await onAuthStateChange('SIGNED_IN', session);
        }

        // Listen for auth changes
        supabase.auth.onAuthStateChange((event, newSession) => {
            session = newSession;
            currentUser = newSession?.user || null;
            onAuthStateChange(event, session);
        });

        console.log('Supabase initialized');
        return true;
    }

    // Handle auth state changes
    async function onAuthStateChange(event, session) {
        const authContainer = document.getElementById('auth-modal');
        const userMenu = document.getElementById('user-menu');

        if (event === 'SIGNED_IN' && session) {
            if (authContainer) authContainer.classList.add('hidden');
            if (userMenu) {
                userMenu.classList.remove('hidden');
                const userEmail = document.getElementById('user-email');
                if (userEmail) userEmail.textContent = session.user.email;
            }

            await Promise.all([
                loadPortfolio(),
                loadAlerts(),
                loadWatchlists(),
                loadUserSettings()
            ]);

            showNotification('Welcome back!', 'success');
        } else if (event === 'SIGNED_OUT') {
            if (authContainer) authContainer.classList.remove('hidden');
            if (userMenu) userMenu.classList.add('hidden');
            clearUserData();
            showNotification('Signed out', 'info');
        }
    }

    // Auth Functions
    async function signUp(email, password) {
        try {
            const { data, error } = await supabase.auth.signUp({ email, password });
            if (error) throw error;
            if (data.user) {
                await supabase.from('users').insert({
                    id: data.user.id,
                    email: email,
                    tier: 'free',
                    created_at: new Date().toISOString()
                });
            }
            showNotification('Account created! Check email to verify.', 'success');
            return { success: true, data };
        } catch (error) {
            showNotification(error.message, 'error');
            return { success: false, error };
        }
    }

    async function signIn(email, password) {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            showNotification(error.message, 'error');
            return { success: false, error };
        }
    }

    async function signOut() {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            return { success: true };
        } catch (error) {
            showNotification(error.message, 'error');
            return { success: false, error };
        }
    }

    async function resetPassword(email) {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email);
            if (error) throw error;
            showNotification('Password reset email sent!', 'success');
            return { success: true };
        } catch (error) {
            showNotification(error.message, 'error');
            return { success: false, error };
        }
    }

    // Portfolio Functions
    async function loadPortfolio() {
        if (!currentUser) return;
        try {
            const { data, error } = await supabase
                .from('portfolios')
                .select('*')
                .eq('user_id', currentUser.id);
            if (error) throw error;
            window.userPortfolio = data || [];
            updatePortfolioUI(data);
            return { success: true, data };
        } catch (error) {
            console.error('Error loading portfolio:', error);
            return { success: false, error };
        }
    }

    async function addToPortfolio(symbol, quantity, favorite = false) {
        if (!currentUser) {
            showNotification('Please sign in', 'warning');
            return { success: false };
        }
        try {
            const { data, error } = await supabase
                .from('portfolios')
                .upsert({
                    user_id: currentUser.id,
                    symbol: symbol.toUpperCase(),
                    quantity: parseFloat(quantity),
                    favorite
                }, { onConflict: 'user_id,symbol' })
                .select();
            if (error) throw error;
            showNotification(`Added ${quantity} ${symbol}`, 'success');
            await loadPortfolio();
            return { success: true, data };
        } catch (error) {
            showNotification(error.message, 'error');
            return { success: false, error };
        }
    }

    async function removeFromPortfolio(portfolioId) {
        if (!currentUser) return { success: false };
        try {
            const { error } = await supabase
                .from('portfolios')
                .delete()
                .eq('id', portfolioId)
                .eq('user_id', currentUser.id);
            if (error) throw error;
            showNotification('Removed from portfolio', 'success');
            await loadPortfolio();
            return { success: true };
        } catch (error) {
            showNotification(error.message, 'error');
            return { success: false, error };
        }
    }

    // Alerts Functions
    async function loadAlerts() {
        if (!currentUser) return;
        try {
            const { data, error } = await supabase
                .from('alerts')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            window.userAlerts = data || [];
            updateAlertsUI(data);
            return { success: true, data };
        } catch (error) {
            console.error('Error loading alerts:', error);
            return { success: false, error };
        }
    }

    async function createAlert(symbol, condition, targetPrice) {
        if (!currentUser) {
            showNotification('Please sign in', 'warning');
            return { success: false };
        }
        try {
            const { data, error } = await supabase
                .from('alerts')
                .insert({
                    user_id: currentUser.id,
                    symbol: symbol.toUpperCase(),
                    condition: condition,
                    target_price: parseFloat(targetPrice),
                    triggered: false
                }).select();
            if (error) throw error;
            showNotification(`Alert created for ${symbol}`, 'success');
            await loadAlerts();
            return { success: true, data };
        } catch (error) {
            showNotification(error.message, 'error');
            return { success: false, error };
        }
    }

    async function deleteAlert(alertId) {
        if (!currentUser) return { success: false };
        try {
            const { error } = await supabase
                .from('alerts')
                .delete()
                .eq('id', alertId)
                .eq('user_id', currentUser.id);
            if (error) throw error;
            showNotification('Alert deleted', 'success');
            await loadAlerts();
            return { success: true };
        } catch (error) {
            showNotification(error.message, 'error');
            return { success: false, error };
        }
    }

    // Watchlist Functions
    async function loadWatchlists() {
        if (!currentUser) return;
        try {
            const { data, error } = await supabase
                .from('watchlists')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            window.userWatchlist = data || [];
            updateWatchlistUI(data);
            return { success: true, data };
        } catch (error) {
            console.error('Error loading watchlist:', error);
            return { success: false, error };
        }
    }

    async function addToWatchlist(symbol, notes = '') {
        if (!currentUser) {
            showNotification('Please sign in', 'warning');
            return { success: false };
        }
        try {
            const { data, error } = await supabase
                .from('watchlists')
                .insert({
                    user_id: currentUser.id,
                    symbol: symbol.toUpperCase(),
                    notes
                }).select();
            if (error) throw error;
            showNotification(`${symbol} added to watchlist`, 'success');
            await loadWatchlists();
            return { success: true, data };
        } catch (error) {
            showNotification(error.message, 'error');
            return { success: false, error };
        }
    }

    async function removeFromWatchlist(watchlistId) {
        if (!currentUser) return { success: false };
        try {
            const { error } = await supabase
                .from('watchlists')
                .delete()
                .eq('id', watchlistId)
                .eq('user_id', currentUser.id);
            if (error) throw error;
            showNotification('Removed from watchlist', 'success');
            await loadWatchlists();
            return { success: true };
        } catch (error) {
            showNotification(error.message, 'error');
            return { success: false, error };
        }
    }

    // User Settings
    async function loadUserSettings() {
        if (!currentUser) return;
        try {
            const { data, error } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', currentUser.id)
                .single();
            if (error && error.code !== 'PGRST116') throw error;
            window.userSettings = data || {};
            return { success: true, data };
        } catch (error) {
            console.error('Error loading settings:', error);
            return { success: false, error };
        }
    }

    // UI Update Functions
    function updatePortfolioUI(portfolio) {
        const container = document.getElementById('portfolio-items');
        if (!container) return;
        if (!portfolio || portfolio.length === 0) {
            container.innerHTML = '<div class="empty-state">No holdings yet</div>';
            return;
        }
        let html = '';
        portfolio.forEach(item => {
            const price = window.livePrices?.[item.symbol]?.price || 0;
            const change = window.livePrices?.[item.symbol]?.change24h || 0;
            const value = price * item.quantity;
            html += `<div class="p-item">
                <span class="p-sym">${item.symbol}</span>
                <span class="p-qty">${item.quantity}</span>
                <span class="p-val">$${formatNum(value)}</span>
                <span class="p-chg ${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</span>
                <button class="p-del" onclick="TradingAI.removeFromPortfolio('${item.id}')">×</button>
            </div>`;
        });
        container.innerHTML = html;
    }

    function updateAlertsUI(alerts) {
        const container = document.getElementById('alerts-list');
        if (!container) return;
        if (!alerts || alerts.length === 0) {
            container.innerHTML = '<div class="empty-state">No alerts</div>';
            return;
        }
        let html = '';
        alerts.forEach(alert => {
            const price = window.livePrices?.[alert.symbol]?.price || 0;
            const triggered = (alert.condition === 'above' && price >= alert.target_price) ||
                              (alert.condition === 'below' && price <= alert.target_price);
            html += `<div class="a-item ${triggered ? 'triggered' : ''}">
                <span class="a-sym">${alert.symbol}</span>
                <span class="a-cond">${alert.condition} $${formatNum(alert.target_price)}</span>
                <span class="a-status">${triggered ? '✓' : '⏳'}</span>
                <button class="a-del" onclick="TradingAI.deleteAlert('${alert.id}')">×</button>
            </div>`;
        });
        container.innerHTML = html;
    }

    function updateWatchlistUI(watchlist) {
        const container = document.getElementById('watchlist-items');
        if (!container) return;
        if (!watchlist || watchlist.length === 0) {
            container.innerHTML = '<div class="empty-state">Empty watchlist</div>';
            return;
        }
        let html = '';
        watchlist.forEach(item => {
            const price = window.livePrices?.[item.symbol]?.price || 0;
            const change = window.livePrices?.[item.symbol]?.change24h || 0;
            html += `<div class="w-item">
                <span class="w-sym" onclick="selAsset('${item.symbol}')">${item.symbol}</span>
                <span class="w-price">$${formatNum(price)}</span>
                <span class="w-chg ${change >= 0 ? 'up' : 'down'}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</span>
                <button class="w-del" onclick="TradingAI.removeFromWatchlist('${item.id}')">×</button>
            </div>`;
        });
        container.innerHTML = html;
    }

    function clearUserData() {
        window.userPortfolio = [];
        window.userAlerts = [];
        window.userWatchlist = [];
        updatePortfolioUI([]);
        updateAlertsUI([]);
        updateWatchlistUI([]);
    }

    // Helpers
    function formatNum(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
        return num.toFixed(2);
    }

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        const container = document.getElementById('notification-container') || document.body;
        container.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Public API
    window.TradingAI = {
        init: initSupabase,
        signUp, signIn, signOut, resetPassword,
        getCurrentUser: () => currentUser,
        isAuthenticated: () => !!currentUser,
        loadPortfolio, addToPortfolio, removeFromPortfolio,
        loadAlerts, createAlert, deleteAlert,
        loadWatchlists, addToWatchlist, removeFromWatchlist,
        loadUserSettings,
        showNotification
    };

})();
