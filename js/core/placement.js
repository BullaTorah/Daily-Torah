import { DIFFICULTY_STEPS } from "./difficulty.js";

const STORAGE_DONE = "bulla.placementDone";
const STORAGE_LEVEL = "bulla.placementLevel";

/** Always ask this many words (UI: "Word N of 8"). */
export const PLACEMENT_TOTAL = 8;

/** Questions used to decide whether to advance from a band. */
const QUESTIONS_PER_STAGE = 2;

/** Two wrongs in a stage → stay on that band for the rest; do not advance. */
const MAX_WRONG_PER_STAGE = 2;

/**
 * Hand-checked pool only — prompts and distractors both come from here.
 * stage 0 = common … 3 = high (rarer).
 */
const PLACEMENT_WORDS = [
  // Common (8–25)
  { stage: 0, strongs: "0559", lemma: "אָמַר", gloss: "to say" },
  { stage: 0, strongs: "1961", lemma: "הָיָה", gloss: "to be" },
  { stage: 0, strongs: "6213", lemma: "עָשָׂה", gloss: "to do" },
  { stage: 0, strongs: "0776", lemma: "אֶרֶץ", gloss: "land" },
  { stage: 0, strongs: "3117", lemma: "יוֹם", gloss: "day" },
  { stage: 0, strongs: "5414", lemma: "נָתַן", gloss: "to give" },
  { stage: 0, strongs: "0935", lemma: "בּוֹא", gloss: "to come" },
  { stage: 0, strongs: "1696", lemma: "דָבַר", gloss: "to speak" },
  // Mid (90–160)
  { stage: 1, strongs: "1818", lemma: "דָּם", gloss: "blood" },
  { stage: 1, strongs: "5650", lemma: "עֶבֶד", gloss: "servant" },
  { stage: 1, strongs: "2022", lemma: "הַר", gloss: "mountain" },
  { stage: 1, strongs: "2091", lemma: "זָהָב", gloss: "gold" },
  // Mid-high (upper end)
  { stage: 2, strongs: "5715", lemma: "עֵדוּת", gloss: "testimony" },
  { stage: 2, strongs: "0241", lemma: "אֹזֶן", gloss: "ear" },
  { stage: 2, strongs: "6918", lemma: "קָדוֹשׁ", gloss: "holy" },
  { stage: 2, strongs: "2803", lemma: "חָשַׁב", gloss: "to think" },
  // High (upper end)
  { stage: 3, strongs: "7323", lemma: "רוּץ", gloss: "to run" },
  { stage: 3, strongs: "1692", lemma: "דָּבַק", gloss: "to cling" },
  { stage: 3, strongs: "5193", lemma: "נָטַע", gloss: "to plant" },
  { stage: 3, strongs: "3556", lemma: "כּוֹכָב", gloss: "star" }
];

const STAGE_COUNT = 4;

/** Final level from how many stages were passed (0…4). */
const LEVEL_BY_STAGES_PASSED = [
  0, // Beginner — never cleared the common band
  200, // Novice
  500, // Reader
  500, // Reader — cleared mid-high but not the rarest
  999999 // Advanced
];

let catalog = [];

/**
 * Load the curated placement catalog.
 * Frequency/gloss args are ignored (kept for call-site compatibility).
 */
export function initPlacementCatalog() {
  catalog = PLACEMENT_WORDS.map((w) => ({ ...w }));
  return catalog.length;
}

function poolForStage(stageIndex, exclude = new Set()) {
  return catalog.filter(
    (w) => w.stage === stageIndex && !exclude.has(w.strongs)
  );
}

