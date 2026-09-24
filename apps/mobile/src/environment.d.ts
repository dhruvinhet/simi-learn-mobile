declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?: string;
    EXPO_PUBLIC_ONESIGNAL_APP_ID?: string;
    EXPO_PUBLIC_ONESIGNAL_MODE?: "development" | "production";
    EXPO_PUBLIC_GALAXY_BILLING_MODE?: "TEST" | "PRODUCTION" | "ALWAYS_FAIL";
    EXPO_PUBLIC_USE_FIXTURES?: string;
  }
}
