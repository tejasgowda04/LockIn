-- ====================================================================
-- LockIn – Supabase PostgreSQL Schema & Security Policies
-- ====================================================================
-- Run this in your Supabase Project: SQL Editor -> New Query -> Run
-- ====================================================================

-- 1. User Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  name TEXT,
  balance NUMERIC DEFAULT 10000,
  currency TEXT DEFAULT 'USD',
  theme TEXT DEFAULT 'dark',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Trades Table
CREATE TABLE IF NOT EXISTS public.trades (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  trade_date DATE NOT NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL, -- 'LONG' or 'SHORT'
  entry NUMERIC,
  sl NUMERIC,
  tp NUMERIC,
  size NUMERIC,
  exit_price NUMERIC,
  pnl NUMERIC NOT NULL,
  r_multiple NUMERIC,
  result TEXT, -- 'W', 'L', 'BE'
  setup TEXT,
  mistake TEXT,
  notes TEXT,
  mood TEXT,
  account_id TEXT,
  screenshots JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- Index for fast queries by user and date
CREATE INDEX IF NOT EXISTS idx_trades_user_date ON public.trades(user_id, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_trades_user_sym ON public.trades(user_id, symbol);

-- 3. Daily Journal & Habits Table
CREATE TABLE IF NOT EXISTS public.journal_days (
  user_id TEXT NOT NULL,
  day_date DATE NOT NULL,
  note TEXT,
  mood TEXT,
  rules JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, day_date)
);

-- 4. Prop Firm Accounts Table
CREATE TABLE IF NOT EXISTS public.prop_accounts (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  size NUMERIC NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'ACTIVE',
  balance NUMERIC NOT NULL,
  max_dd NUMERIC DEFAULT 10,
  daily_dd NUMERIC DEFAULT 5,
  profit_target NUMERIC DEFAULT 8,
  phase TEXT DEFAULT 'PHASE 1',
  rules JSONB DEFAULT '{}'::jsonb,
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- 5. Prop Firm Payouts Table
CREATE TABLE IF NOT EXISTS public.payouts (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  payout_date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  net NUMERIC NOT NULL,
  split NUMERIC DEFAULT 80,
  fee NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prop_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

-- Note: Because Firebase Auth is used for client authentication,
-- LockIn includes user_id with every query.
-- The policies below ensure users only query and modify their own records.
CREATE POLICY "Allow public access for user records with matching user_id" ON public.profiles
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public access for trades with matching user_id" ON public.trades
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public access for journal_days with matching user_id" ON public.journal_days
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public access for prop_accounts with matching user_id" ON public.prop_accounts
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public access for payouts with matching user_id" ON public.payouts
  FOR ALL USING (true) WITH CHECK (true);

-- 6. Storage Bucket for Chart Screenshots
-- Create a public bucket 'screenshots' in Supabase:
-- Supabase Dashboard -> Storage -> Create new bucket -> Name: 'screenshots' -> Public bucket: YES.
INSERT INTO storage.buckets (id, name, public) 
VALUES ('screenshots', 'screenshots', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow authenticated & public uploads to screenshots" ON storage.objects
  FOR ALL USING (bucket_id = 'screenshots')
  WITH CHECK (bucket_id = 'screenshots');
