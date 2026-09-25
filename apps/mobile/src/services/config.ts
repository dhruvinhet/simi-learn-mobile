import Constants from "expo-constants";

const publicSetting = (value: string | undefined) => {
  const trimmed = value?.trim() ?? "";
  return /YOUR_|PLACEHOLDER/i.test(trimmed) ? "" : trimmed;
};

const explicitWorkerUrl = publicSetting(process.env.EXPO_PUBLIC_VIDEO_WORKER_URL);

function getCandidateWorkerUrls(): string[] {
  const candidates: string[] = [];
  if (explicitWorkerUrl) candidates.push(explicitWorkerUrl.replace(/\/$/, ""));

  // Extract host IP from Expo debugger/bundler hostUri (e.g. "192.168.1.18:8081" -> "192.168.1.18")
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    if (host && host !== "localhost" && host !== "127.0.0.1") {
      candidates.push(`http://${host}:8787`);
    }
  }

  // Always include standard local fallback
  if (!candidates.includes("http://127.0.0.1:8787")) candidates.push("http://127.0.0.1:8787");

  return candidates;
}

export const config = {
  supabaseUrl: publicSetting(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: publicSetting(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  revenueCatAndroidKey: publicSetting(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY),
  oneSignalAppId: publicSetting(process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID),
  billingMode: process.env.EXPO_PUBLIC_GALAXY_BILLING_MODE ?? "TEST",
  fixtureMode: process.env.EXPO_PUBLIC_USE_FIXTURES === "true",
  videoWorkerUrl: explicitWorkerUrl || "http://127.0.0.1:8787",
  videoWorkerCandidateUrls: getCandidateWorkerUrls(),
};

export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);


