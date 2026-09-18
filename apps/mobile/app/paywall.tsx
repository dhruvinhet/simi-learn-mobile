import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Body, Button, Card, Screen, Title } from "../src/components/Primitives";
import { purchasePro, restorePro } from "../src/services/purchases";
import { toAppError } from "../src/services/errors";
import { useApp } from "../src/state/AppContext";
import { colors, spacing } from "../src/theme";

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const app = useApp();
  const [busy, setBusy] = useState(false);

  const purchase = async () => {
    setBusy(true);
    try {
      const active = await purchasePro();
      if (active) {
        app.setPro(true);
        Alert.alert("Student Pro is active", "Your lesson allowance is ready.");
        router.back();
      }
    } catch (error) {
      Alert.alert("Purchase not completed", toAppError(error).message);
    } finally { setBusy(false); }
  };

  const restore = async () => {
    setBusy(true);
    try {
      const active = await restorePro();
      app.setPro(active);
      Alert.alert(active ? "Purchase restored" : "No active purchase found", active ? "Student Pro is active again." : "Use the Samsung account that made the purchase.");
    } catch (error) { Alert.alert("Restore failed", toAppError(error).message); }
    finally { setBusy(false); }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}>
        <Button label="Close" variant="quiet" onPress={() => router.back()} />
        <Text style={styles.kicker}>STUDENT PRO</Text>
        <Title>Keep learning visually.</Title>
        <Body muted>More hard ideas, the same careful visual and factual checks.</Body>
        <Card style={styles.offer}>
          <Text style={styles.price}>₹199<Text style={styles.period}> / month</Text></Text>
          <Body muted>Regional equivalent shown by Galaxy Store before purchase.</Body>
          {["30 generated lessons per billing period", "Offline replay of saved lessons", "Narration, captions and comprehension checks", "Cancel through Galaxy Store"].map((benefit) => <View key={benefit} style={styles.benefit}><Text style={styles.check}>✓</Text><Body style={styles.benefitCopy}>{benefit}</Body></View>)}
          <Button label="Start Student Pro" loading={busy} disabled={!app.purchasesConfigured} onPress={purchase} />
          {!app.purchasesConfigured && <Body muted style={styles.note}>Purchases become available in the configured Galaxy development build.</Body>}
        </Card>
        <Button label="Restore purchase" variant="quiet" disabled={busy || !app.purchasesConfigured} onPress={restore} />
        <Body muted style={styles.legal}>Payment is charged through Galaxy Store. Subscription renews until cancelled in your Samsung account. Lesson limits reset each billing period.</Body>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  kicker: { color: colors.cyan, fontWeight: "900", letterSpacing: 2 },
  offer: { gap: spacing.md },
  price: { color: colors.text, fontSize: 42, fontWeight: "900" },
  period: { color: colors.muted, fontSize: 16, fontWeight: "600" },
  benefit: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  check: { color: colors.green, fontSize: 20, fontWeight: "900" },
  benefitCopy: { flex: 1 },
  note: { textAlign: "center", fontSize: 12 },
  legal: { fontSize: 12, lineHeight: 18, textAlign: "center" },
});