function pickRandom(list) {
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function buildChoices(correct) {
  const distractors = [];
  const usedGloss = new Set([correct.gloss.toLowerCase()]);
  const sameStage = catalog.filter(
    (w) => w.stage === correct.stage && w.strongs !== correct.strongs
  );
  const anyOther = catalog.filter((w) => w.strongs !== correct.strongs);

  let attempts = 0;
  while (distractors.length < 3 && attempts < 80) {
    attempts += 1;
    const pool =
      distractors.length < 2 && sameStage.length ? sameStage : anyOther;
    const d = pickRandom(pool);
    if (!d) break;
    const key = d.gloss.toLowerCase();
    if (usedGloss.has(key)) continue;
    usedGloss.add(key);
    distractors.push(d);
  }

  const options = [
    { gloss: correct.gloss, correct: true },
    ...distractors.slice(0, 3).map((d) => ({ gloss: d.gloss, correct: false }))
  ];

  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  return options;
}

function makeQuestion(stageIndex, used) {
  const pool = poolForStage(stageIndex, used);
  const word =
    pickRandom(pool) || pickRandom(poolForStage(stageIndex, new Set()));
  if (!word) return null;
  used.add(word.strongs);
  return {
    stageIndex,
    strongs: word.strongs,
    lemma: word.lemma,
    gloss: word.gloss,
    choices: buildChoices(word)
  };
}

function levelFromStagesPassed(stagesPassed) {
  const i = Math.max(0, Math.min(stagesPassed, LEVEL_BY_STAGES_PASSED.length - 1));
  return LEVEL_BY_STAGES_PASSED[i];
}

export function isPlacementDone() {
  try {
    return localStorage.getItem(STORAGE_DONE) === "1";
  } catch {
    return false;
  }
}

export function getStoredPlacementLevel() {
  try {
    const n = Number(localStorage.getItem(STORAGE_LEVEL));
    return DIFFICULTY_STEPS.some((s) => s.value === n) ? n : null;
  } catch {
    return null;
  }
}

export function markPlacementDone(levelValue) {
  try {
    localStorage.setItem(STORAGE_DONE, "1");
    localStorage.setItem(STORAGE_LEVEL, String(levelValue));
  } catch {
    /* ignore */
  }
}

export function levelLabel(value) {
  return DIFFICULTY_STEPS.find((s) => s.value === value)?.label || "Beginner";
}

/** Start a new adaptive placement run (always PLACEMENT_TOTAL questions). */
export function startPlacement() {
  if (!catalog.length) {
    initPlacementCatalog();
  }
  if (!catalog.length) {
    throw new Error("Placement catalog not ready");
  }
  const used = new Set();
  const question = makeQuestion(0, used);
  if (!question) {
    throw new Error("Could not build placement question");
  }
  return {
    stageIndex: 0,
    stageAsked: 0,
    stageWrong: 0,
    stagesPassed: 0,
    stuck: false,
    used,
    question,
    asked: 1,
    total: PLACEMENT_TOTAL,
    done: false,
    level: null
  };
}

/**
 * Apply an answer. choiceIndex is index into question.choices, or null for “I don’t know”.
 * Always continues until PLACEMENT_TOTAL answers; two wrongs in a stage block advance.
 */
export function answerPlacement(state, choiceIndex) {
  if (!state || state.done) return state;

  const choice =
    choiceIndex == null ? null : state.question?.choices?.[choiceIndex];
  const correct = Boolean(choice?.correct);

  let {
    stageIndex,
    stageAsked,
    stageWrong,
    stagesPassed,
    stuck
  } = state;

  stageAsked += 1;
  if (!correct) stageWrong += 1;
  if (stageWrong >= MAX_WRONG_PER_STAGE) stuck = true;

  const asked = state.asked;

  // Finished a stage window: decide advance (unless already stuck).
  if (!stuck && stageAsked >= QUESTIONS_PER_STAGE) {
    if (stageWrong < MAX_WRONG_PER_STAGE) {
      stagesPassed += 1;
      if (stageIndex < STAGE_COUNT - 1 && asked < PLACEMENT_TOTAL) {
        stageIndex += 1;
        stageAsked = 0;
        stageWrong = 0;
      }
    } else {
      stuck = true;
    }
  }

  if (asked >= PLACEMENT_TOTAL) {
    return {
      ...state,
      stageIndex,
      stageAsked,
      stageWrong,
      stagesPassed,
      stuck,
      done: true,
      level: levelFromStagesPassed(stagesPassed),
      question: null,
      lastCorrect: correct
    };
  }

  const question = makeQuestion(stageIndex, state.used);
  if (!question) {
    return {
      ...state,
      stageIndex,
      stageAsked,
      stageWrong,
      stagesPassed,
      stuck,
      done: true,
      level: levelFromStagesPassed(stagesPassed),
      question: null,
      lastCorrect: correct
    };
  }

  return {
    ...state,
    stageIndex,
    stageAsked,
    stageWrong,
    stagesPassed,
    stuck,
    question,
    asked: asked + 1,
    total: PLACEMENT_TOTAL,
    done: false,
    lastCorrect: correct
  };
}

export function placementCatalogSize() {
  return catalog.length;
}
