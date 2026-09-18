import { router } from "expo-router";
import { useState } from "react";
import * as Linking from "expo-linking";
import { Alert, ScrollView, StyleSheet, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Body, Button, Card, Screen, Title } from "../src/components/Primitives";
import { supabase } from "../src/services/supabase";
import { colors, radii, spacing } from "../src/theme";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const sendLink = async () => {
    if (!supabase) {
      Alert.alert("Sign-in is not configured", "Guest mode remains available. Add the Supabase public values to enable sign-in.");
      return;
    }
    setBusy(true);
    const redirect = Linking.createURL("/auth/callback");
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirect, shouldCreateUser: true } });
    setBusy(false);
    if (error) Alert.alert("Email not sent", error.message);
    else Alert.alert("Check your email", "Open the secure Simi Learn link on this device.");
  };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}>
        <Button label="Back" variant="quiet" onPress={() => router.back()} />
        <Title>Save learning across devices.</Title>
        <Body muted>Sign in with a secure email link, or keep using Simi as a guest.</Body>
        <Card style={styles.form}>
          <Body>Email</Body>
          <TextInput accessibilityLabel="Email address" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.muted} style={styles.input} />
          <Button label="Email me a secure link" loading={busy} disabled={!email.includes("@")} onPress={sendLink} />
        </Card>
        <Button label="Continue as guest" variant="secondary" onPress={() => router.back()} />
        <Body muted style={styles.note}>Guest lessons stay only on this device. Simi does not ask for your school or age.</Body>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  form: { gap: spacing.md },
  input: { minHeight: 54, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised, color: colors.text, fontSize: 16, paddingHorizontal: spacing.md },
  note: { textAlign: "center", fontSize: 12 },
});
