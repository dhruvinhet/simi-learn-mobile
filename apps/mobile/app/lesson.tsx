import { router } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LessonPlayer } from "../src/components/LessonPlayer";
import { Body, Button, Screen, Title } from "../src/components/Primitives";
import { useApp } from "../src/state/AppContext";
import { colors, spacing } from "../src/theme";

export default function LessonScreen() {
  const insets = useSafeAreaInsets();
  const { activeLesson, settings } = useApp();
  const [complete, setComplete] = useState(false);
  const onComplete = useCallback(() => setComplete(true), []);

  if (!activeLesson) return <Screen><View style={[styles.empty, { paddingTop: insets.top }]}><Title>Lesson unavailable</Title><Body muted>Open a saved lesson from your library.</Body><Button label="Back to library" onPress={() => router.replace("/")} /></View></Screen>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.top}><Button label="Back" variant="quiet" onPress={() => router.back()} /><Text style={styles.time}>{activeLesson.estimatedSeconds}s lesson</Text></View>
        <Title>{activeLesson.title}</Title>
        <LessonPlayer lesson={activeLesson} settings={settings} onComplete={onComplete} />
        {complete && <View style={styles.finish}><Title>Now test the idea.</Title><Body muted>Two quick questions help the explanation stick.</Body><Button label="Take the 30-second check" onPress={() => router.push("/quiz")} /></View>}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  time: { color: colors.muted, fontWeight: "700" },
  finish: { gap: spacing.md, paddingTop: spacing.md },
  empty: { flex: 1, padding: spacing.lg, justifyContent: "center", gap: spacing.md },
});
