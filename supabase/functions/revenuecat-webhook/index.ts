import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { json } from "../_shared/http.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ code: "method_not_allowed" }, 405);
  const expected = Deno.env.get("REVENUECAT_WEBHOOK_AUTH_TOKEN");
  const supplied = request.headers.get("Authorization");
  if (!expected || supplied !== `Bearer ${expected}`) return json({ code: "unauthorized" }, 401);
  try {
    const payload = await request.json();
    const event = payload?.event;
    const appUserId = event?.app_user_id;
    const eventId = event?.id;
    if (typeof appUserId !== "string" || typeof eventId !== "string") return json({ code: "invalid_event" }, 400);
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const { data: existing } = await admin.from("revenuecat_events").select("event_id").eq("event_id", eventId).maybeSingle();
    if (existing) return json({ accepted: true, duplicate: true });
    await admin.from("revenuecat_events").insert({ event_id: eventId, event_type: String(event.type ?? "UNKNOWN"), app_user_id: appUserId });
    const entitlementIds: string[] = Array.isArray(event.entitlement_ids) ? event.entitlement_ids : [];
    const active = ["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE", "TEMPORARY_ENTITLEMENT_GRANT"].includes(String(event.type));
    const expiresAt = event.expiration_at_ms ? new Date(Number(event.expiration_at_ms)).toISOString() : null;
    if (entitlementIds.includes("pro")) {
      await admin.from("entitlements").upsert({
        app_user_id: appUserId,
        entitlement_id: "pro",
        product_id: event.product_id ?? null,
        store: event.store ?? "GALAXY",
        active,
        expires_at: active ? expiresAt : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "app_user_id,entitlement_id" });
    }
    return json({ accepted: true });
  } catch (error) {
    console.error(error);
    return json({ code: "webhook_failed" }, 500);
  }
});
