import { OneSignal } from "react-native-onesignal";
import { config } from "./config";

let initialized = false;

export async function initializeNotifications(appUserId: string): Promise<boolean> {
  const appId = config.oneSignalAppId;
  if (!appId) return false;
  if (!initialized) {
    OneSignal.initialize(appId);
    initialized = true;
  }
  OneSignal.login(appUserId);
  return true;
}

export async function requestStudyReminders(): Promise<"enabled" | "denied" | "unconfigured"> {
  if (!initialized) return "unconfigured";
  const allowed = await OneSignal.Notifications.requestPermission(false);
  return allowed ? "enabled" : "denied";
}
