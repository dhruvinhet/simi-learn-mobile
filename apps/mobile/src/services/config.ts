export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "",
  revenueCatAndroidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim() ?? "",
  oneSignalAppId: process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID?.trim() ?? "",
  billingMode: process.env.EXPO_PUBLIC_GALAXY_BILLING_MODE ?? "TEST",
  fixtureMode: process.env.EXPO_PUBLIC_USE_FIXTURES === "true",
};

export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);

