import type { AudienceLevel, GenerateLessonRequest, Lesson } from "@simi/lesson-schema";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Body, Button, Screen, Title } from "../src/components/Primitives";
import { generateLesson } from "../src/services/lessonApi";
import { config } from "../src/services/config";
import { toAppError } from "../src/services/errors";
import { getGuestUsage, incrementGuestUsage } from "../src/services/storage";
import { testDevicePass } from "../src/services/testDevicePass";
import { useApp } from "../src/state/AppContext";
import { colors, spacing } from "../src/theme";

type Tab = "create" | "library" | "account";

const levels: { value: AudienceLevel; label: string }[] = [
  { value: "middle-school", label: "Middle school" },
  { value: "high-school", label: "High school" },
  { value: "college", label: "College" },
];
const durations = [45, 60, 90] as const;
const newRequestId = () =>
  `lesson-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const TOPIC_TAGS = ["Physics", "History", "Biology", "Economics", "Computer Science"];

// Loading steps shown during lesson generation
const LOADING_STEPS = [
  "Planning visual story…",
  "Drafting diagrams…",
  "Reviewing accuracy…",
];

/** 2-letter abbreviation from a lesson title for the library thumbnail */
function titleInitials(title: string): string {
  const words = title.trim().split(/\s+/);
  const a = words[0]?.[0] ?? "";
  const b = words[1]?.[0] ?? "";
  if (a && b) return (a + b).toUpperCase();
  return title.slice(0, 2).toUpperCase();
}

/** Deterministic background colour for library thumbnail tiles */
const THUMB_COLORS = [
  colors.cyanDark,
  "#2A2040",
  "#2A3020",
  "#3A2820",
  "#1E2A40",
];
function thumbColor(index: number) {
  return THUMB_COLORS[index % THUMB_COLORS.length];
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const app = useApp();
  const [tab, setTab] = useState<Tab>("create");
  const [deviceAccess, setDeviceAccess] = useState(false);
  useEffect(() => {
    let active = true;
    if (app.ready) void testDevicePass().then((pass) => { if (active) setDeviceAccess(Boolean(pass)); });
    return () => { active = false; };
  }, [app.ready, tab]);
  const [topic, setTopic] = useState(
    config.fixtureMode ? "Why do planets orbit the Sun?" : "",
  );
  const [level, setLevel] = useState<AudienceLevel>("middle-school");
  const [duration, setDuration] = useState<45 | 60 | 90>(60);
  const [loading, setLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cycle through loading steps every 4 seconds
  useEffect(() => {
    if (loading) {
      setStepIndex(0);
      stepTimer.current = setInterval(() => {
        setStepIndex((i) => (i + 1) % LOADING_STEPS.length);
      }, 4000);
    } else {
      if (stepTimer.current) clearInterval(stepTimer.current);
    }
    return () => {
      if (stepTimer.current) clearInterval(stepTimer.current);
    };
  }, [loading]);

  const createLesson = async () => {
    const trimmed = topic.trim();
    if (trimmed.length < 5) {
      Alert.alert(
        "Describe your topic",
        "Enter a question with at least five characters.",
      );
      return;
    }
    const devicePass = await testDevicePass();
    if (!config.fixtureMode && !app.isPro && !devicePass && (await getGuestUsage()) >= 3) {
      router.push("/paywall");
      return;
    }
    setLoading(true);
    const request: GenerateLessonRequest = {
      topic: trimmed,
      audienceLevel: level,
      durationSeconds: duration,
      locale: "en-IN",
      requestId: newRequestId(),
    };
    try {
      const lesson = await generateLesson(request);
      await app.addLesson(lesson);
      if (!config.fixtureMode && !app.isPro && !devicePass) await incrementGuestUsage();
      app.setActiveLesson(lesson);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push("/lesson");
    } catch (error) {
      const issue = toAppError(error);
      Alert.alert(
        "Could not create the lesson",
        issue.message,
        issue.retryable
          ? [
              { text: "Try again", onPress: createLesson },
              { text: "Cancel", style: "cancel" },
            ]
          : undefined,
      );
    } finally {
      setLoading(false);
    }
  };

  const openLesson = (lesson: Lesson) => {
    app.setActiveLesson(lesson);
    router.push("/lesson");
  };

  // Derive user initials from session (fallback to 'ME')
  const userInitials = "ME";

  return (
    <Screen>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 18,
            paddingBottom: insets.bottom + 120,
          },
        ]}
      >
        {/* ── HEADER ── */}
        <View style={styles.brand}>
          {/* Glow behind logo */}
          <View style={styles.logoGlow} />
          <Image source={require("../assets/mark.png")} style={styles.logo} />
          <Text style={styles.wordmark}>
            simi<Text style={styles.wordmarkPeriod}>.</Text>
          </Text>
          <View style={styles.brandSpacer} />
          {/* Avatar pill with initials */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open account"
            onPress={() => setTab("account")}
            style={styles.avatarPill}
          >
            <View style={styles.avatarDot} />
            <Text style={styles.avatarInitials}>{userInitials}</Text>
          </Pressable>
        </View>

        {/* ── CREATE TAB ── */}
        {tab === "create" && (
          <>
            <View style={styles.hero}>
              <Text style={styles.kicker}>VISUAL LEARNING</Text>
              <Title style={styles.heroTitle}>See the idea.</Title>
              {/* Static pulse indicator */}
              <View style={styles.pulseRow}>
                <View style={styles.pulseCore} />
                <View style={styles.pulseRing} />
                <Text style={styles.heroBody}>
                  Understand it in a narrated video.
                </Text>
              </View>
              <Body muted style={styles.heroSubBody}>
                Keep it for later, replay offline.
              </Body>

              {/* Topic tag chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tagScroll}
                contentContainerStyle={styles.tagRow}
              >
                {TOPIC_TAGS.map((tag) => (
                  <Pressable
                    key={tag}
                    onPress={() => setTopic(tag + " — ")}
                    style={styles.topicTag}
                  >
                    <Text style={styles.topicTagText}>{tag}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* ── FORM CARD ── */}
            <View style={styles.form}>
              {/* Three-dot indicator strip */}
              <View style={styles.dotStrip}>
                <View style={[styles.dot, { backgroundColor: colors.cyan }]} />
                <View style={[styles.dot, { backgroundColor: colors.amber }]} />
                <View style={[styles.dot, { backgroundColor: colors.violet }]} />
              </View>

              <Text style={styles.sectionLabel}>
                WHAT DO YOU WANT TO UNDERSTAND?
              </Text>
              <TextInput
                accessibilityLabel="Topic or question"
                multiline
                value={topic}
                editable={!config.fixtureMode && !loading}
                onChangeText={setTopic}
                placeholder="What do you want to understand?"
                placeholderTextColor={colors.muted}
                maxLength={240}
                style={styles.input}
              />

              {!config.fixtureMode && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.exampleScroll}
                  contentContainerStyle={styles.examples}
                >
                  {[
                    "Why do planets orbit?",
                    "What causes inflation?",
                    "How does recursion work?",
                  ].map((example) => (
                    <Pressable
                      key={example}
                      onPress={() => setTopic(example)}
                      style={styles.example}
                    >
                      <Text style={styles.exampleText}>{example}  ↗</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              <View style={styles.divider} />

              <Text style={styles.sectionLabel}>EXPLAIN IT FOR</Text>
              <View style={styles.levelRow}>
                {levels.map((item) => (
                  <Pressable
                    key={item.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: level === item.value }}
                    onPress={() => setLevel(item.value)}
                    style={[
                      styles.level,
                      level === item.value && styles.selected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.levelText,
                        level === item.value && styles.selectedText,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.sectionLabel}>VIDEO LENGTH</Text>
              <View style={styles.durationRow}>
                {durations.map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => setDuration(value)}
                    style={[
                      styles.duration,
                      duration === value && styles.selected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.durationText,
                        duration === value && styles.selectedText,
                      ]}
                    >
                      {value} sec
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Multi-step loading indicator */}
              {loading && (
                <View style={styles.loadingSteps}>
                  {LOADING_STEPS.map((step, i) => (
                    <View key={step} style={styles.loadingStep}>
                      <View
                        style={[
                          styles.stepDot,
                          i === stepIndex && styles.stepDotActive,
                          i < stepIndex && styles.stepDotDone,
                        ]}
                      />
                      <Text
                        style={[
                          styles.stepText,
                          i === stepIndex && styles.stepTextActive,
                          i < stepIndex && styles.stepTextDone,
                        ]}
                      >
                        {step}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Premium CTA button */}
              <View style={styles.ctaWrapper}>
                <Button
                  label={loading ? "Creating your lesson…" : "Create my video  →"}
                  loading={loading}
                  onPress={createLesson}
                />
              </View>

              <Text style={styles.assurance}>
                Narrated • Captions included • MP4 download
              </Text>
            </View>
          </>
        )}

        {/* ── LIBRARY TAB ── */}
        {tab === "library" && (
          <>
            <Text style={styles.kicker}>YOUR LIBRARY</Text>
            <Title>Ideas, understood.</Title>
            <Body muted>Rewatch your saved lessons whenever you need them.</Body>

            {app.lessons.length === 0 ? (
              <View style={styles.empty}>
                {/* Illustration-style placeholder */}
                <View style={styles.emptyIllustration}>
                  <View style={styles.illRect1} />
                  <View style={styles.illRect2} />
                  <View style={styles.illRect3} />
                  <View style={styles.illLine1} />
                  <View style={styles.illLine2} />
                </View>
                <Text style={styles.lessonTitle}>Your library starts here.</Text>
                <Body muted>
                  Create a lesson and its video will appear here.
                </Body>
              </View>
            ) : (
              app.lessons.map((lesson, index) => (
                <Pressable
                  key={lesson.lessonId}
                  onPress={() => openLesson(lesson)}
                  style={styles.lessonRow}
                >
                  {/* Thumbnail tile with initials */}
                  <View
                    style={[
                      styles.lessonThumb,
                      { backgroundColor: thumbColor(index) },
                    ]}
                  >
                    <Text style={styles.lessonThumbText}>
                      {titleInitials(lesson.title)}
                    </Text>
                  </View>
                  <View style={styles.lessonCopy}>
                    <Text style={styles.lessonTitle}>{lesson.title}</Text>
                    <Text style={styles.lessonMeta}>
                      VIDEO LESSON  ·  {lesson.estimatedSeconds} SEC
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))
            )}
          </>
        )}

        {/* ── ACCOUNT TAB ── */}
        {tab === "account" && (
          <>
            <Text style={styles.kicker}>YOUR ACCOUNT</Text>
            <Title>Keep learning.</Title>
            <View style={styles.accountCard}>
              <Text style={styles.lessonTitle}>
                {deviceAccess ? "Creator test access" : app.isPro ? "Student Pro" : "Simi Free"}
              </Text>
              <Body muted>
                {app.isPro
                  ? "Your membership is active."
                  : "Three lessons are included with your account."}
              </Body>
              {!deviceAccess && <Button
                label={app.isPro ? "Manage membership" : "Explore Student Pro"}
                variant="secondary"
                onPress={() => router.push("/paywall")}
              />}
            </View>
            <Pressable
              style={styles.accountLink}
              onPress={() => router.push("/auth")}
            >
              <Text style={styles.linkText}>Sign in or manage account</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
            <View style={styles.accountCard}>
              <Text style={styles.lessonTitle}>Made to be accessible</Text>
              <Body muted>
                Every video includes spoken narration and readable captions.
                Saved lessons replay offline.
              </Body>
            </View>
          </>
        )}
      </ScrollView>

      {/* ── BOTTOM NAV ── */}
      <View
        style={[
          styles.navShell,
          { paddingBottom: Math.max(insets.bottom, spacing.sm) },
        ]}
      >
        {/* Top fade strip to simulate gradient */}
        <View style={styles.navFade} />
        <View style={styles.nav}>
          {(["create", "library", "account"] as Tab[]).map((item) => (
            <Pressable
              key={item}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === item }}
              onPress={() => setTab(item)}
              style={styles.navItem}
            >
              <Text
                style={[styles.navText, tab === item && styles.navActive]}
              >
                {item === "create"
                  ? "✦ Create"
                  : item === "library"
                    ? "⊡ Library"
                    : "○ Account"}
              </Text>
              {tab === item && <View style={styles.navDot} />}
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, gap: 12 },

  // ── Header ──
  brand: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  logoGlow: {
    position: "absolute",
    left: -6,
    top: -6,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.cyan,
    opacity: 0.1,
  },
  logo: { width: 39, height: 39, borderRadius: 10 },
  wordmark: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -2,
    marginLeft: 8,
  },
  wordmarkPeriod: { color: colors.cyan },
  brandSpacer: { flex: 1 },
  avatarPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelRaised,
  },
  avatarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  avatarInitials: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 0.5,
  },

  // ── Hero ──
  hero: { gap: 6, paddingVertical: 2 },
  kicker: {
    color: colors.cyan,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2.3,
  },
  heroTitle: { fontSize: 42, lineHeight: 46, letterSpacing: -1.8 },
  pulseRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  pulseCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.cyan,
    opacity: 0.95,
  },
  pulseRing: {
    position: "absolute",
    left: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.cyan,
    opacity: 0.3,
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    marginLeft: 4,
  },
  heroSubBody: { fontSize: 14, lineHeight: 20, maxWidth: 320 },

  // ── Topic tag chips ──
  tagScroll: { flexGrow: 0, marginTop: 4 },
  tagRow: { flexDirection: "row", gap: 8 },
  topicTag: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topicTagText: {
    color: colors.cyan,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // ── Form card ──
  form: {
    backgroundColor: colors.panel,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: "#34474A",
    borderTopWidth: 2,
    padding: 18,
    gap: 11,
  },

  // Three-dot strip
  dotStrip: { flexDirection: "row", gap: 6, marginBottom: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },

  sectionLabel: {
    color: colors.muted,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: "800",
  },
  input: {
    minHeight: 78,
    padding: 17,
    borderRadius: 16,
    color: colors.text,
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 18,
    lineHeight: 26,
    textAlignVertical: "top",
  },
  exampleScroll: { flexGrow: 0 },
  examples: { flexDirection: "row", gap: 8 },
  example: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.panelRaised,
  },
  exampleText: { color: colors.cyan, fontSize: 13 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 3 },
  levelRow: { flexDirection: "row", gap: 6 },
  level: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  selected: { backgroundColor: colors.cyanDark, borderColor: colors.cyan },
  levelText: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "center",
    fontWeight: "700",
  },
  selectedText: { color: colors.text },
  durationRow: { flexDirection: "row", gap: 9 },
  duration: {
    flex: 1,
    minHeight: 45,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  durationText: { color: colors.muted, fontWeight: "700", fontSize: 14 },

  // Multi-step loading
  loadingSteps: {
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  loadingStep: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  stepDotActive: { backgroundColor: colors.cyan },
  stepDotDone: { backgroundColor: colors.green },
  stepText: { color: colors.muted, fontSize: 13 },
  stepTextActive: { color: colors.cyan, fontWeight: "700" },
  stepTextDone: { color: colors.green },

  // Premium CTA
  ctaWrapper: {
    shadowColor: colors.cyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  assurance: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 11,
    letterSpacing: 0.3,
  },

  // ── Library ──
  empty: { paddingVertical: 60, alignItems: "center", gap: 16 },
  emptyIllustration: {
    width: 120,
    height: 90,
    position: "relative",
    marginBottom: 4,
  },
  illRect1: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 70,
    height: 45,
    borderRadius: 8,
    backgroundColor: colors.cyanDark,
    borderWidth: 1,
    borderColor: colors.border,
  },
  illRect2: {
    position: "absolute",
    right: 0,
    top: 10,
    width: 44,
    height: 30,
    borderRadius: 6,
    backgroundColor: "#2A2040",
    borderWidth: 1,
    borderColor: colors.border,
  },
  illRect3: {
    position: "absolute",
    left: 10,
    bottom: 0,
    width: 100,
    height: 30,
    borderRadius: 6,
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  illLine1: {
    position: "absolute",
    left: 14,
    top: 18,
    width: 42,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.cyan,
    opacity: 0.5,
  },
  illLine2: {
    position: "absolute",
    left: 14,
    top: 26,
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.amber,
    opacity: 0.4,
  },
  lessonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 14,
  },
  lessonThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  lessonThumbText: {
    color: colors.cyan,
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.5,
  },
  lessonCopy: { flex: 1, gap: 5 },
  lessonTitle: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "700",
  },
  lessonMeta: {
    color: colors.muted,
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: "700",
  },
  chevron: { color: colors.cyan, fontSize: 26 },

  // ── Account ──
  accountCard: {
    backgroundColor: colors.panel,
    padding: 20,
    borderRadius: 20,
    gap: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accountLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  linkText: { color: colors.text, fontSize: 16, fontWeight: "600" },

  // ── Bottom Nav ──
  navShell: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  navFade: {
    height: 18,
    backgroundColor: "transparent",
    borderTopWidth: 0,
    opacity: 0.85,
  },
  nav: {
    backgroundColor: "#0F1E22",
    flexDirection: "row",
    paddingTop: 9,
    borderTopWidth: 0,
    // Elevated panel feel
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 12,
  },
  navItem: {
    flex: 1,
    minHeight: 60,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  navText: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  navActive: { color: colors.text },
  navDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.cyan,
  },
});