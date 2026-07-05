import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LoginTarget } from "../types/auth";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY");
}

function createPortalClient(storageKey: string): SupabaseClient {
  return createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
    auth: {
      storageKey,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

/** 飯店員工入口（LINE / 飯店 Email） */
export const hotelSupabase = createPortalClient("glog-hotel-auth");

/** Manager 入口（Gmail / Manager Email） */
export const managerSupabase = createPortalClient("glog-manager-auth");

export function getSupabaseClient(target: LoginTarget): SupabaseClient {
  return target === "platform" ? managerSupabase : hotelSupabase;
}

/** 從 OAuth / magic link redirect 的 hash 建立 session，並清除 URL hash */
export async function consumeAuthHashSession(client: SupabaseClient) {
  const hash = window.location.hash;
  if (!hash || hash.length <= 1) return null;

  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;

  const { data, error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;

  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return data.session;
}
