-- ============================================================================
-- Channel Digest: Migration to PubSubHubbub + Edge Functions
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================================

-- 1. Create the websub_subscriptions table
-- Tracks PubSubHubbub subscription leases so we can renew them before expiry.
CREATE TABLE IF NOT EXISTS websub_subscriptions (
  channel_id TEXT PRIMARY KEY,
  topic_url TEXT NOT NULL,
  lease_expires_at TIMESTAMPTZ,
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'pending'
);

-- Only the service role should access this table
ALTER TABLE websub_subscriptions ENABLE ROW LEVEL SECURITY;

-- 2. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. Newsletter digest cron job (every 5 minutes — change the cron expression to adjust)
-- ┌───────────── minute (*/5 = every 5 minutes)
-- │ ┌─────────── hour
-- │ │ ┌───────── day of month
-- │ │ │ ┌─────── month
-- │ │ │ │ ┌───── day of week
-- │ │ │ │ │
-- * * * * *
--
-- To change the interval, modify the cron expression below:
--   Every 10 minutes:  '*/10 * * * *'
--   Every 30 minutes:  '*/30 * * * *'
--   Every hour:        '0 * * * *'
--   Every 6 hours:     '0 */6 * * *'
--   Daily at midnight: '0 0 * * *'

SELECT cron.schedule(
  'newsletter-digest',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://wduoislmkwucbfdpthii.supabase.co/functions/v1/newsletter-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 4. WebSub lease renewal cron job (daily at 3 AM UTC)
SELECT cron.schedule(
  'renew-websub',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://wduoislmkwucbfdpthii.supabase.co/functions/v1/manage-websub',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"action": "renew"}'::jsonb
  );
  $$
);

-- ============================================================================
-- VERIFICATION: Run these queries to confirm everything was created correctly
-- ============================================================================
-- SELECT * FROM websub_subscriptions;        -- Should return empty
-- SELECT * FROM cron.job;                    -- Should show 2 jobs
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
