# Architecture Roadmap

This document outlines the path from the current vanilla MVP to auth, payments, and a native iPhone app.

## Current Structure (Phase 1)

```
js/
  app.js              # Entry point — wires modules and init
  core/
    lookup.js         # Hebrew normalization, Strong's lookup, Sefaria cleanup
    sefaria.js        # Calendar fetch, aliyah selection, verse flattening
    difficulty.js     # Difficulty steps and hide-by-frequency logic
    storage.js        # localStorage preferences
  ui/
    render.js         # DOM rendering, loading/error states
    slider.js         # Pointer-based difficulty slider
    popup.js          # Word definition popup
data/
  word-lookup.json    # Surface form → Strong's number (legacy)
  gloss.json          # Strong's → lemma, gloss, xlit, pron (legacy)
  lemma-frequency.json
  tahot/              # Generated from STEPBible TAHOT (see npm run build:tahot)
    torah-verses.json
    books/              # Per-book shards (loaded on demand)
    frequency.json
    alignment-report.json
js/core/
    lookup.js         # Legacy runtime lookup
    lookup-tahot.js   # TAHOT verse-level lookup
    lexicon.js        # Mode facade (?lexicon=tahot|legacy)
    tahot-align.js    # Sefaria ↔ TAHOT token alignment
```

The `core/` modules contain pure logic with no DOM dependencies. They can be extracted into a shared package without changes to their APIs.

## Phase 2: Core Extraction

Before adding auth or mobile:

1. Move `js/core/` into `packages/core/` (or keep path, add `package.json` with `"type": "module"`).
2. Convert core modules to TypeScript (`packages/core/src/*.ts`).
3. Add unit tests for `lookup`, `resolveAliyahIndex`, `shouldHideWord`, and `normalizeVerses`.
4. Keep the web UI as static files importing from the built core package, or use Vite as a thin bundler.

**Do not** add React or a full framework until you are ready to migrate the entire UI.

## Phase 3: Auth and Payments

```
Web App ──┐
          ├──► Thin Backend API ──► Supabase Auth (or Clerk)
iOS App ──┘                         Postgres (prefs, progress)
                                    Stripe (subscriptions)
          ──► Sefaria public API (client-side, unchanged)
```

- **Auth:** Supabase Auth with email + Apple Sign-In (required for iOS).
- **Payments:** Stripe Checkout + Customer Portal; webhooks update `subscription_status`.
- **Backend scope:** User preferences, reading progress, subscription checks only. Lexicon JSON stays static on CDN or bundled.
- **Example gating:** Free = Beginner/Easy; paid = Hard/Advanced + cross-device sync.

## Phase 4: iPhone App (Recommended: Expo + Shared Core)

| Approach | When to use |
|----------|-------------|
| **Expo + shared TS core** | Recommended. Reuse lookup, frequency, and Sefaria logic. One language for web + iOS (+ Android later). |
| **Capacitor WebView** | Fastest to App Store if Mobile Safari UX is already good. Weaker Hebrew typography and native feel. |
| **Native SwiftUI** | Best iOS UX, but duplicates all lexicon/tokenization logic. Slowest path. |

### Migration steps

1. Validate Phase 1 UX in Mobile Safari (touch slider, popup, Hebrew rendering).
2. Extract and convert `packages/core` to TypeScript.
3. Rebuild web UI with Vite + React (optional; can skip if targeting Expo-only).
4. Create Expo app importing `@torah-reader/core`:
   - Native `Text` with RTL for Hebrew verses
   - Reuse Sefaria fetch + word-tap popup pattern
   - Apple Sign-In + Stripe via Expo modules

## Data That Stays Client-Side

- `word-lookup.json`, `gloss.json`, `lemma-frequency.json` — large static assets, no server needed
- Sefaria calendar and text API calls — public, no API key required

## Data That Needs a Backend (Future)

- User accounts and sessions
- Saved difficulty, diaspora, and aliyah preferences (synced)
- Reading history and bookmarks
- Subscription status
