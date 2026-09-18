import type { PropsWithChildren, ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";
import { colors, radii, spacing } from "../theme";

export function Screen({ children }: PropsWithChildren) {
  return <View style={styles.screen}>{children}</View>;
}

export function Title({ children, style }: PropsWithChildren<{ style?: TextStyle }>) {
  return <Text accessibilityRole="header" style={[styles.title, style]}>{children}</Text>;
}

export function Body({ children, muted = false, style }: PropsWithChildren<{ muted?: boolean; style?: TextStyle }>) {
  return <Text style={[styles.body, muted && styles.muted, style]}>{children}</Text>;
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  icon?: ReactNode;
  accessibilityHint?: string;
};

export function Button({ label, onPress, disabled, loading, variant = "primary", icon, accessibilityHint }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.button, styles[`button_${variant}`], pressed && styles.pressed, (disabled || loading) && styles.disabled]}
    >
      {loading ? <ActivityIndicator color={variant === "primary" ? colors.ink : colors.text} /> : icon}
      <Text style={[styles.buttonText, variant === "primary" && styles.buttonTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }} style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(0, Math.min(1, value)) * 100}%` }]} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  title: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: "800", letterSpacing: -0.7 },
  body: { color: colors.text, fontSize: 16, lineHeight: 24 },
  muted: { color: colors.muted },
  card: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.lg },
  button: { minHeight: 52, paddingHorizontal: spacing.lg, borderRadius: radii.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1 },
  button_primary: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  button_secondary: { backgroundColor: colors.panelRaised, borderColor: colors.border },
  button_quiet: { backgroundColor: "transparent", borderColor: "transparent" },
  button_danger: { backgroundColor: "#381A24", borderColor: colors.red },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: "700" },
  buttonTextPrimary: { color: colors.ink },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.42 },
  progressTrack: { height: 6, borderRadius: radii.pill, backgroundColor: colors.panelRaised, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: radii.pill, backgroundColor: colors.cyan },
});

