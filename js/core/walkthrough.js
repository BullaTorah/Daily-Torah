const STORAGE_KEY = "bulla-walkthrough-done";

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   body: string,
 *   mode?: 'card' | 'spotlight',
 *   anchor?: 'first-underline' | 'reading-controls' | 'difficulty-controls' | 'difficulty-progress' | 'popup-save' | 'home-start',
 *   nextLabel?: string,
 *   openPopup?: boolean,
 *   openExplain?: boolean,
 *   collapseExplain?: boolean,
 *   underlinePadBottom?: number,
 *   visual?: string
 * }} WalkthroughStep
 */

/** @type {WalkthroughStep[]} */
export const WALKTHROUGH_STEPS = [
  {
    id: "welcome",
    title: "Closer than it feels",
    body: "Most of the Torah is built from a few hundred common words. Bulla helps you find those words in the text, and keeps you reading as you grow.",
    mode: "card",
    nextLabel: "Show how it works"
  },
  {
    id: "controls",
    title: "Your reading",
    body: "Today’s Aliyah loads automatically. You can switch to a different section anytime, and choose Diaspora or Israel to match the calendar you follow.",
    mode: "spotlight",
    anchor: "reading-controls"
  },
  {
    id: "difficulty",
    title: "Your progress",
    body: "This bar tracks words you’ve marked as Known. The Beginner → Advanced labels are milestones—watch the bar grow as you learn.",
    mode: "spotlight",
    anchor: "difficulty-progress"
  },
  {
    id: "word-count",
    title: "Known words",
    body: "Every time you mark a word Known—on the page, in flashcards, or after Find my level—it counts here and drops its underline in the text.",
    mode: "spotlight",
    anchor: "difficulty-progress"
  },
  {
    id: "underlines",
    title: "The underline",
    body: "Words you haven’t marked Known yet are underlined. Once a word is Known, the underline goes away—so the page gets cleaner as you grow.",
    mode: "spotlight",
    anchor: "first-underline",
    underlinePadBottom: 10
  },
  {
    id: "tap",
    title: "The gloss",
    body: "Tap any word for a plain English gloss. You can look up every word—underlines only show what you haven’t marked Known yet.",
    mode: "spotlight",
    anchor: "first-underline",
    openPopup: true
  },
  {
    id: "explain",
    title: "Explain",
    body: "If you want to know more about this form of the word in context, tap Explain.",
    mode: "spotlight",
    anchor: "first-underline",
    openPopup: true,
    openExplain: true
  },
  {
    id: "wordlist",
    title: "Practice words",
    body: "Add words to Practice words, then drill them later in simple biblical sentences.",
    mode: "spotlight",
    anchor: "popup-save",
    openPopup: true,
    collapseExplain: true
  },
  {
    id: "start",
    title: "Get started",
    body: "You can find your level, read three verses, or open today’s portion. Sign in when you want your progress to stay with you.",
    mode: "spotlight",
    anchor: "home-start"
  }
];

export function isWalkthroughDone() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markWalkthroughDone() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function shouldAutoOpenWalkthrough(isLoggedIn) {
  return !isLoggedIn && !isWalkthroughDone();
}
