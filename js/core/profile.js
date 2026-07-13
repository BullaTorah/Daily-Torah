import { getSupabase, getUser } from "./auth.js";

let cachedFirstName = null;

export function toFirstName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0];
}

export async function loadUserProfile() {
  const supabase = getSupabase();
  const user = getUser();

  if (!supabase || !user) {
    cachedFirstName = null;
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;

  cachedFirstName = toFirstName(data?.display_name);
  return data;
}

export async function saveProfileFirstName(firstName) {
  const supabase = getSupabase();
  const user = getUser();
  const name = toFirstName(firstName);

  if (!supabase || !user || !name) return null;

  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: name })
    .eq("id", user.id)
    .select("display_name")
    .single();

  if (error) throw error;

  cachedFirstName = toFirstName(data?.display_name);
  return data;
}

export function getProfileFirstName(user = getUser()) {
  if (cachedFirstName) return cachedFirstName;

  if (!user) return "";

  const fromMeta =
    user.user_metadata?.first_name ||
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name;

  return toFirstName(fromMeta) || toFirstName(user.email?.split("@")[0]) || "";
}

export function clearProfileCache() {
  cachedFirstName = null;
}
