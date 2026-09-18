import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Body, Button, Screen, Title } from "../../src/components/Primitives";
import { identifyPurchasesUser } from "../../src/services/purchases";
import { supabase } from "../../src/services/supabase";
import { spacing } from "../../src/theme";

export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [message, setMessage] = useState("Confirming your secure link...");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!supabase || !code) {
        setMessage("This sign-in link is incomplete or has expired. Request a new one.");
        setReady(true);
        return;
      }
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.user) setMessage("This sign-in link could not be confirmed. Request a new one.");
      else {
        await identifyPurchasesUser(data.user.id);
        setMessage("You are signed in. Purchases and lesson allowance now follow this account.");
      }
      setReady(true);
    })();
  }, [code]);

  return <Screen><View style={styles.content}><Title>{ready ? "Welcome to Simi Learn." : "One moment..."}</Title><Body>{message}</Body>{ready && <Button label="Start learning" onPress={() => router.replace("/")} />}</View></Screen>;
}
const styles = StyleSheet.create({ content: { flex: 1, justifyContent: "center", padding: spacing.lg, gap: spacing.md } });
