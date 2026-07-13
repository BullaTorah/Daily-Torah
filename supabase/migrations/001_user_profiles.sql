-- User profiles, synced settings, and word bank (v1)
-- Run in Supabase SQL Editor after creating a project.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now()
);

create table if not exists user_settings (
  user_id uuid primary key references profiles(id) on delete cascade,
  difficulty smallint not null default 0,
  diaspora boolean not null default true,
  lexicon_mode text not null default 'tahot',
  aliyah_override smallint,
  updated_at timestamptz default now()
);

create table if not exists word_bank_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  strongs text not null,
  lemma text,
  gloss text,
  surface_example text,
  added_at timestamptz default now(),
  unique (user_id, strongs)
);

create index if not exists word_bank_items_user_added_idx
  on word_bank_items (user_id, added_at desc);

-- ---------------------------------------------------------------------------
-- Auto-create profile + default settings on sign-up
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'first_name',
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1)
    )
  );

  insert into public.user_settings (user_id)
  values (new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table user_settings enable row level security;
alter table word_bank_items enable row level security;

create policy "Users read own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users update own profile"
  on profiles for update
  using (auth.uid() = id);

create policy "Users read own settings"
  on user_settings for select
  using (auth.uid() = user_id);

create policy "Users insert own settings"
  on user_settings for insert
  with check (auth.uid() = user_id);

create policy "Users update own settings"
  on user_settings for update
  using (auth.uid() = user_id);

create policy "Users read own word bank"
  on word_bank_items for select
  using (auth.uid() = user_id);

create policy "Users insert own word bank"
  on word_bank_items for insert
  with check (auth.uid() = user_id);

create policy "Users delete own word bank"
  on word_bank_items for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- API grants (required when "Expose tables via API" auto-grants are off)
-- ---------------------------------------------------------------------------

grant select, update on profiles to authenticated;
grant select, insert, update on user_settings to authenticated;
grant select, insert, delete on word_bank_items to authenticated;
