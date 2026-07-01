
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










