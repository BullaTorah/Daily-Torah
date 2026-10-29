-- Daily reading streak (additive). Apply when ready — does not wipe user data.
-- Credits when a signed-in user answers the end-of-reading question after
-- “Read three verses”.

alter table profiles
  add column if not exists reading_streak integer not null default 0;

alter table profiles
  add column if not exists reading_streak_on date;

comment on column profiles.reading_streak is
  'Consecutive local calendar days with a completed three-verse reading + feedback';

comment on column profiles.reading_streak_on is
  'Local calendar date (YYYY-MM-DD) of the last streak credit';
