// TradingAI Utility Module

var Utils = {
    // DOM Helper
    $: function(id) { 
        return document.getElementById(id); 
    },
    
    // Escape HTML to prevent XSS
    escapeHtml: function(text) {
        if (typeof text !== 'string') return text;
        return text.replace(/[&<>"']/g, function(m) {
            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
        });
    },
    
    // Sanitize string
    sanitize: function(str) {
        if(!str) return '';
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    },
    
    // Format number
    fmt: function(n) { 
        return n >= 1000 ? n.toLocaleString('en-US',{maximumFractionDigits:0}) : n.toFixed(n < 1 ? 4 : 2); 
    },
    
    // Format currency
    fmtCurrency: function(n, symbol) {
        symbol = symbol || '$';
        if (n === null || n === undefined) return 'N/A';
        return symbol + this.fmt(n);
    },
    
    // Format percent
    fmtPercent: function(n) {
        if (n === null || n === undefined) return 'N/A';
        var sign = n >= 0 ? '+' : '';
        return sign + n.toFixed(2) + '%';
    },
    
    // Format large numbers
    fmtLarge: function(n) {
        if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
        if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return n.toFixed(2);
    },
    
    // Show loading spinner
    showLoading: function(elId) {
        var el = document.getElementById(elId);
        if(el) el.style.display = 'inline-block';
    },
    
    // Hide loading spinner
    hideLoading: function(elId) {
        var el = document.getElementById(elId);
        if(el) el.style.display = 'none';
    },
    
    // Show toast notification
    showToast: function(message, type) {
        type = type || 'info';
        var toast = document.createElement('div');
        toast.className = 'toast toast-' + type;
        toast.textContent = message;
        toast.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:12px 24px;border-radius:8px;z-index:9999;animation:slideIn 0.3s ease;';
        
        if (type === 'error') toast.style.background = '#f85149';
        else if (type === 'success') toast.style.background = '#3fb950';
        else toast.style.background = '#58a6ff';
        
        document.body.appendChild(toast);
        setTimeout(function() { toast.remove(); }, CONFIG.TOAST_DURATION || 3000);
    },
    
    // Debounce function
    debounce: function(fn, delay) {
        var timeout;
        return function() {
            var self = this, args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(function() { fn.apply(self, args); }, delay);
        };
    },
    
    // Throttle function
    throttle: function(fn, limit) {
        var inThrottle;
        return function() {
            var self = this, args = arguments;
            if (!inThrottle) {
                fn.apply(self, args);
                inThrottle = true;
                setTimeout(function() { inThrottle = false; }, limit);
            }
        };
    },
    
    // Generate time labels
    generateTimeLabels: function(count, tf) {
        var labels = [];
        var now = new Date();
        var interval, format;

        switch(tf) {
            case '1H':
                interval = 60 * 60 * 1000;
                for(var i = count - 1; i >= 0; i--) {
                    var d = new Date(now.getTime() - i * interval);
                    labels.push(d.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: false}));
                }
                break;
            case '1D':
                interval = 24 * 60 * 60 * 1000;
                for(var i = count - 1; i >= 0; i--) {
                    var d = new Date(now.getTime() - i * interval);
                    labels.push(d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'}));
                }
                break;
            case '1W':
            case '1M':
                interval = 24 * 60 * 60 * 1000;
                for(var i = count - 1; i >= 0; i--) {
                    var d = new Date(now.getTime() - i * interval);
                    labels.push(d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'}));
                }
                break;
            case '3M':
                interval = 24 * 60 * 60 * 1000;
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
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}
