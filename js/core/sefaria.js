import { stripSefariaArtifacts, cleanHebrewText } from "./lookup.js";

export function getAliyahIndexForToday(date = new Date()) {
  return date.getDay();
}

export function getAliyahOverrideFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("aliyah");
  if (raw === null) return null;

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return null;
  return value;
}

export function resolveAliyahIndex(aliyot, options = {}) {
  const { date = new Date(), queryOverride = null, storedOverride = null } = options;

  if (queryOverride !== null) {
    return Math.min(queryOverride - 1, aliyot.length - 1);
  }

  if (storedOverride !== null) {
    return Math.min(storedOverride - 1, aliyot.length - 1);
  }

  return Math.min(getAliyahIndexForToday(date), aliyot.length - 1);
}

export function formatAliyahRef(ref) {
  return String(ref || "")
    .replace(/ /g, ".")
    .replace(/:/g, ".");
}

export function formatAliyahDisplay(ref) {
  return String(ref || "").replace(/\./g, ":").replace(/-/g, "–");
}

export async function fetchCalendar(isDiaspora) {
  const diaspora = isDiaspora ? "1" : "0";
  const res = await fetch(
    `https://www.sefaria.org/api/calendars?diaspora=${diaspora}`
  );
  if (!res.ok) throw new Error(`Calendar fetch failed (${res.status})`);
  return res.json();
}

export async function fetchAliyahText(aliyahRef) {
  const formatted = formatAliyahRef(aliyahRef);
  const res = await fetch(
    `https://www.sefaria.org/api/texts/${formatted}?context=0&pad=0`
  );
  if (!res.ok) throw new Error(`Text fetch failed (${res.status})`);
  return res.json();
}

export function findParshaItem(calendar) {
  return calendar.calendar_items?.find((i) => i.extraDetails?.aliyot) || null;
}

function parseAliyahStartRef(ref) {
  const match = String(ref || "").match(/(\d+):(\d+)/);
  if (!match) return { chapter: 1, verse: 1 };
  return { chapter: Number(match[1]), verse: Number(match[2]) };
}

function isNestedChapters(chapters) {
  return (
    Array.isArray(chapters) &&
    chapters.length > 0 &&
    Array.isArray(chapters[0])
  );
}

export function normalizeVerses(data, aliyahRef) {
  const start = parseAliyahStartRef(aliyahRef);
  const he = data.he || [];
  const en = data.text || [];
  const verses = [];

  const chaptersHe = isNestedChapters(he) ? he : [he];
  const chaptersEn = isNestedChapters(en) ? en : [en];

  chaptersHe.forEach((chapterHe, cIdx) => {
    const chapterEn = chaptersEn[cIdx] || [];

    chapterHe.forEach((verseHe, vIdx) => {
      const verseNum = cIdx === 0 ? start.verse + vIdx : vIdx + 1;

      verses.push({
        label: verseNum,
        he: cleanHebrewText(verseHe),
        en: chapterEn[vIdx] || ""
      });
    });
  });

  return verses;
}
