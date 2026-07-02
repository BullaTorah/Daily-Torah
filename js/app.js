let WORD_LOOKUP = {};
let LEXICON = {};
let FREQUENCY = {};
let GLOBAL_VERSES = [];
let suppressNextClick = false;

const DIFFICULTY_STEPS = [
  { label: "Beginner", value: 0 },
  { label: "Easy", value: 200 },
  { label: "Hard", value: 500 },
  { label: "Advanced", value: Infinity }
];

function layoutTicksEvenly() {
  const ticks = document.querySelectorAll(".tick");

  ticks.forEach((tick, i) => {
    tick.style.left =
      `${i / (DIFFICULTY_STEPS.length - 1) * 100}%`;

    tick.textContent = DIFFICULTY_STEPS[i].label;
  });
}

const loadJSON = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
  return res.json();
};

/* ---------------- NORMALIZATION ---------------- */

function normalize(w) {
  return (w || "")
    .normalize("NFKD")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/־/g, "")
    .replace(/[.,:;!?()\[\]"']/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function stripPrefixes(word) {
  const prefixes = ["ו","ב","ל","כ","מ","ה","ש"];
  if (prefixes.includes(word[0])) {
    const candidate = word.slice(1);
    if (candidate.length >= 3) return candidate;
  }
  return word;
}

function stripSefariaArtifacts(text) {
  if (!text) return "";

  return String(text)
    .replace(/<[^>]*>/g, "")
    .replace(/\b(Lit\.|Heb\.)[^.;—]*[.;—]?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripNiqqud(str) {
  return (str || "")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/\u05C0/g, "")
    .trim();
}

function toStrongId(id) {
  const match = String(id || "").match(/\d+/);
  return match ? match[0] : null;
}

/* ---------------- LOOKUP ---------------- */

function lookup(word) {
  const clean = normalize(word);

  let strongs = WORD_LOOKUP[clean];

  if (!strongs) {
    strongs = WORD_LOOKUP[stripPrefixes(clean)];
  }

  if (!strongs) {
    return { lemma: null, gloss: "Unknown word", strongs: null };
  }

  const entry =
    LEXICON[String(strongs)] ||
    LEXICON[String(strongs).replace(/^0+/, "")];

  return {
    strongs: toStrongId(strongs),
    lemma: entry?.lemma || null,
    gloss: entry?.gloss || "—"
  };
}

/* ---------------- CRITICAL FIX: FLATTEN VERSES ---------------- */

function normalizeVerses(data) {
  let he = data.he || [];
  let en = data.text || [];

  const verses = [];

  he.forEach((chapterHe, cIdx) => {
    const chapterEn = en[cIdx] || [];

    chapterHe.forEach((verseHe, vIdx) => {
      verses.push({
        label: verses.length + 1,
        he: stripSefariaArtifacts(verseHe),
        en: chapterEn[vIdx] || ""
      });
    });
  });

  return verses;
}

/* ---------------- RENDER HEBREW ---------------- */

function renderHebrew(text) {
  const container = document.createElement("span");

  const level = window.DIFFICULTY || 0;

  const cleaned = stripSefariaArtifacts(String(text || ""));

  const parts = cleaned
    .replace(/\s+/g, " ")
    .trim()
    .split(/[\s\u00A0־]+/);

  parts.forEach(raw => {
    if (!raw) return;

    const info = lookup(raw);

    const freq = FREQUENCY[String(info.strongs)] || null;
    const rank = freq?.rank ?? Infinity;

    const hide = level > 0 && rank > level;

    const el = document.createElement("span");
    el.className = "word";
    el.textContent = stripSefariaArtifacts(raw);
    el.dataset.word = raw;

    if (hide) el.classList.add("no-highlight");

    container.appendChild(el);
    container.appendChild(document.createTextNode(" "));
  });

  return container;
}

/* ---------------- POPUP ---------------- */

function showPopup(data, anchor) {
  const p = document.getElementById("popup");

  p.innerHTML = `
    <div><strong>${data.word}</strong></div>
    <div>${data.gloss}</div>
    ${data.lemma ? `<div>Lemma: ${data.lemma}</div>` : ""}
    ${data.strongs ? `<div>Strong’s: ${data.strongs}</div>` : ""}
  `;

  p.style.display = "block";

  const r = anchor.getBoundingClientRect();

  p.style.top = `${r.bottom + window.scrollY + 8}px`;
  p.style.left = `${r.left + window.scrollX}px`;
}

/* ---------------- SLIDER ---------------- */

const knob = document.getElementById("difficultyKnob");
const bar = document.getElementById("difficultyBar");

const min = DIFFICULTY_STEPS[0];
const max = DIFFICULTY_STEPS[DIFFICULTY_STEPS.length - 1];

function snap(val) {
  return DIFFICULTY_STEPS.reduce((a, b) =>
    Math.abs(a - val) < Math.abs(b - val) ? a : b
  );
}

function valueToPercent(val) {
  return (val - min) / (max - min);
}

function percentToValue(pct) {
  return snap(min + pct * (max - min));
}

function setKnobFromValue(val) {
  knob.style.left = `${valueToPercent(val) * 100}%`;
}

/* IMPORTANT: single source of truth */
function setDifficulty(val) {
  window.DIFFICULTY = val;

  const min = DIFFICULTY_STEPS[0];
  const max = DIFFICULTY_STEPS[DIFFICULTY_STEPS.length - 1];

  const percent = (val - min) / (max - min);
  knob.style.left = `${percent * 100}%`;

  document.getElementById("content").innerHTML = "";
  render(window.TITLE, GLOBAL_VERSES);
}

/* ---------------- DRAG ---------------- */

let dragging = false;

knob.addEventListener("mousedown", (e) => {
  dragging = true;
  e.preventDefault();
});

document.addEventListener("mousemove", (e) => {
  if (!dragging) return;

  const rect = bar.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

  // visual only while dragging (NO snapping yet)
  knob.style.left = `${pct * 100}%`;
});

document.addEventListener("mouseup", (e) => {
  if (!dragging) return;
  dragging = false;

  const rect = bar.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

  const val = percentToValue(pct);

  setDifficulty(val);
});

/* ---------------- RENDER ---------------- */

function render(title, verses) {
  document.getElementById("title").textContent = title;

  const content = document.getElementById("content");
  content.innerHTML = "";

  verses.forEach(v => {
    const verse = document.createElement("div");
    verse.className = "verse";

    const he = document.createElement("div");
    he.className = "hebrew";
    he.appendChild(renderHebrew(v.he));

    const en = document.createElement("div");
    en.className = "english";
    en.textContent = stripSefariaArtifacts(v.en);

    verse.appendChild(he);
    verse.appendChild(en);
    content.appendChild(verse);
  });
}


/* ---------------- POPUP CLICK HANDLER ---------------- */

document.getElementById("content").addEventListener("click", (e) => {
  const word = e.target.closest(".word");
  if (!word) return;

  const data = lookup(word.dataset.word);

  showPopup(
    {
      word: word.dataset.word,
      gloss: data.gloss,
      lemma: data.lemma,
      strongs: data.strongs
    },
    word
  );
});

/* ---------------- INIT ---------------- */

(async function init() {
  WORD_LOOKUP = await loadJSON("data/word-lookup.json");
  LEXICON = await loadJSON("data/gloss.json");
  FREQUENCY = await loadJSON("data/lemma-frequency.json");

  const calendar = await loadJSON("https://www.sefaria.org/api/calendars");

  const parsha = calendar.calendar_items.find(i => i.extraDetails?.aliyot);

  let aliyah = parsha.extraDetails.aliyot[0]
    .replace(/ /g, ".")
    .replace(/:/g, ".");

  const data = await fetch(
    `https://www.sefaria.org/api/texts/${aliyah}?context=0&pad=0`
  ).then(r => r.json());

  GLOBAL_VERSES = normalizeVerses(data);

  window.TITLE = parsha.displayValue.en;

// 1. render ticks FIRST
layoutTicksEvenly();

// 2. initialize slider position
setDifficulty(0);

// 3. render content
render(window.TITLE, GLOBAL_VERSES);

// 4. ensure ticks are correct after layout paint
window.addEventListener("load", () => {
  layoutTicksEvenly();
});

})(); // 🔴 THIS CLOSES init()
