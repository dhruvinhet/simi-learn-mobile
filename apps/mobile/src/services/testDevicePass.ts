import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const key = "simi.qaDevicePass.v1";

export async function testDevicePass(): Promise<string | null> {
  if (!supabase) return null;
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    const pass = JSON.parse(raw) as { userId?: string; token?: string };
    if (!/^[a-f0-9]{64}$/.test(pass.token ?? "")) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id === pass.userId ? pass.token! : null;
  } catch {
    return null;
  }
}
