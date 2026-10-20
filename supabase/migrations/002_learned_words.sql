-- Learned words + Got-it practice counts (v2)
-- Run in Supabase SQL Editor after 001_user_profiles.sql.

-- ---------------------------------------------------------------------------
-- Track cumulative "Got it" taps on bank words
-- ---------------------------------------------------------------------------

alter table word_bank_items
  add column if not exists got_it_count integer not null default 0;

drop policy if exists "Users update own word bank" on word_bank_items;
create policy "Users update own word bank"
  on word_bank_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant update on word_bank_items to authenticated;

-- ---------------------------------------------------------------------------
-- Words the user has learned (kept even if removed from the active bank)
-- ---------------------------------------------------------------------------

create table if not exists learned_words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  strongs text not null,
  lemma text,
  gloss text,
  surface_example text,
  learned_at timestamptz default now(),
  unique (user_id, strongs)
);

create index if not exists learned_words_user_learned_idx
  on learned_words (user_id, learned_at desc);

alter table learned_words enable row level security;

drop policy if exists "Users read own learned words" on learned_words;
drop policy if exists "Users insert own learned words" on learned_words;
drop policy if exists "Users update own learned words" on learned_words;
drop policy if exists "Users delete own learned words" on learned_words;

create policy "Users read own learned words"
  on learned_words for select
  using (auth.uid() = user_id);

create policy "Users insert own learned words"
  on learned_words for insert
  with check (auth.uid() = user_id);

create policy "Users update own learned words"
  on learned_words for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own learned words"
  on learned_words for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on learned_words to authenticated;
