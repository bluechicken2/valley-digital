-- ================================================
-- RLS Fix for country_briefings INSERT
-- Run at: https://supabase.com/dashboard/project/dkxydhuojaspmbpjfyoz/sql
-- ================================================

-- Allow service_role to INSERT/UPDATE/DELETE country_briefings
CREATE POLICY "Service role full access" ON country_briefings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Alternative: If above doesn't work, disable RLS for service_role
-- ALTER TABLE country_briefings ALTER COLUMN country_code SET DEFAULT 'XX';
