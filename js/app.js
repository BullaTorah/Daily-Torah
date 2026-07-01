let WORD_LOOKUP = {};
let LEXICON = {};
let FREQUENCY = {};
let GLOBAL_VERSES = [];
let suppressNextClick = false;

const DIFFICULTY_STEPS = [0, 100, 200, 300, 400, 500, 1000, 2000, 3000];

/* ---------------- FETCH ---------------- */

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

  if (word && prefixes.includes(word[0])) {
    const candidate = word.slice(1);
    if (candidate.length >= 3) return candidate;
  }

  return word;
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

/* ---------------- RENDER HEBREW ---------------- */

function renderHebrew(text) {
  const container = document.createElement("span");

  // 🔥 CRITICAL FIX: ensure string always
  const safeText = String(text ?? "");

  const level = Number(window.DIFFICULTY || 0);

  const parts = safeText
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
    el.textContent = raw;
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

function snap(val) {
  return DIFFICULTY_STEPS.reduce((a, b) =>
    Math.abs(a - val) < Math.abs(b - val) ? a : b
  );
}

function getValue(x) {
  const rect = bar.getBoundingClientRect();
  const pct = (x - rect.left) / rect.width;

  const min = DIFFICULTY_STEPS[0];
  const max = DIFFICULTY_STEPS.at(-1);

  const raw = min + pct * (max - min);

  return snap(raw);
}

function setDifficulty(val) {
  window.DIFFICULTY = val;

  const min = DIFFICULTY_STEPS[0];
  const max = DIFFICULTY_STEPS.at(-1);

  knob.style.left = `${((val - min) / (max - min)) * 100}%`;

  document.getElementById("content").innerHTML = "";
  render(window.TITLE, GLOBAL_VERSES);
}

/* ---------------- DRAG ---------------- */

let dragging = false;

knob.addEventListener("mousedown", () => dragging = true);

document.addEventListener("mousemove", (e) => {
  if (!dragging) return;

  const rect = bar.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;

  knob.style.left = `${pct * 100}%`;
});

document.addEventListener("mouseup", (e) => {
  if (!dragging) return;
  dragging = false;
  setDifficulty(getValue(e.clientX));
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
    en.textContent = v.en;

    verse.appendChild(he);
    verse.appendChild(en);
    content.appendChild(verse);
  });
}

/* ---------------- CLICK POPUP ---------------- */

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

  GLOBAL_VERSES = data.he.map((h, i) => ({
    he: h,
    en: data.text?.[i] || ""
  }));

  window.TITLE = parsha.displayValue.en;

  window.DIFFICULTY = 0;

  setDifficulty(0);
  render(window.TITLE, GLOBAL_VERSES);
})();
