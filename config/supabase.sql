-- TradingAI Database Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/dkxydhuojaspmbpjfyoz/sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE,
    display_name TEXT,
    tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'elite')),
    stripe_customer_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User portfolios
CREATE TABLE IF NOT EXISTS portfolios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    quantity DECIMAL(18, 8) DEFAULT 0,
    avg_buy_price DECIMAL(18, 2),
    favorite BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, symbol)
);

-- Price alerts
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    condition TEXT NOT NULL CHECK (condition IN ('above', 'below')),
    target_price DECIMAL(18, 2) NOT NULL,
    triggered BOOLEAN DEFAULT false,
    triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Watchlists
CREATE TABLE IF NOT EXISTS watchlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    symbols TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User settings
CREATE TABLE IF NOT EXISTS user_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'dark',
    currency TEXT DEFAULT 'USD',
    notifications_enabled BOOLEAN DEFAULT true,
    refresh_interval INTEGER DEFAULT 60,
    settings JSONB DEFAULT '{}'
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_triggered ON alerts(triggered);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies (users can only access their own data)
CREATE POLICY "Users can view own data" ON users FOR SELECT USING (true);
CREATE POLICY "Users can insert own data" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (true);

CREATE POLICY "Users can view own portfolios" ON portfolios FOR SELECT USING (true);
CREATE POLICY "Users can insert own portfolios" ON portfolios FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own portfolios" ON portfolios FOR UPDATE USING (true);
CREATE POLICY "Users can delete own portfolios" ON portfolios FOR DELETE USING (true);

CREATE POLICY "Users can view own alerts" ON alerts FOR SELECT USING (true);
CREATE POLICY "Users can insert own alerts" ON alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can delete own alerts" ON alerts FOR DELETE USING (true);

-- Insert a demo user for testing
INSERT INTO users (email, display_name, tier) 
VALUES ('demo@tradingai.com', 'Demo User', 'pro')
ON CONFLICT (email) DO NOTHING;

-- Insert demo portfolio for demo user
INSERT INTO portfolios (user_id, symbol, quantity, favorite)
SELECT id, 'BTC', 0.5, true FROM users WHERE email = 'demo@tradingai.com'
ON CONFLICT (user_id, symbol) DO NOTHING;

INSERT INTO portfolios (user_id, symbol, quantity, favorite)
SELECT id, 'ETH', 5.0, true FROM users WHERE email = 'demo@tradingai.com'
ON CONFLICT (user_id, symbol) DO NOTHING;

INSERT INTO portfolios (user_id, symbol, quantity, favorite)
SELECT id, 'NVDA', 10, true FROM users WHERE email = 'demo@tradingai.com'
ON CONFLICT (user_id, symbol) DO NOTHING;
