// TradingAI Technical Indicators Module

var Indicators = {
    // RSI (Relative Strength Index)
    calcRSI: function(arr, period) {
        period = period || 14;
        if (!arr || arr.length < period + 1) return null;
        
        var gains = 0, losses = 0;
        for (var i = arr.length - period; i < arr.length; i++) {
            if (arr[i] === undefined || arr[i-1] === undefined) continue;
            var diff = arr[i] - arr[i-1];
            if (diff > 0) gains += diff;
            else losses -= diff;
        }
        
        var rs = losses === 0 ? 100 : gains / losses;
        var rsi = 100 - (100 / (1 + rs));
        
        return {
            value: rsi,
            signal: rsi > 70 ? 'Overbought' : rsi < 30 ? 'Oversold' : 'Neutral',
            trend: rsi > 50 ? 'bull' : 'bear'
        };
    },
    
    // EMA (Exponential Moving Average)
    calcEMA: function(arr, period) {
        if (!arr || arr.length < period) return null;
        
        var k = 2 / (period + 1);
        var ema = arr[0];
        
        for (var i = 1; i < arr.length; i++) {
            ema = arr[i] * k + ema * (1 - k);
        }
        
        return ema;
    },
    
    // SMA (Simple Moving Average)
    calcSMA: function(arr, period) {
        if (!arr || arr.length < period) return null;
        
        var sum = 0;
        for (var i = arr.length - period; i < arr.length; i++) {
            sum += arr[i];
        }
        
        return sum / period;
    },
    
    // MACD (Moving Average Convergence Divergence)
    calcMACD: function(arr) {
        if (!arr || arr.length < 26) return null;
        
        var ema12 = this.calcEMA(arr, 12);
        var ema26 = this.calcEMA(arr, 26);
        var macd = ema12 - ema26;
        
        // Calculate signal line (9-period EMA of MACD)
        var macdHistory = [];
        for (var i = 26; i < arr.length; i++) {
            var e12 = this.calcEMA(arr.slice(0, i + 1), 12);
            var e26 = this.calcEMA(arr.slice(0, i + 1), 26);
            macdHistory.push(e12 - e26);
        }
        var signal = macdHistory.length >= 9 ? this.calcEMA(macdHistory, 9) : macd;
        
        var histogram = macd - signal;
        
        return {
            macd: macd,
            signal: signal,
            histogram: histogram,
            value: macd.toFixed(2),
            trend: macd > signal ? 'bull' : 'bear',
            signalText: macd > signal ? 'Bullish' : 'Bearish'
        };
    },
    
    // Stochastic Oscillator
    calcStochastic: function(arr, period) {
        period = period || 14;
        if (!arr || arr.length < period) return null;
        
        var recent = arr.slice(-period).filter(function(v) { return !isNaN(v) && v !== undefined; });
        if (recent.length < 2) return null;
        
        var high = Math.max.apply(null, recent);
        var low = Math.min.apply(null, recent);
        var k = high === low ? 50 : ((arr[arr.length-1] - low) / (high - low)) * 100;
        
        return {
            k: isNaN(k) ? 50 : k,
            signal: k > 80 ? 'Overbought' : k < 20 ? 'Oversold' : 'Neutral',
            trend: k > 50 ? 'bull' : 'bear'
        };
    },
    
    // ATR (Average True Range)
    calcATR: function(arr, period) {
        period = period || 14;
        if (!arr || arr.length < 2) return null;
        
        var tr = [];
        for (var i = 1; i < arr.length; i++) {
            if (arr[i] !== undefined && arr[i-1] !== undefined) {
                tr.push(Math.abs(arr[i] - arr[i-1]));
            }
        }
        
        if (tr.length < period) return null;
        
        var sum = 0;
        for (var i = tr.length - period; i < tr.length; i++) {
            sum += tr[i];
        }
        
        return sum / period;
    },
    
    // ADX (Average Directional Index)
    calcADX: function(arr, period) {
        period = period || 14;
        if (!arr || arr.length < period * 2) return null;
        
        var plusDM = 0, minusDM = 0, tr = 0;
        
        for (var i = arr.length - period; i < arr.length; i++) {
            if (arr[i] !== undefined && arr[i-1] !== undefined) {
                var up = arr[i] - arr[i-1];
                var down = arr[i-1] - arr[i];
                
                if (up > down && up > 0) plusDM += up;
                if (down > up && down > 0) minusDM += down;
                tr += Math.abs(arr[i] - arr[i-1]);
            }
        }
        
        var plusDI = tr > 0 ? (plusDM / tr) * 100 : 0;
        var minusDI = tr > 0 ? (minusDM / tr) * 100 : 0;
        var dx = (plusDI + minusDI) > 0 ? (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100 : 0;
        
        return {
            adx: dx,
            plusDI: plusDI,
            minusDI: minusDI,
            signal: dx > 25 ? 'Strong Trend' : dx > 20 ? 'Weak Trend' : 'No Trend',
            trend: plusDI > minusDI ? 'bull' : 'bear'
        };
    },
    
    // OBV (On-Balance Volume)
    calcOBV: function(data) {
        if (!data || data.length < 2) return null;
        
        var obv = 0;
        for (var i = 1; i < data.length; i++) {
            if (data[i].close > data[i-1].close) {
                obv += data[i].volume || 1;
            } else if (data[i].close < data[i-1].close) {
                obv -= data[i].volume || 1;
            }
        }
        
        return {
            value: obv,
            trend: obv > 0 ? 'bull' : 'bear',
            signal: obv > 0 ? 'Accumulation' : 'Distribution'
        };
    },
    
    // Williams %R
    calcWilliams: function(arr, period) {
        period = period || 14;
        if (!arr || arr.length < period) return null;
        
        var recent = arr.slice(-period).filter(function(v) { return !isNaN(v) && v !== undefined; });
        if (recent.length < 2) return null;
        
        var high = Math.max.apply(null, recent);
        var low = Math.min.apply(null, recent);
        var wr = high === low ? -50 : ((high - arr[arr.length-1]) / (high - low)) * -100;
        
        return {
            value: wr,
            signal: wr > -20 ? 'Overbought' : wr < -80 ? 'Oversold' : 'Neutral',
            trend: wr > -50 ? 'bull' : 'bear'
        };
    },
    
    // Bollinger Bands
    calcBollingerBands: function(arr, period, stdDev) {
        period = period || 20;
        stdDev = stdDev || 2;
        
        if (!arr || arr.length < period) return null;
        
        var sma = this.calcSMA(arr, period);
        if (sma === null) return null;
        
        var sum = 0;
        for (var i = arr.length - period; i < arr.length; i++) {
            sum += Math.pow(arr[i] - sma, 2);
        }
        var std = Math.sqrt(sum / period);
        
        return {
            middle: sma,
            upper: sma + (std * stdDev),
            lower: sma - (std * stdDev),
            bandwidth: ((sma + std * stdDev) - (sma - std * stdDev)) / sma * 100
        };
    },
    
    // Support and Resistance
    calcSupportResistance: function(arr, period) {
        period = period || 20;
        if (!arr || arr.length < period) return null;
        
        var recent = arr.slice(-period);
        var high = Math.max.apply(null, recent);
        var low = Math.min.apply(null, recent);
        var current = arr[arr.length - 1];
        
        var pivot = (high + low + current) / 3;
        
        return {
            resistance2: pivot + (high - low),
            resistance1: 2 * pivot - low,
            pivot: pivot,
            support1: 2 * pivot - high,
            support2: pivot - (high - low),
            current: current
        };
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Indicators;
}
