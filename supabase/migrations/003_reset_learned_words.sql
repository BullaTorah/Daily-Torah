-- Reset Known Words for all accounts (placement seed was over-crediting Advanced).
-- Users start at 0 until they take Find my level again or mark words known.

delete from public.learned_words;
