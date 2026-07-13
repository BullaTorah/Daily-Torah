# Supabase setup

One-time setup for user profiles, settings sync, and word bank.

## 1. Create project

1. Go to [supabase.com](https://supabase.com) and create a project.
2. Open **SQL Editor** and run [migrations/001_user_profiles.sql](migrations/001_user_profiles.sql).

## 2. Enable auth

1. **Authentication → Providers → Email**: enable Email.
2. Enable **Email + Password** (not magic link only).
3. For local testing, you can disable **Confirm email** under Email provider settings so new accounts can sign in immediately.
4. Optionally enable **Google** under Providers.

## 3. Site URLs

Under **Authentication → URL Configuration**, set:

| Setting | Value |
|---------|-------|
| Site URL | `https://bullatorah.github.io/Daily-Torah/` |
| Redirect URLs | `https://bullatorah.github.io/Daily-Torah/`, `http://127.0.0.1:9876`, `http://localhost:9876` |

## 4. App config

1. Copy `js/config.example.js` to `js/config.js`.
2. From **Project Settings → API**, paste:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`
3. Do **not** commit `js/config.js` (it is gitignored).

## 5. Local dev

```bash
python3 -m http.server 9876
# Open http://127.0.0.1:9876
```

Use **Create account** for first-time sign-up (first name + email + password). Returning users use **Sign in** with email + password only.

**Forgot password:** use the link on the sign-in form. The reset email redirects back to this app; after clicking the link you’ll be prompted to choose a new password.
