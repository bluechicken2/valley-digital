-- ================================================
-- GLOBEWATCH Database Schema
-- Run at: https://supabase.com/dashboard/project/dkxydhuojaspmbpjfyoz/sql
-- ================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop old TradingAI tables
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS watchlists    CASCADE;
DROP TABLE IF EXISTS alerts        CASCADE;
DROP TABLE IF EXISTS portfolios    CASCADE;
DROP TABLE IF EXISTS users         CASCADE;

-- ---- Profiles ----
CREATE TABLE IF NOT EXISTS profiles (
    id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email      TEXT,
    username   TEXT UNIQUE,
    tier       TEXT DEFAULT 'free' CHECK (tier IN ('free','pro')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---- Categories ----
CREATE TABLE IF NOT EXISTS categories (
    id    SERIAL PRIMARY KEY,
    name  TEXT NOT NULL,
    icon  TEXT,
    color TEXT
);

INSERT INTO categories (name, icon, color) VALUES
    ('War & Conflict',     'sword',    '#ff4444'),
    ('Politics',           'building', '#7b2fff'),
    ('Weather & Disaster', 'cloud',    '#ffaa00'),
    ('Economy',            'chart',    '#00d4ff'),
    ('Science & Tech',     'scope',    '#00ff88'),
    ('Health',             'hospital', '#ff69b4'),
    ('Elections',          'ballot',   '#4488ff'),
    ('Environment',        'leaf',     '#44ff88')
ON CONFLICT DO NOTHING;

-- ---- Stories ----
CREATE TABLE IF NOT EXISTS stories (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    headline         TEXT NOT NULL,
    summary          TEXT,
    country_code     TEXT,
    country_name     TEXT,
    lat              DECIMAL(9,6),
    lng              DECIMAL(9,6),
    category         TEXT,
    category_icon    TEXT,
    category_color   TEXT,
    confidence_score INTEGER DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
    verified_count   INTEGER DEFAULT 0,
    source_count     INTEGER DEFAULT 0,
    status           TEXT DEFAULT 'unverified'
                     CHECK (status IN ('verified','unverified','contested','false')),
    is_breaking      BOOLEAN DEFAULT false,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stories_country   ON stories(country_code);
CREATE INDEX IF NOT EXISTS idx_stories_category  ON stories(category);
CREATE INDEX IF NOT EXISTS idx_stories_status    ON stories(status);
CREATE INDEX IF NOT EXISTS idx_stories_created   ON stories(created_at DESC);

-- ---- Verifications ----
CREATE TABLE IF NOT EXISTS verifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id    UUID REFERENCES stories(id) ON DELETE CASCADE,
    source_url  TEXT,
    source_name TEXT,
    source_type TEXT CHECK (source_type IN ('legacy','social','official','independent')),
    agrees      BOOLEAN DEFAULT true,
    verified_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verif_story ON verifications(story_id);

-- ---- Country Stats ----
CREATE TABLE IF NOT EXISTS country_stats (
    country_code TEXT PRIMARY KEY,
    country_name TEXT,
    story_count  INTEGER DEFAULT 0,
    heat_value   DECIMAL(5,2) DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update country_stats trigger
CREATE OR REPLACE FUNCTION update_country_stats()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO country_stats (country_code, country_name, story_count, last_updated)
    SELECT country_code, country_name, COUNT(*), NOW()
    FROM stories
    WHERE country_code = COALESCE(NEW.country_code, OLD.country_code)
    GROUP BY country_code, country_name
    ON CONFLICT (country_code) DO UPDATE
      SET story_count  = EXCLUDED.story_count,
          country_name = EXCLUDED.country_name,
          last_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_country_stats ON stories;
CREATE TRIGGER trig_country_stats
    AFTER INSERT OR UPDATE OR DELETE ON stories
    FOR EACH ROW EXECUTE FUNCTION update_country_stats();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_stories_updated_at ON stories;
CREATE TRIGGER trig_stories_updated_at
    BEFORE UPDATE ON stories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---- RLS ----
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE country_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read stories"       ON stories;
DROP POLICY IF EXISTS "Public read country_stats" ON country_stats;
DROP POLICY IF EXISTS "Public read verifications" ON verifications;
DROP POLICY IF EXISTS "Public read categories"    ON categories;
DROP POLICY IF EXISTS "Profile self read"         ON profiles;
DROP POLICY IF EXISTS "Profile self update"       ON profiles;

CREATE POLICY "Public read stories"       ON stories       FOR SELECT USING (true);
CREATE POLICY "Public read country_stats" ON country_stats FOR SELECT USING (true);
CREATE POLICY "Public read verifications" ON verifications FOR SELECT USING (true);
CREATE POLICY "Public read categories"    ON categories    FOR SELECT USING (true);
CREATE POLICY "Profile self read"         ON profiles      FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Profile self update"       ON profiles      FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (new.id, new.email)
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE stories;
ALTER PUBLICATION supabase_realtime ADD TABLE country_stats;

-- ================================================
-- SCHEMA MIGRATION v2 — Xray Intelligence Columns
-- Run in Supabase SQL editor after initial schema
-- ================================================

-- Add article fetching + Xray verdict columns to stories
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS external_url     TEXT,
  ADD COLUMN IF NOT EXISTS full_text        TEXT,
  ADD COLUMN IF NOT EXISTS xray_verdict     TEXT,
  ADD COLUMN IF NOT EXISTS xray_score       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS story_thread_id  TEXT,
  ADD COLUMN IF NOT EXISTS article_fetched  BOOLEAN DEFAULT false;

-- Indexes for Xray queries
CREATE INDEX IF NOT EXISTS idx_stories_article_fetched ON stories(article_fetched);
CREATE INDEX IF NOT EXISTS idx_stories_thread         ON stories(story_thread_id);
CREATE INDEX IF NOT EXISTS idx_stories_xray_score     ON stories(xray_score DESC);

-- Xray can write verdicts (service role bypasses RLS)
-- Dashboard reads verdicts via existing public read policy
