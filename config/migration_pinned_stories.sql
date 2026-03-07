-- ================================================
-- Migration: Add pinned stories support
-- Run at: https://supabase.com/dashboard/project/dkxydhuojaspmbpjfyoz/sql
-- ================================================

-- Add pinned story columns
ALTER TABLE stories ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS pin_priority INTEGER DEFAULT 0;

-- Create index for fast pinned queries
CREATE INDEX IF NOT EXISTS idx_stories_pinned ON stories(is_pinned, pin_priority DESC) WHERE is_pinned = TRUE;

-- Add comment
COMMENT ON COLUMN stories.is_pinned IS 'Whether this story is pinned to top of feed';
COMMENT ON COLUMN stories.pinned_at IS 'When this story was pinned';
COMMENT ON COLUMN stories.pin_priority IS 'Pin order priority (higher = more important)';
