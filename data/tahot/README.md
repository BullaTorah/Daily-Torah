# TAHOT Lexicon Data

Generated from [STEPBible TAHOT](https://github.com/STEPBible/STEPBible-Data) (Translators Amalgamated Hebrew OT, Gen–Deu), based on the Westminster Leningrad Codex with disambiguated Strong's numbers.

**License:** CC BY 4.0 — attribute [STEPBible](https://www.stepbible.org) and the [Open Scriptures Hebrew Bible](https://github.com/openscriptures/morphhb) project.

## Usage

**Legacy (default):** open the app normally.

**TAHOT mode:** add `?lexicon=tahot` to the URL (saved in localStorage).

```
http://127.0.0.1:9876/?lexicon=tahot
```

Legacy mode remains available via `?lexicon=legacy`.

## Files

| File | Description |
|------|-------------|
| `torah-verses.json` | Full Torah verse index (all books) |
| `books/*.json` | Per-book shards loaded by the app |
| `frequency.json` | Corpus frequency ranks derived from Torah tokens |
| `alignment-report.json` | Build statistics and sample validations |

## Regenerate

```bash
npm run build:tahot
```

Source file: `vendor/tahot-gen-deu.txt` (downloaded automatically if missing).

## Usage (Phase 2)

Enable TAHOT lookup with `?lexicon=tahot` (persists in localStorage). Default is legacy.

Runtime modules:
- `js/core/lookup-tahot.js` — verse-level TAHOT resolution
- `js/core/lexicon.js` — facade (`legacy` | `tahot`)
- `js/core/tahot-align.js` — Sefaria token alignment
