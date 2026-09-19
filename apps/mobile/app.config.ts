import type { ExpoConfig } from "expo/config";

const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();

const config: ExpoConfig = {
  name: "Simi Learn",
  slug: "simi-learn",
  scheme: "similearn",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#07111F",
  },
  android: {
    package: "com.simi.visuallearn",
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#07111F",
    },
    permissions: ["com.samsung.android.iap.permission.BILLING"],
  },
  plugins: [["onesignal-expo-plugin", { mode: process.env.EXPO_PUBLIC_ONESIGNAL_MODE === "production" ? "production" : "development" }], "expo-router", "expo-dev-client"],
  experiments: { typedRoutes: true },
  runtimeVersion: { policy: "fingerprint" },
  extra: easProjectId ? { eas: { projectId: easProjectId } } : {},
};

export default config;
