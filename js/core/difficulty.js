export const DIFFICULTY_STEPS = [
  { label: "Beginner", value: 0 },
  { label: "Novice", value: 200 },
  { label: "Reader", value: 500 },
  { label: "Advanced", value: 999999 }
];

/** Max frequency rank auto-seeded into Known Words after Find my level (Reader). */
export const PLACEMENT_KNOWN_SEED_MAX_RANK = 500;

/** Unique Strong's in TAHOT Torah frequency (Gen–Deu). Bar denominator. */
export const TORAH_STRONGS_TOTAL = 3340;

/**
 * Learned-count boundaries for the weighted bar (5 ticks → 4 equal visual sections).
 * Early bands need fewer words to fill a quarter of the bar.
 */
export const TORAH_PROGRESS_BOUNDARIES = [0, 200, 500, 1200, TORAH_STRONGS_TOTAL];

/** Section labels sit between the ticks (centered in each quarter). */
export const TORAH_PROGRESS_SECTIONS = [
  { label: "Beginner" },
  { label: "Novice" },
  { label: "Reader" },
  { label: "Advanced" }
];

export function shouldHideWord(rank, level) {
  if (level === 0) return false;
  return rank <= level;
}

/**
 * Map known-word count → bar fill %.
 * Four equal visual sections; word densities decrease across bands.
 */
export function learnedProgressPercent(learnedCount) {
  const n = Math.max(0, Number(learnedCount) || 0);
  const stops = TORAH_PROGRESS_BOUNDARIES;
  const last = stops.length - 1;
  if (n <= stops[0]) return 0;
  if (n >= stops[last]) return 100;

  for (let i = 0; i < last; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    if (n > b) continue;
    const segStart = (i / last) * 100;
    const segEnd = ((i + 1) / last) * 100;
    const span = b - a || 1;
    const t = (n - a) / span;
    return segStart + t * (segEnd - segStart);
  }

  return 100;
}

/** Tick position for boundary index (0…4) across 4 equal sections. */
export function progressTickPercent(index) {
  const last = TORAH_PROGRESS_BOUNDARIES.length - 1;
  if (last <= 0) return 0;
  return (Math.max(0, Math.min(last, index)) / last) * 100;
}

/** Center of section index (0…3) for labels between ticks. */
export function progressSectionPercent(index) {
  const sections = TORAH_PROGRESS_SECTIONS.length;
  if (sections <= 0) return 0;
  return ((Math.max(0, Math.min(sections - 1, index)) + 0.5) / sections) * 100;
}

export function snapDifficulty(percent) {
  const index = Math.round(percent * (DIFFICULTY_STEPS.length - 1));
  return DIFFICULTY_STEPS[index];
}

export function difficultyToPercent(value) {
  const index = DIFFICULTY_STEPS.findIndex((d) => d.value === value);
  if (index < 0) return 0;
  return index / (DIFFICULTY_STEPS.length - 1);
}

export function resolveStoredDifficulty(storedValue, defaultValue = 0) {
  const match = DIFFICULTY_STEPS.find((d) => d.value === storedValue);
  return match ? match.value : defaultValue;
}
