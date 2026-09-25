import * as Sharing from "expo-sharing";
import { useEventListener } from "expo";
import { router } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Button } from "./Primitives";
import { colors, spacing } from "../theme";

interface LessonPlayerProps {
  videoUri: string;
  /** Estimated lesson length in seconds — drives the metadata chip display. */
  durationSeconds?: number;
}

export function LessonPlayer({ videoUri, durationSeconds }: LessonPlayerProps) {
  const [ended, setEnded] = useState(false);
  const player = useVideoPlayer(videoUri, (instance) => {
    instance.play();
  });

  useEventListener(player, "playToEnd", () => setEnded(true));

  const share = async () => {
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert(
        "Sharing unavailable",
        "Your MP4 remains saved in Simi for offline replay.",
      );
      return;
    }
    await Sharing.shareAsync(videoUri, {
      mimeType: "video/mp4",
      dialogTitle: "Save or share your Simi lesson",
    });
  };

  const durationChip = durationSeconds ? `${durationSeconds} SEC` : "60 SEC";

  return (
    <View style={styles.root}>
      {/* ── Video container with cyan border ── */}
      <View style={styles.videoFrame}>
        <VideoView
          player={player}
          style={styles.video}
          nativeControls
          contentFit="contain"
          fullscreenOptions={{ enable: true, orientation: "landscape" }}
        />
      </View>

      {/* ── Completion badge ── */}
      {ended && (
        <View style={styles.completionBadge}>
          <View style={styles.completionDot} />
          <Text style={styles.completionText}>Lesson complete ✓</Text>
        </View>
      )}

      {/* ── Metadata chips row ── */}
      <View style={styles.metaRow}>
        <MetaChip label={durationChip} />
        <MetaChip label="NARRATED" accent />
        <MetaChip label="CAPTIONS" />
        <MetaChip label="OFFLINE READY" accent />
      </View>

      {/* ── Note ── */}
      <Text style={styles.note}>
        A complete narrated video, saved for offline replay.
      </Text>

      {/* ── Primary download/share CTA ── */}
      <View style={styles.downloadWrapper}>
        <Button
          label="↓ Save & Share Video"
          variant="primary"
          onPress={() => void share()}
        />
      </View>

      {/* ── Quiz CTA (after video ends) ── */}
      {ended && (
        <Button
          label="Check what you learned"
          variant="secondary"
          onPress={() => {
            router.push("/quiz");
          }}
        />
      )}
    </View>
  );
}

// ── MetaChip sub-component ──
function MetaChip({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <View style={[styles.chip, accent && styles.chipAccent]}>
      <Text style={[styles.chipText, accent && styles.chipTextAccent]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },

  // Video frame with cyan border
  videoFrame: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.cyan,
    overflow: "hidden",
    // Subtle glow effect
    shadowColor: colors.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  video: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: colors.ink,
  },

  // Completion badge
  completionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "center",
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "#1A3020",
    borderWidth: 1,
    borderColor: colors.green,
  },
  completionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  completionText: {
    color: colors.green,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // Metadata chips
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.panelRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipAccent: {
    backgroundColor: colors.cyanDark,
    borderColor: colors.cyan,
  },
  chipText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  chipTextAccent: {
    color: colors.cyan,
  },

  note: { color: colors.muted, textAlign: "center", fontSize: 14 },

  // Download button with glow
  downloadWrapper: {
    shadowColor: colors.cyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 6,
  },
});
