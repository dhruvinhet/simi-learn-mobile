import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type User } from "@supabase/supabase-js";
import { config, isSupabaseConfigured } from "./config";
import { AppError } from "./errors";

export const supabase = isSupabaseConfigured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export async function ensureAuthenticatedUser(): Promise<User | null> {
  if (!supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user) return sessionData.session.user;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) throw new AppError("auth", "Guest sign-in is temporarily unavailable. Please try again.", true);
  return data.user;
}
