import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LessonPlayer } from "../src/components/LessonPlayer";
import { Body, Button, Screen, Title } from "../src/components/Primitives";
import { ensureVideo, savedVideoUri } from "../src/services/videoApi";
import { useApp } from "../src/state/AppContext";
import { colors, spacing } from "../src/theme";

// Ordered steps that map to the ensureVideo status messages
const VIDEO_STEPS = [
  { label: "Preparing your video…", keywords: ["prepar", "start"] },
  { label: "Rendering scenes…", keywords: ["render", "encod", "generat", "creat"] },
  { label: "Finalising MP4…", keywords: ["final", "packag", "complet", "ready", "saving"] },
];

/** Map a free-form status message to a step index (0-based). */
function statusToStepIndex(message: string): number {
  const lower = message.toLowerCase();
  for (let i = VIDEO_STEPS.length - 1; i >= 0; i--) {
    const step = VIDEO_STEPS[i];
    if (step && step.keywords.some((kw) => lower.includes(kw))) {
      return i;
    }
  }
  return 0;
}

export default function LessonScreen() {
  const insets = useSafeAreaInsets();
  const { activeLesson } = useApp();
  const [uri, setUri] = useState<string | null>(() =>
    activeLesson ? savedVideoUri(activeLesson.lessonId) : null,
  );
  const [status, setStatus] = useState("Preparing your video…");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!activeLesson) return;
    let mounted = true;
    setUri(savedVideoUri(activeLesson.lessonId));
    setError(null);
    void ensureVideo(activeLesson, (message) => {
      if (mounted) setStatus(message);
    })
      .then((videoUri) => {
        if (mounted) setUri(videoUri);
      })
      .catch((reason) => {
        if (mounted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not create this video.",
          );
      });
    return () => {
      mounted = false;
    };
  }, [activeLesson?.lessonId, attempt]);

  if (!activeLesson)
    return (
      <Screen>
        <View style={styles.empty}>
          <Title>Lesson unavailable</Title>
          <Body muted>Open a saved lesson from your library.</Body>
          <Button label="Back to library" onPress={() => router.replace("/")} />
        </View>
      </Screen>
    );

  const activeStepIndex = statusToStepIndex(status);
  const durationLabel = `${activeLesson.estimatedSeconds ?? 60} SEC LESSON`;

  return (
    <Screen>
      {/* ── Back header ── */}
      <View
        style={[styles.backHeader, { paddingTop: insets.top + 8 }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {activeLesson.title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        {/* ── Eyebrow ── */}
        <Text style={styles.eyebrow}>
          YOUR VISUAL LESSON  ·  {durationLabel}
        </Text>
        <Title>{activeLesson.title}</Title>

        {/* ── States ── */}
        {uri ? (
          <LessonPlayer videoUri={uri} durationSeconds={activeLesson.estimatedSeconds} />
        ) : error ? (
          /* ── Error state ── */
          <View style={styles.state}>
            <Text style={styles.errorEmoji}>🎬</Text>
            <Title style={styles.errorTitle}>Video unavailable</Title>
            <Body muted style={styles.center}>
              {error}
            </Body>

            <Button
              label="Retry rendering"
              onPress={() => setAttempt((v) => v + 1)}
            />
            <Button
              label="Back to library"
              variant="secondary"
              onPress={() => router.replace("/")}
            />
          </View>
        ) : (
          /* ── Loading state ── */
          <View style={styles.state}>
            <ActivityIndicator color={colors.cyan} size="large" />

            {/* Multi-step progress indicator */}
            <View style={styles.stepsCard}>
              {VIDEO_STEPS.map((step, i) => (
                <View key={step.label} style={styles.stepRow}>
                  <View
                    style={[
                      styles.stepIndicator,
                      i < activeStepIndex && styles.stepDone,
                      i === activeStepIndex && styles.stepActive,
                    ]}
                  >
                    {i < activeStepIndex ? (
                      <Text style={styles.stepCheckText}>✓</Text>
                    ) : (
                      <Text style={styles.stepNumText}>{i + 1}</Text>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.stepLabel,
                      i === activeStepIndex && styles.stepLabelActive,
                      i < activeStepIndex && styles.stepLabelDone,
                    ]}
                  >
                    {step.label}
                  </Text>
                  {i < VIDEO_STEPS.length - 1 && (
                    <View
                      style={[
                        styles.stepConnector,
                        i < activeStepIndex && styles.stepConnectorDone,
                      ]}
                    />
                  )}
                </View>
              ))}
            </View>

            <Body muted style={styles.center}>
              {status}
            </Body>
            <Body muted style={styles.center}>
              Your lesson will start when the complete MP4 is ready.
            </Body>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // ── Back header ──
  backHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingRight: 8,
  },
  backArrow: {
    color: colors.cyan,
    fontSize: 26,
    lineHeight: 28,
    fontWeight: "300",
  },
  backLabel: {
    color: colors.cyan,
    fontSize: 15,
    fontWeight: "600",
  },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  headerSpacer: { width: 60 },

  // ── Content ──
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  eyebrow: {
    color: colors.cyan,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
  },

  // ── States ──
  state: {
    minHeight: 300,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
  },
  center: { textAlign: "center" },
  empty: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: "center",
    gap: spacing.md,
  },

  // Error state
  errorEmoji: {
    fontSize: 48,
    textAlign: "center",
    marginBottom: 4,
  },
  errorTitle: {
    textAlign: "center",
  },

  // Multi-step loading
  stepsCard: {
    backgroundColor: colors.panel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 0,
    width: "100%",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingBottom: 4,
    position: "relative",
  },
  stepIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.panelRaised,
    zIndex: 1,
  },
  stepActive: {
    borderColor: colors.cyan,
    backgroundColor: colors.cyanDark,
  },
  stepDone: {
    borderColor: colors.green,
    backgroundColor: "#1E3020",
  },
  stepNumText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  stepCheckText: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "700",
  },
  stepLabel: {
    flex: 1,
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
    paddingTop: 5,
  },
  stepLabelActive: {
    color: colors.text,
  },
  stepLabelDone: {
    color: colors.green,
  },
  stepConnector: {
    position: "absolute",
    left: 13,
    top: 30,
    width: 2,
    height: 22,
    backgroundColor: colors.border,
    borderRadius: 1,
  },
  stepConnectorDone: {
    backgroundColor: colors.green,
  },
});
