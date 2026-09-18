import type { Lesson } from "@simi/lesson-schema";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Body, Button, ProgressBar } from "./Primitives";
import { SceneCanvas } from "./SceneCanvas";
import { colors, radii, spacing } from "../theme";
import type { AppSettings } from "../services/storage";

type Props = {
  lesson: Lesson;
  settings: AppSettings;
  onComplete: () => void;
};

export function LessonPlayer({ lesson, settings, onComplete }: Props) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const scene = lesson.scenes[sceneIndex]!;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goTo = (next: number) => {
    Speech.stop();
    if (timer.current) clearTimeout(timer.current);
    setSceneIndex(Math.max(0, Math.min(lesson.scenes.length - 1, next)));
    setPlaying(true);
  };

  useEffect(() => {
    Speech.stop();
    if (!playing) return;
    let ended = false;
    Speech.speak(scene.narration, {
      language: lesson.locale,
      rate: settings.speechRate,
      onDone: () => {
        if (ended) return;
        if (sceneIndex < lesson.scenes.length - 1) {
          Haptics.selectionAsync();
          setSceneIndex((value) => value + 1);
        } else {
          setPlaying(false);
          onComplete();
        }
      },
      onError: () => {
        timer.current = setTimeout(() => {
          if (sceneIndex < lesson.scenes.length - 1) setSceneIndex((value) => value + 1);
          else onComplete();
        }, scene.durationSeconds * 1000);
      },
    });
    timer.current = setTimeout(() => {
      Speech.stop();
      if (sceneIndex < lesson.scenes.length - 1) setSceneIndex((value) => value + 1);
      else {
        setPlaying(false);
        onComplete();
      }
    }, Math.max(10, scene.durationSeconds + 4) * 1000);
    return () => {
      ended = true;
      Speech.stop();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [sceneIndex, playing, lesson.locale, scene, settings.speechRate, onComplete]);

  const toggle = () => {
    if (playing) {
      Speech.stop();
      if (timer.current) clearTimeout(timer.current);
      setPlaying(false);
    } else setPlaying(true);
  };

  return (
    <View style={styles.root}>
      <View style={styles.meta}>
        <Body muted>Scene {sceneIndex + 1} of {lesson.scenes.length}</Body>
        <Body muted>{scene.durationSeconds}s</Body>
      </View>
      <ProgressBar value={(sceneIndex + 1) / lesson.scenes.length} />
      <SceneCanvas scene={scene} reducedMotion={settings.reducedMotion} />
      <Text accessibilityRole="header" style={styles.goal}>{scene.learningGoal}</Text>
      {settings.captions && <View style={styles.caption}><Text style={styles.captionText}>{scene.caption}</Text></View>}
      <View style={styles.controls}>
        <Button label="Previous" variant="secondary" disabled={sceneIndex === 0} onPress={() => goTo(sceneIndex - 1)} />
        <Pressable accessibilityRole="button" accessibilityLabel={playing ? "Pause narration" : "Play narration"} onPress={toggle} style={styles.play}>
          <Text style={styles.playText}>{playing ? "Ⅱ" : "▶"}</Text>
        </Pressable>
        <Button label="Next" variant="secondary" disabled={sceneIndex === lesson.scenes.length - 1} onPress={() => goTo(sceneIndex + 1)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  meta: { flexDirection: "row", justifyContent: "space-between" },
  goal: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: "800" },
  caption: { backgroundColor: colors.cyanDark, borderRadius: radii.md, padding: spacing.md },
  captionText: { color: colors.text, fontSize: 17, lineHeight: 25, fontWeight: "600", textAlign: "center" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  play: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.cyan, alignItems: "center", justifyContent: "center" },
  playText: { color: colors.ink, fontSize: 22, fontWeight: "900" },
});
