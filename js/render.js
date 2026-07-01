
function renderHebrew(text) {
text = stripSefariaArtifacts(text);

  const container = document.createElement("span");

  const level = Number.isFinite(window.DIFFICULTY)
  ? window.DIFFICULTY
  : 0;

text = stripSefariaArtifacts(String(text || ""));
text = text.replace(/<[^>]*>/g, "");
text = text.replace(/&thinsp;|&nbsp;|&amp;|&lt;|&gt;/g, " ");
text = text.replace(/[\u0591-\u05AF]/g, "");

text.split(/[\s\u00A0־]+/).forEach(raw => {
if (!raw || raw === "׀") return;
    const rawNormalized = stripNiqqud(normalize(raw));
    const stripped = stripPrefixes(rawNormalized);

const info = lookup(raw);
const strongId = normalizeStrongId(info?.strongs);
const freq = FREQUENCY[String(strongId)] || FREQUENCY[Number(strongId)] || null;
const rank = freq?.rank ?? Infinity;

console.log("RANK TRACE:", {
  raw,
  strongId,
  rank,
  count: freq?.count
});

if (strongId) {
  console.log("STRONGS TEST:", raw, "=>", strongId);
}


    let hideUnderline = level === 0 ? false : rank > level;


    const el = document.createElement("span");
    el.className = "word";
    el.textContent = stripSefariaArtifacts(raw);
    el.dataset.word = raw;

    if (hideUnderline) {
      el.classList.add("no-highlight");
    }

    

    

    container.appendChild(el);
    container.appendChild(document.createTextNode(" "));
  });

  return container;
}


function normalizeVerses(data) {
  let he = data.he || [];
  let en = data.text || [];

  // ensure arrays
  if (!Array.isArray(he)) he = [he];
  if (!Array.isArray(en)) en = [en];

  const verses = [];

  he.forEach((chapterHe, chapterIndex) => {
    const chapterEn = en[chapterIndex] || [];

    chapterHe.forEach((verseHe, verseIndex) => {
      const verseEn = chapterEn[verseIndex] || "";

      verses.push({
        label: verses.length + 1,
        he: stripSefariaArtifacts(String(verseHe)),
        en: cleanEnglish(String(verseEn))
      });
    });
  });

  return verses;
}


function cleanEnglish(text) {
  if (!text) return "";

  if (Array.isArray(text)) {
    text = text.join(" ");
  }

  text = String(text);

  return text
    // 1. remove HTML
    .replace(/<[^>]*>/g, "")

    // 2. remove full footnote sentences
    .replace(/\b(Lit\.|Heb\.)[^.;—]*[.;—]?/g, "")

    // 3. FIX: remove glued footnote prefixes inside words (bdescendants → descendants)
    .replace(/([a-z])([a-z]{2,})(?=[A-Z\u0590-\u05FF])/g, (m, a, b) => {
      // drop tiny prefixes like "b" or "a"
      if (a.length === 1) return b;
      return m;
    })

    // 4. FIX: catch missing-space insertions between real words
    .replace(/([a-z])([A-Z][a-z]+)/g, "$1 $2")

    // 5. FIX: remove duplicated clause injection like "abetook"
    .replace(/\b([a-z])([A-Z][a-z]+)/g, "$2")

    // 6. normalize whitespace
    .replace(/\s+/g, " ")
    .trim();
}







