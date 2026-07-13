import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let supabase = null;
let session = null;
const listeners = new Set();

async function loadConfig() {
  try {
    return await import("../config.js");
  } catch {
    return await import("../config.example.js");
  }
}

export function isAuthConfigured() {
  return Boolean(supabase);
}

export function isLoggedIn() {
  return Boolean(session?.user);
}

export function getSession() {
  return session;
}

export function getUser() {
  return session?.user ?? null;
}

export function getSupabase() {
  return supabase;
}

export function onAuthStateChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(event = null) {
  listeners.forEach((listener) => {
    try {
      listener(session, event);
    } catch {
      /* ignore listener errors */
    }
  });
}

export async function initAuth() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = await loadConfig();

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }

  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
      flowType: "pkce"
    }
  });

  const { data } = await supabase.auth.getSession();
  session = data.session ?? null;

  supabase.auth.onAuthStateChange((event, nextSession) => {
    session = nextSession;
    notifyListeners(event);
  });

  return session;
}

export async function signInWithPassword({ email, password }) {
  if (!supabase) {
    throw new Error("Sign-in is not configured.");
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
}

export async function signUpWithPassword({ email, password, firstName }) {
  if (!supabase) {
    throw new Error("Sign-up is not configured.");
  }

  const name = String(firstName || "").trim();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: name
        ? { display_name: name, first_name: name }
        : undefined
    }
  });

  if (error) throw error;

  return {
    session: data.session,
    needsEmailConfirmation: !data.session && Boolean(data.user)
  };
}

export async function signOut() {
  if (!supabase) return;

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function getAppRedirectUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

export async function requestPasswordReset({ email }) {
  if (!supabase) {
    throw new Error("Sign-in is not configured.");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getAppRedirectUrl()
  });

  if (error) throw error;
}

export async function updatePassword({ password }) {
  if (!supabase) {
    throw new Error("Sign-in is not configured.");
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export function getUserDisplayName(user = getUser()) {
  if (!user) return "";

  const name =
    user.user_metadata?.first_name ||
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "Account";

  const first = String(name).trim().split(/\s+/)[0];
  return first || "Account";
}

export function getUserInitials(user = getUser()) {
  if (!user) return "";

  const name =
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "?";

  const parts = String(name).trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  return parts[0].slice(0, 2).toUpperCase();
}
