-- Each campaign already has an operator allowlist, an exact ad-account binding,
-- and a bounded lifetime budget. Account-wide serialization made independently
-- bounded campaigns wait behind one another and could shorten their collection
-- windows, so concurrency is governed per campaign instead.
drop index if exists public.meta_ad_runs_one_live_per_account_idx;
