import { Platform } from "react-native";
import { config } from "./config";
import { AppError } from "./errors";

type PurchaseState = { configured: boolean; isPro: boolean };
let configured = false;

export async function configurePurchases(appUserId?: string): Promise<PurchaseState> {
  if (Platform.OS !== "android" || !config.revenueCatAndroidKey) return { configured: false, isPro: false };
  try {
    const Purchases = require("react-native-purchases").default;
    if (!configured) {
      const { GALAXY_BILLING_MODE } = require("react-native-purchases-store-galaxy");
      const mode = GALAXY_BILLING_MODE[config.billingMode] ?? GALAXY_BILLING_MODE.TEST;
      Purchases.configure({ apiKey: config.revenueCatAndroidKey, appUserID: appUserId, store: "GALAXY", galaxyBillingMode: mode });
      configured = true;
    } else if (appUserId) {
      await Purchases.logIn(appUserId);
    }
    const info = await Purchases.getCustomerInfo();
    return { configured: true, isPro: Boolean(info.entitlements.active.pro) };
  } catch (error) {
    console.warn("RevenueCat initialization failed", error);
    return { configured: false, isPro: false };
  }
}

export async function identifyPurchasesUser(appUserId: string): Promise<void> {
  if (!configured) {
    await configurePurchases(appUserId);
    return;
  }
  const Purchases = require("react-native-purchases").default;
  await Purchases.logIn(appUserId);
}

export async function purchasePro(): Promise<boolean> {
  try {
    const Purchases = require("react-native-purchases").default;
    const offerings = await Purchases.getOfferings();
    const monthly = offerings.current?.monthly ?? offerings.current?.availablePackages?.[0];
    if (!monthly) throw new AppError("purchase", "Student Pro is not available in this store build.");
    const result = await Purchases.purchasePackage(monthly);
    return Boolean(result.customerInfo.entitlements.active.pro);
  } catch (error) {
    if ((error as { userCancelled?: boolean }).userCancelled) return false;
    if (error instanceof AppError) throw error;
    throw new AppError("purchase", "The store could not complete this purchase. Nothing was charged.", true);
  }
}

export async function restorePro(): Promise<boolean> {
  try {
    const Purchases = require("react-native-purchases").default;
    const info = await Purchases.restorePurchases();
    return Boolean(info.entitlements.active.pro);
  } catch {
    throw new AppError("purchase", "Purchases could not be restored. Check the Samsung account on this device.", true);
  }
}
