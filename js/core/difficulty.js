export const DIFFICULTY_STEPS = [
  { label: "Beginner", value: 0 },
  { label: "Easy", value: 200 },
  { label: "Hard", value: 500 },
  { label: "Advanced", value: 999999 }
];

export function shouldHideWord(rank, level) {
  if (level === 0) return false;
  return rank <= level;
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
