import { normalizeStrongs } from "./strongs.js";

let indexPromise = null;
let index = null;

async function loadIndex(loadJSON) {
  if (index) return index;
  if (!indexPromise) {
    indexPromise = loadJSON("data/tahot/strongs-verses.json")
      .then((data) => {
        index = data && typeof data === "object" ? data : {};
        return index;
      })
      .catch((err) => {
        indexPromise = null;
        throw err;
      });
  }
  return indexPromise;
}

export async function versesForStrongs(strongs, loadJSON) {
  const id = normalizeStrongs(strongs);
  if (!id) return [];
  const data = await loadIndex(loadJSON);
  const refs =
    data[id] ||
    data[id.replace(/^0+/, "")] ||
    data[id.padStart(4, "0")] ||
    null;
  return Array.isArray(refs) ? refs : [];
}
