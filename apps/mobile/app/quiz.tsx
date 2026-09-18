import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Body, Button, Card, ProgressBar, Screen, Title } from "../src/components/Primitives";
import { submitLessonFeedback } from "../src/services/lessonApi";
import { useApp } from "../src/state/AppContext";
import { colors, radii, spacing } from "../src/theme";

export default function QuizScreen() {
  const insets = useSafeAreaInsets();
  const { activeLesson } = useApp();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  if (!activeLesson) return <Screen><View style={styles.center}><Button label="Back home" onPress={() => router.replace("/")} /></View></Screen>;
  const question = activeLesson.quiz[index]!;
  const isCorrect = selected === question.correctIndex;

  const next = () => {
    const nextScore = score + (isCorrect ? 1 : 0);
    if (index === activeLesson.quiz.length - 1) {
      setScore(nextScore);
      setDone(true);
      submitLessonFeedback({ lessonId: activeLesson.lessonId, event: "quiz_completed", quizScore: nextScore, quizTotal: activeLesson.quiz.length }).catch(() => undefined);
    } else {
      setScore(nextScore);
      setIndex((value) => value + 1);
      setSelected(null);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}>
        {!done ? <>
          <Body muted>Check {index + 1} of {activeLesson.quiz.length}</Body>
          <ProgressBar value={(index + 1) / activeLesson.quiz.length} />
          <Title>{question.question}</Title>
          <View style={styles.choices}>{question.choices.map((choice, choiceIndex) => <Pressable key={choice} accessibilityRole="radio" accessibilityState={{ selected: selected === choiceIndex }} onPress={() => selected === null && setSelected(choiceIndex)} style={[styles.choice, selected === choiceIndex && (isCorrect ? styles.correct : styles.wrong), selected !== null && choiceIndex === question.correctIndex && styles.correct]}><Text style={styles.choiceText}>{choice}</Text></Pressable>)}</View>
          {selected !== null && <Card style={isCorrect ? styles.feedbackCorrect : styles.feedbackWrong}><Text style={styles.feedbackTitle}>{isCorrect ? "Exactly." : "Close—look at the relationship again."}</Text><Body>{question.explanation}</Body></Card>}
          <Button label={index === activeLesson.quiz.length - 1 ? "See result" : "Next question"} disabled={selected === null} onPress={next} />
        </> : <>
          <Text style={styles.score}>{score}/{activeLesson.quiz.length}</Text>
          <Title>{score === activeLesson.quiz.length ? "The idea clicked." : "One replay will make it stick."}</Title>
          <Body muted>{activeLesson.summary}</Body>
          <Card><Text style={styles.feedbackTitle}>Visual recap</Text><Body>{activeLesson.summary}</Body></Card>
          <Button label="Share recap" variant="secondary" onPress={() => { void Share.share({ message: `${activeLesson.title}\n\n${activeLesson.summary}\n\nLearned with Simi Learn.` }); }} />
          <Button label="Replay lesson" onPress={() => router.replace("/lesson")} />
          <Button label="Back to library" variant="secondary" onPress={() => router.replace("/")} />
        </>}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  choices: { gap: spacing.sm },
  choice: { minHeight: 56, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, justifyContent: "center", padding: spacing.md },
  correct: { borderColor: colors.green, backgroundColor: "#123326" },
  wrong: { borderColor: colors.red, backgroundColor: "#381A24" },
  choiceText: { color: colors.text, fontSize: 16, fontWeight: "700" },
  feedbackCorrect: { borderColor: colors.green },
  feedbackWrong: { borderColor: colors.amber },
  feedbackTitle: { color: colors.text, fontSize: 18, fontWeight: "900", marginBottom: spacing.xs },
  score: { color: colors.cyan, fontSize: 72, fontWeight: "900", textAlign: "center" },
});
