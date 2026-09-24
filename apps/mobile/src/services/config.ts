const publicSetting = (value: string | undefined) => {
  const trimmed = value?.trim() ?? "";
  return /YOUR_|PLACEHOLDER/i.test(trimmed) ? "" : trimmed;
};

export const config = {
  supabaseUrl: publicSetting(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: publicSetting(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  revenueCatAndroidKey: publicSetting(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY),
  oneSignalAppId: publicSetting(process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID),
  billingMode: process.env.EXPO_PUBLIC_GALAXY_BILLING_MODE ?? "TEST",
  fixtureMode: process.env.EXPO_PUBLIC_USE_FIXTURES === "true",
};

export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);

