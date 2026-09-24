import type { AudienceLevel, GenerateLessonRequest } from "@simi/lesson-schema";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Body, Button, Card, Screen, Title } from "../src/components/Primitives";
import { generateLesson } from "../src/services/lessonApi";
import { config } from "../src/services/config";
import { toAppError } from "../src/services/errors";
import { getGuestUsage, incrementGuestUsage } from "../src/services/storage";
import { useApp } from "../src/state/AppContext";
import { colors, radii, spacing } from "../src/theme";

type Tab = "learn" | "library" | "settings";
const levels: { value: AudienceLevel; label: string }[] = [
  { value: "middle-school", label: "Middle school" },
  { value: "high-school", label: "High school" },
  { value: "college", label: "College" },
];
const durations = [45, 60, 90] as const;

const newRequestId = () => `lesson-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export default function Home() {
  const insets = useSafeAreaInsets();
  const app = useApp();
  const [tab, setTab] = useState<Tab>("learn");
  const [topic, setTopic] = useState(config.fixtureMode ? "Why do planets orbit the Sun?" : "");
  const [level, setLevel] = useState<AudienceLevel>("middle-school");
  const [duration, setDuration] = useState<45 | 60 | 90>(60);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Planning a clear visual story...");

  const examples = useMemo(() => ["Why does inflation happen?", "How does photosynthesis store energy?", "Explain recursion visually"], []);

  const createLesson = async () => {
    const trimmed = topic.trim();
    if (trimmed.length < 5) {
      Alert.alert("Add a little more detail", "Enter a topic or question with at least five characters.");
      return;
    }
    if (!config.fixtureMode && !app.isPro && await getGuestUsage() >= 3) {
      router.push("/paywall");
      return;
    }
    setLoading(true);
    setStatus("Planning a clear visual story...");
    const request: GenerateLessonRequest = { topic: trimmed, audienceLevel: level, durationSeconds: duration, locale: "en-IN", requestId: newRequestId() };
    const statusTimer = setTimeout(() => setStatus("Checking every visual against the explanation..."), 4500);
    try {
      const lesson = await generateLesson(request);
      await app.addLesson(lesson);
      if (!config.fixtureMode && !app.isPro) await incrementGuestUsage();
      app.setActiveLesson(lesson);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push("/lesson");
    } catch (error) {
      const appError = toAppError(error);
      Alert.alert("Lesson not created", appError.message, appError.retryable ? [{ text: "Try again", onPress: createLesson }, { text: "Cancel", style: "cancel" }] : undefined);
    } finally {
      clearTimeout(statusTimer);
      setLoading(false);
    }
  };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 100 }]}>
        <View style={styles.brandRow}>
          <View><Text style={styles.eyebrow}>SIMI LEARN</Text><Title>Make it click.</Title></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Sign in" onPress={() => router.push("/auth")} style={styles.avatar}><Text style={styles.avatarText}>S</Text></Pressable>
        </View>

        {tab === "learn" && (
          <>
            <Body muted>Turn one hard idea into a short narrated visual lesson.</Body>
            <Card style={styles.form}>
              <Text style={styles.label}>What feels confusing?</Text>
              <TextInput
                accessibilityLabel="Topic or question"
                multiline
                value={topic}
                editable={!config.fixtureMode}
                onChangeText={setTopic}
                placeholder="e.g. Why do planets orbit the Sun?"
                placeholderTextColor={colors.muted}
                maxLength={240}
                style={styles.input}
              />
              {config.fixtureMode && <Body muted>Offline demo: this build plays the included orbit lesson. Turn off fixture mode to generate any topic.</Body>}
              {!config.fixtureMode && <View style={styles.chips}>{examples.map((example) => <Pressable key={example} onPress={() => setTopic(example)} style={styles.example}><Text style={styles.exampleText}>{example}</Text></Pressable>)}</View>}
              <Text style={styles.label}>Explain it for</Text>
              <View style={styles.segment}>{levels.map((item) => <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ selected: level === item.value }} onPress={() => setLevel(item.value)} style={[styles.segmentItem, level === item.value && styles.segmentActive]}><Text style={[styles.segmentText, level === item.value && styles.segmentTextActive]}>{item.label}</Text></Pressable>)}</View>
              <Text style={styles.label}>Lesson length</Text>
              <View style={styles.durationRow}>{durations.map((value) => <Pressable key={value} onPress={() => setDuration(value)} style={[styles.duration, duration === value && styles.durationActive]}><Text style={styles.durationText}>{value}s</Text></Pressable>)}</View>
              {loading && <Body muted style={styles.status}>{status}</Body>}
              <Button label={loading ? "Building your lesson" : "Create visual lesson"} loading={loading} onPress={createLesson} />
              <Body muted style={styles.privacy}>The lesson is validated before playback. Simi never shows a generic fallback.</Body>
            </Card>
          </>
        )}

        {tab === "library" && (
          <>
            <Title>Your lessons</Title>
            <Body muted>Saved on this device for replay without generating again.</Body>
            {app.lessons.length === 0 ? <Card><Body>No lessons yet. Create your first visual explanation.</Body></Card> : app.lessons.map((lesson) => (
              <Pressable key={lesson.lessonId} onPress={() => { app.setActiveLesson(lesson); router.push("/lesson"); }}>
                <Card style={styles.lessonCard}>
                  <View style={styles.lessonBadge}><Text style={styles.lessonBadgeText}>{lesson.scenes.length} scenes</Text></View>
                  <Text style={styles.lessonTitle}>{lesson.title}</Text>
                  <Body muted>{lesson.summary}</Body>
                  <Text style={styles.open}>Replay lesson →</Text>
                </Card>
              </Pressable>
            ))}
          </>
        )}

        {tab === "settings" && (
          <>
            <Title>Learning settings</Title>
            <Card style={styles.settings}>
              <SettingRow label="Captions" description="Show a concise explanation under each visual" value={app.settings.captions} onChange={(captions) => app.updateSettings({ ...app.settings, captions })} />
              <SettingRow label="Reduce motion" description="Replace movement with gentle reveals" value={app.settings.reducedMotion} onChange={(reducedMotion) => app.updateSettings({ ...app.settings, reducedMotion })} />
              <Text style={styles.label}>Narration speed</Text>
              <View style={styles.durationRow}>{[0.8, 1, 1.2].map((rate) => <Pressable key={rate} onPress={() => app.updateSettings({ ...app.settings, speechRate: rate })} style={[styles.duration, app.settings.speechRate === rate && styles.durationActive]}><Text style={styles.durationText}>{rate}×</Text></Pressable>)}</View>
            </Card>
            <Card><Text style={styles.lessonTitle}>{app.isPro ? "Student Pro active" : "Free plan"}</Text><Body muted>{app.isPro ? "Up to 30 generated lessons per billing period." : "Three complete lessons are included."}</Body><Button label={app.isPro ? "Manage membership" : "View Student Pro"} variant="secondary" onPress={() => router.push("/paywall")} /></Card>
          </>
        )}
      </ScrollView>
      <View style={[styles.nav, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        {(["learn", "library", "settings"] as Tab[]).map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={styles.navItem}><Text style={[styles.navText, tab === item && styles.navActive]}>{item === "learn" ? "Learn" : item === "library" ? "Library" : "Settings"}</Text></Pressable>)}
      </View>
    </Screen>
  );
}

function SettingRow({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.settingRow}><View style={styles.settingCopy}><Text style={styles.label}>{label}</Text><Body muted>{description}</Body></View><Switch value={value} onValueChange={onChange} trackColor={{ true: colors.cyanDark }} thumbColor={value ? colors.cyan : colors.muted} /></View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { color: colors.cyan, fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.violet, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.ink, fontSize: 18, fontWeight: "900" },
  form: { gap: spacing.md },
  label: { color: colors.text, fontSize: 15, fontWeight: "800" },
  input: { minHeight: 116, padding: spacing.md, borderRadius: radii.md, color: colors.text, backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.border, fontSize: 18, lineHeight: 26, textAlignVertical: "top" },
  chips: { gap: spacing.xs },
  example: { paddingVertical: spacing.sm },
  exampleText: { color: colors.cyan, fontSize: 14 },
  segment: { flexDirection: "row", backgroundColor: colors.ink, borderRadius: radii.md, padding: 4 },
  segmentItem: { flex: 1, paddingVertical: spacing.sm, alignItems: "center", borderRadius: radii.sm },
  segmentActive: { backgroundColor: colors.panelRaised },
  segmentText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  segmentTextActive: { color: colors.text },
  durationRow: { flexDirection: "row", gap: spacing.sm },
  duration: { flex: 1, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, alignItems: "center" },
  durationActive: { backgroundColor: colors.cyanDark, borderColor: colors.cyan },
  durationText: { color: colors.text, fontWeight: "800" },
  status: { textAlign: "center" },
  privacy: { textAlign: "center", fontSize: 12, lineHeight: 18 },
  lessonCard: { gap: spacing.sm },
  lessonBadge: { alignSelf: "flex-start", backgroundColor: colors.cyanDark, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.pill },
  lessonBadgeText: { color: colors.cyan, fontWeight: "800", fontSize: 12 },
  lessonTitle: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "800" },
  open: { color: colors.cyan, fontSize: 15, fontWeight: "800", marginTop: spacing.xs },
  settings: { gap: spacing.lg },
  settingRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  settingCopy: { flex: 1, gap: spacing.xs },
  nav: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", paddingTop: spacing.sm, backgroundColor: colors.panel, borderTopWidth: 1, borderTopColor: colors.border },
  navItem: { flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center" },
  navText: { color: colors.muted, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  navActive: { color: colors.cyan },
});
