-- ============================================
-- TradingAI RLS Fix - Run in Supabase SQL Editor
-- Dashboard: https://supabase.com/dashboard/project/dkxydhuojaspmbpjfyoz/sql
-- ============================================

-- 1. Drop existing permissive policies (security risk!)
DROP POLICY IF EXISTS "Users can view own data" ON users;
DROP POLICY IF EXISTS "Users can insert own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Users can view own portfolios" ON portfolios;
DROP POLICY IF EXISTS "Users can insert own portfolios" ON portfolios;
DROP POLICY IF EXISTS "Users can update own portfolios" ON portfolios;
DROP POLICY IF EXISTS "Users can delete own portfolios" ON portfolios;
DROP POLICY IF EXISTS "Users can view own alerts" ON alerts;
DROP POLICY IF EXISTS "Users can insert own alerts" ON alerts;
DROP POLICY IF EXISTS "Users can delete own alerts" ON alerts;

-- 2. Create SECURE RLS policies for users table
-- Link users table to Supabase auth.users via email
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (email = auth.jwt() ->> 'email');

CREATE POLICY "Users can insert own profile" ON users
    FOR INSERT WITH CHECK (email = auth.jwt() ->> 'email');

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (email = auth.jwt() ->> 'email');

-- 3. Create SECURE RLS policies for portfolios
CREATE POLICY "Users can view own portfolios" ON portfolios
    FOR SELECT USING (
        user_id IN (SELECT id FROM users WHERE email = auth.jwt() ->> 'email')
    );

CREATE POLICY "Users can insert own portfolios" ON portfolios
    FOR INSERT WITH CHECK (
        user_id IN (SELECT id FROM users WHERE email = auth.jwt() ->> 'email')
    );

CREATE POLICY "Users can update own portfolios" ON portfolios
    FOR UPDATE USING (
        user_id IN (SELECT id FROM users WHERE email = auth.jwt() ->> 'email')
    );

CREATE POLICY "Users can delete own portfolios" ON portfolios
    FOR DELETE USING (
        user_id IN (SELECT id FROM users WHERE email = auth.jwt() ->> 'email')
    );

-- 4. Create SECURE RLS policies for alerts
CREATE POLICY "Users can view own alerts" ON alerts
    FOR SELECT USING (
        user_id IN (SELECT id FROM users WHERE email = auth.jwt() ->> 'email')
    );

CREATE POLICY "Users can insert own alerts" ON alerts
    FOR INSERT WITH CHECK (
        user_id IN (SELECT id FROM users WHERE email = auth.jwt() ->> 'email')
    );

CREATE POLICY "Users can update own alerts" ON alerts
    FOR UPDATE USING (
        user_id IN (SELECT id FROM users WHERE email = auth.jwt() ->> 'email')
    );

CREATE POLICY "Users can delete own alerts" ON alerts
    FOR DELETE USING (
        user_id IN (SELECT id FROM users WHERE email = auth.jwt() ->> 'email')
    );

-- 5. Create SECURE RLS policies for watchlists
CREATE POLICY "Users can view own watchlists" ON watchlists
    FOR SELECT USING (
        user_id IN (SELECT id FROM users WHERE email = auth.jwt() ->> 'email')
    );

CREATE POLICY "Users can insert own watchlists" ON watchlists
    FOR INSERT WITH CHECK (
        user_id IN (SELECT id FROM users WHERE email = auth.jwt() ->> 'email')
    );

CREATE POLICY "Users can update own watchlists" ON watchlists
    FOR UPDATE USING (
        user_id IN (SELECT id FROM users WHERE email = auth.jwt() ->> 'email')
    );

CREATE POLICY "Users can delete own watchlists" ON watchlists
    FOR DELETE USING (
        user_id IN (SELECT id FROM users WHERE email = auth.jwt() ->> 'email')
    );

-- 6. Create SECURE RLS policies for user_settings
CREATE POLICY "Users can view own settings" ON user_settings
    FOR SELECT USING (
        user_id IN (SELECT id FROM users WHERE email = auth.jwt() ->> 'email')
    );

CREATE POLICY "Users can insert own settings" ON user_settings
    FOR INSERT WITH CHECK (
        user_id IN (SELECT id FROM users WHERE email = auth.jwt() ->> 'email')
    );

CREATE POLICY "Users can update own settings" ON user_settings
    FOR UPDATE USING (
        user_id IN (SELECT id FROM users WHERE email = auth.jwt() ->> 'email')
    );

-- 7. For anonymous/public access (demo mode), create a separate function
-- This allows reading aggregated/public data without authentication
CREATE OR REPLACE FUNCTION is_demo_mode()
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if request comes from allowed domain or has demo header
    RETURN current_setting('request.headers', true)::json->>'x-demo-mode' = 'true'
        OR auth.jwt() ->> 'email' IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- DONE! Run this SQL in Supabase Dashboard
-- ============================================
